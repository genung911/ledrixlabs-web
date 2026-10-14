#!/usr/bin/env node
// ─── Regression: /api/render-pdf fails closed and renders only for the configured key (Security C1) ───
//
// (Security C1, 2026-10-11.) The route skipped its key check whenever RENDER_PDF_SECRET was unset —
// the production state — so anyone could make the paid remote browser render arbitrary HTML, and its
// errors returned the upstream message as `detail`. This drives the REAL route (transpiled with the
// repo's TypeScript) with `puppeteer-core` replaced by a recording fake: no browser, no network, no
// paid call. Every check records whether the remote browser was reached.
//
//   node scripts/verify-render-pdf.mjs
//   WEB_SRC=<dir> node scripts/verify-render-pdf.mjs   # run against another checkout (e.g. HEAD)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'node:module';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const src  = process.env.WEB_SRC ? join(process.env.WEB_SRC) : repo;
const require = createRequire(join(repo, 'package.json'));
const ts = require('typescript');

let checks = 0; const failures = [];
const ok = (label, cond, detail) => { checks++; if (!cond) failures.push(detail ? `${label}\n      ${detail}` : label); };

// ── Fake puppeteer-core ────────────────────────────────────────────────────────────────
const WS = 'wss://browser.example.invalid/?token=WS-SECRET-TOKEN';
const PDF_BYTES = Uint8Array.from(Buffer.from('%PDF-1.7 fake-render'));
let log, fault;
const reset = () => { log = { connects: [], content: [], pdfOpts: [], closed: 0, js: [], intercept: [], requests: [] }; fault = null; };
// Every URL the submitted HTML would make a browser fetch (src / href attributes).
const urlsIn = (html) => [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
const fakePuppeteer = {
  async connect({ browserWSEndpoint }) {
    log.connects.push(browserWSEndpoint);
    if (fault === 'connect') throw new Error(`connect refused at ${browserWSEndpoint} (INTERNAL-UPSTREAM-DETAIL)`);
    if (fault === 'evil-name') { const e = new Error('INTERNAL-UPSTREAM-DETAIL'); e.name = `Bad ${browserWSEndpoint}`; throw e; }
    if (fault === 'non-error') throw `raw string ${browserWSEndpoint} INTERNAL-UPSTREAM-DETAIL`;
    return {
      async newPage() {
        // The page enforces what a real one does: JavaScript and interception state are recorded at
        // load time, and every URL in the HTML is offered to the route's request handler, whose
        // continue/abort decision is recorded. (A real Chrome run of the same settings is in the
        // W1 report; this fake proves the ROUTE configures them and decides correctly.)
        let jsEnabled = true, intercepting = false, onRequest = null;
        return {
          async setJavaScriptEnabled(v) { log.js.push(v); jsEnabled = v; },
          async setRequestInterception(v) { log.intercept.push(v); intercepting = v; },
          on(ev, fn) { if (ev === 'request') onRequest = fn; },
          async setContent(html, opts) {
            log.content.push({ html, opts, jsAtLoad: jsEnabled, interceptAtLoad: intercepting });
            for (const u of urlsIn(html)) {
              const req = { decision: null, url: () => u, isInterceptResolutionHandled() { return this.decision !== null; },
                continue() { this.decision = 'continue'; return Promise.resolve(); },
                abort(reason) { this.decision = `abort:${reason}`; return Promise.resolve(); } };
              if (intercepting && onRequest) onRequest(req); else req.decision = 'NOT INTERCEPTED';
              log.requests.push({ url: u, decision: req.decision });
            }
            if (fault === 'load') { const e = new Error(`Navigation failed: ${html.slice(0, 80)} via ${WS}`); e.name = 'TimeoutError'; throw e; }
          },
          async evaluate() { return null; },
          async pdf(opts) {
            log.pdfOpts.push(opts);
            if (fault === 'pdf') throw new Error('Protocol error: Page.printToPDF INTERNAL-UPSTREAM-DETAIL');
            return PDF_BYTES;
          },
        };
      },
      async close() { log.closed++; },
    };
  },
};
// ── Fake Supabase (C1b): Auth verifies sessions; REST answers AS the user (RLS) ─────────────────
const SUPA = 'https://supa.test', ANON = 'anon-public-key';
const SESSIONS = { 'jwt-inspector': 'u-insp', 'jwt-homeowner': 'u-home', 'jwt-rpcdown': 'u-rpcdown' };
const PROFILES = new Set(['u-insp', 'u-rpcdown']);
let supaLog = [];
// Daily render budget (2026-10-14): the service-role counter. renderCounts[uid] = today's count.
const SERVICE_KEY = 'service-role-key';
let renderCounts = {}; let counterDown = false;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  // No network: anything but the fake Supabase origin is a test failure, never a real request.
  if (u.origin !== SUPA) throw new Error(`unexpected network request to ${u.origin}`);
  const h = init.headers ?? {}; const tok = String(h.Authorization ?? '').replace(/^Bearer /, '');
  supaLog.push({ path: u.pathname, apikey: h.apikey, auth: h.Authorization });
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.pathname === '/auth/v1/user') {
    if (tok === 'jwt-expired') return json(401, { msg: 'JWT expired' });
    if (tok === 'jwt-revoked') return json(403, { msg: 'session_not_found' });
    if (tok === 'jwt-authdown') return json(500, { msg: 'INTERNAL-UPSTREAM-DETAIL auth db down' });
    return SESSIONS[tok] ? json(200, { id: SESSIONS[tok], aud: 'authenticated' }) : json(401, { msg: 'invalid JWT' });
  }
  if (u.pathname === '/rest/v1/rpc/increment_render_usage') {
    if (tok !== SERVICE_KEY || h.apikey !== SERVICE_KEY) return json(401, { msg: 'permission denied' });   // service role only
    if (counterDown) return json(500, { msg: 'INTERNAL-UPSTREAM-DETAIL counter' });
    const { uid: who, d } = JSON.parse(init.body);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return json(400, {});
    renderCounts[who] = (renderCounts[who] ?? 0) + 1;
    return json(200, renderCounts[who]);
  }
  const uid = SESSIONS[tok];
  if (!uid) return json(401, { msg: 'invalid JWT' });
  if (u.pathname === '/rest/v1/inspector_profiles') {
    const want = /^eq\.(.*)$/.exec(u.searchParams.get('id') ?? '')?.[1];
    return json(200, want === uid && PROFILES.has(uid) ? [{ id: uid }] : []);   // RLS: own row only
  }
  if (u.pathname === '/rest/v1/rpc/can_create_under_inspection') {
    if (uid === 'u-rpcdown') return json(500, { msg: 'INTERNAL-UPSTREAM-DETAIL rpc' });
    const { p_inspection_id } = JSON.parse(init.body);
    return json(200, uid === 'u-insp' && p_inspection_id === 'insp_ok');
  }
  return json(404, {});
};
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'puppeteer-core') return { __esModule: true, default: fakePuppeteer };
  return realLoad.call(this, request, ...rest);
};

// ── Load the real route once per environment configuration ─────────────────────────────
function build(tag, env) {
  // Transpiled and compiled IN MEMORY — the harness writes and deletes nothing.
  const file = join(src, 'app/api/render-pdf/route.ts');
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const saved = { ...process.env };
  delete process.env.RENDER_PDF_SECRET; delete process.env.BROWSERLESS_WS_ENDPOINT; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  Object.assign(process.env, env);
  const mod = new Module(`${file}#${tag}`);
  mod.filename = join(repo, `route.${tag}.js`);   // resolution base only — never written
  mod.paths = Module._nodeModulePaths(repo);
  mod._compile(js, mod.filename);
  process.env = saved;
  return mod.exports;
}
const KEY = 'app-render-key-19ch';   // same length as the shipped key; the value is a stand-in
const SUPA_ENV = { NEXT_PUBLIC_SUPABASE_URL: `${SUPA}/rest/v1`, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON };   // suffix as in production
const live   = build('live',   { RENDER_PDF_SECRET: KEY, BROWSERLESS_WS_ENDPOINT: WS, ...SUPA_ENV });
const nokey  = build('nokey',  { BROWSERLESS_WS_ENDPOINT: WS, ...SUPA_ENV });
const nows   = build('nows',   { RENDER_PDF_SECRET: KEY, ...SUPA_ENV });
const nosupa = build('nosupa', { RENDER_PDF_SECRET: KEY, BROWSERLESS_WS_ENDPOINT: WS });
const budget = build('budget', { RENDER_PDF_SECRET: KEY, BROWSERLESS_WS_ENDPOINT: WS, ...SUPA_ENV, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });

const { NextRequest } = require('next/server');
// Everything the route logs, per call and across the whole run.
const allLogs = [];
const realConsoleError = console.error;
const call = async (mod, { key, headers = {}, body = JSON.stringify({ html: '<h1>REPORT-CONTENT</h1>' }), withFault = null } = {}) => {
  reset(); fault = withFault; supaLog = [];
  const logs = [];
  console.error = (...args) => { const line = args.map(a => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) ?? String(a); } catch { return String(a); } })())).join(' '); logs.push(line); allLogs.push(line); };
  const h = { 'Content-Type': 'application/json', ...headers };
  if (key !== undefined) h['x-render-key'] = key;
  let res;
  try { res = await mod.POST(new NextRequest('https://www.ledrixlabs.com/api/render-pdf', { method: 'POST', headers: h, body })); }
  finally { console.error = realConsoleError; }
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, cache: res.headers.get('cache-control'), reached: log.connects.length, closed: log.closed, log, logs };
};
const LEAKS = /RENDER_PDF|BROWSERLESS|SECRET|INTERNAL-UPSTREAM|WS-SECRET|token=|wss:/i;
// What must never reach the server log: the browser URL/token, upstream text, report HTML. (Naming a
// missing env var in the LOG is fine and useful; it is never in a response.)
const LOG_LEAKS = /INTERNAL-UPSTREAM|WS-SECRET|token=|wss:|browser\.example|REPORT-CONTENT|<h1|raw string/i;

// ── 1. Fails closed when the server secret is missing ──────────────────────────────────
// C1b: with no RENDER_PDF_SECRET the static-key path is OFF (that is how the key is retired); without
// a verified session nothing renders — 401, generic, browser never reached. (C1 answered 503 here; a
// missing secret no longer means "nothing can authenticate", since sessions now can.)
for (const key of [undefined, '', KEY, 'anything']) {
  const r = await call(nokey, { key });
  ok(`no RENDER_PDF_SECRET, no session → 401 and the browser is never reached (key ${JSON.stringify(key)})`,
    r.status === 401 && r.reached === 0, `status ${r.status}, reached ${r.reached}`);
  ok(`no RENDER_PDF_SECRET, no session → generic body naming no configuration (key ${JSON.stringify(key)})`,
    JSON.stringify(r.json) === '{"error":"unauthorized"}' && !LEAKS.test(r.text), r.text);
}

// ── 2. Missing / incorrect credentials ─────────────────────────────────────────────────
const wrong = {
  'missing header': undefined,
  'empty header': '',
  'same length, different value': 'x'.repeat(KEY.length),
  'key plus a suffix': KEY + 'x',
  'key minus its last char': KEY.slice(0, -1),
  'case-changed key': KEY.toUpperCase(),
  // (Leading/trailing spaces are not a different credential: the Fetch spec strips them from
  // header values before the route sees them, so ` ${KEY} ` arrives as KEY. An inner space does not.)
  'key with an inner space': `${KEY.slice(0, 5)} ${KEY.slice(5)}`,
};
for (const [label, key] of Object.entries(wrong)) {
  const r = await call(live, { key });
  ok(`${label} → 401 and the browser is never reached`, r.status === 401 && r.reached === 0 && r.json?.error === 'unauthorized',
    `status ${r.status}, reached ${r.reached}, body ${r.text}`);
}
{
  const r = await call(live, { headers: { Authorization: `Bearer ${KEY}` } });
  ok('the key in Authorization instead of x-render-key → 401', r.status === 401 && r.reached === 0, `status ${r.status}`);
}
{
  const r = await call(live, { key: 'wrong', body: '{not json' });
  ok('a wrong key is refused before the body is even parsed (401, not 400)', r.status === 401 && r.reached === 0, `status ${r.status}`);
}

// ── 3. Correct credentials render, exactly as before ───────────────────────────────────
{
  const html = '<html><body><h1>Inspection</h1><img src="https://example.invalid/x.jpg"></body></html>';
  const r = await call(live, { key: KEY, body: JSON.stringify({ html }) });
  const decoded = r.json?.pdf ? Buffer.from(r.json.pdf, 'base64') : null;
  ok('correct key → 200 with the PDF as base64 (the shape the app reads)', r.status === 200 && decoded && Buffer.compare(decoded, Buffer.from(PDF_BYTES)) === 0,
    `status ${r.status}, body ${r.text.slice(0, 120)}`);
  ok('correct key → connects to the configured remote browser', r.log.connects.length === 1 && r.log.connects[0] === WS, JSON.stringify(r.log.connects));
  ok('correct key → renders the posted HTML unchanged', r.log.content[0]?.html === html && r.log.content[0]?.opts?.waitUntil === 'domcontentloaded',
    JSON.stringify(r.log.content[0]?.opts));
  const o = r.log.pdfOpts[0] ?? {};
  ok('correct key → Letter, background, footer template with page numbers, same margins',
    o.format === 'Letter' && o.printBackground === true && o.displayHeaderFooter === true && /pageNumber/.test(o.footerTemplate ?? '') && /totalPages/.test(o.footerTemplate ?? '')
      && o.margin?.top === '0.4in' && o.margin?.bottom === '0.6in' && o.margin?.left === '0.4in' && o.margin?.right === '0.4in', JSON.stringify(o));
  ok('correct key → no-store, browser closed', r.cache === 'no-store' && r.closed === 1, `cache ${r.cache}, closed ${r.closed}`);
}

// ── 4. Validation after auth (unchanged behaviour) ─────────────────────────────────────
{
  const r = await call(live, { key: KEY, body: '{not json' });
  ok('correct key + malformed JSON → 400, browser never reached', r.status === 400 && r.reached === 0 && r.json?.error === 'invalid json body', r.text);
}
for (const body of [JSON.stringify({}), JSON.stringify({ html: '   ' }), JSON.stringify({ html: 42 })]) {
  const r = await call(live, { key: KEY, body });
  ok(`correct key + no usable html (${body}) → 400, browser never reached`, r.status === 400 && r.reached === 0 && r.json?.error === 'missing html', r.text);
}

// ── 5. Generic errors: nothing internal reaches the caller ─────────────────────────────
{
  const r = await call(nows, { key: KEY });
  ok('secret set but no browser endpoint → 503 generic, never reached', r.status === 503 && r.reached === 0 && JSON.stringify(r.json) === '{"error":"render unavailable"}' && !LEAKS.test(r.text), r.text);
}
{
  const r = await call(nows, { key: 'wrong' });
  ok('secret set but no browser endpoint, wrong key → 401 (auth decided first)', r.status === 401, `status ${r.status}`);
}
for (const f of ['connect', 'pdf']) {
  const r = await call(live, { key: KEY, withFault: f });
  ok(`remote browser failure (${f}) → 500 with exactly {"error":"render failed"}`, r.status === 500 && JSON.stringify(r.json) === '{"error":"render failed"}', r.text);
  ok(`remote browser failure (${f}) → no upstream text, endpoint or token in the response`, !LEAKS.test(r.text) && !('detail' in (r.json ?? {})), r.text);
}
{
  const r = await call(live, { key: KEY, withFault: 'pdf' });
  ok('a failure after connecting still closes the browser', r.closed === 1, `closed ${r.closed}`);
}

// ── 5b. The server LOG carries the failing step and error class — never the exception text ──
for (const [f, step, kind] of [['connect', 'connect', 'Error'], ['load', 'load', 'TimeoutError'], ['pdf', 'print', 'Error'],
                               ['evil-name', 'connect', 'Error'], ['non-error', 'connect', 'Error']]) {
  const r = await call(live, { key: KEY, withFault: f });
  ok(`failure "${f}" → 500 generic and exactly one log line`, r.status === 500 && r.logs.length === 1 && JSON.stringify(r.json) === '{"error":"render failed"}', JSON.stringify(r.logs));
  ok(`failure "${f}" → log names step "${step}" and class ${kind}`, r.logs[0] === `[render-pdf] render failed at step "${step}" (${kind})`, JSON.stringify(r.logs));
  ok(`failure "${f}" → log carries no URL, token, upstream text or report HTML`, !r.logs.some(l => LOG_LEAKS.test(l)), JSON.stringify(r.logs));
}

// ── 5c. Across every call in this run, nothing sensitive was ever logged ───────────────
ok(`no log line in the whole run carries a URL, token, upstream text or report HTML (${allLogs.length} lines)`,
  allLogs.length > 0 && !allLogs.some(l => LOG_LEAKS.test(l)), JSON.stringify(allLogs.filter(l => LOG_LEAKS.test(l))));

// ── 7. C1b · a signed-in INSPECTOR session renders; nothing else does ─────────────────────────
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const ok200 = (r) => r.status === 200 && r.reached === 1 && !!r.json?.pdf;
{
  const r = await call(nokey, { headers: bearer('jwt-inspector'), body: JSON.stringify({ html: '<h1>REPORT-CONTENT</h1>', inspectionId: 'insp_ok' }) });
  ok('C1b: inspector session + own inspection → renders, with NO static key configured (durable path)', ok200(r), `${r.status} ${r.text.slice(0, 80)}`);
  ok('C1b: the route asks Supabase AS the user (apikey = anon, bearer = the user\'s token — never a service key)',
    r.log && supaLog.length === 3 && supaLog.every(x => x.apikey === ANON && x.auth === 'Bearer jwt-inspector'), JSON.stringify(supaLog));
}
for (const [label, opts, want] of [
  // The database's verdict is SIMULATED here (insp_other → false). This proves the route REFUSES when
  // the authorization check says no — not that the check says no for another company: the real
  // helper's semantics are exercised against real SQL by ledrix-app/scripts/verify-render-authz-sql.mjs.
  ['the authorization check answers false (simulated)', { headers: bearer('jwt-inspector'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_other' }) }, 403],
  ['a homeowner account (no inspector profile)',     { headers: bearer('jwt-homeowner'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) }, 403],
  ['identity claimed in the BODY is ignored',        { headers: bearer('jwt-homeowner'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok', userId: 'u-insp' }) }, 403],
  ['an expired session',                             { headers: bearer('jwt-expired'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) }, 401],
  ['a revoked session',                              { headers: bearer('jwt-revoked'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) }, 401],
  ['a forged / unknown token',                       { headers: bearer('not-a-session'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) }, 401],
  ['the public anon key presented as a session',     { headers: bearer(ANON), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) }, 401],
  ['a malformed Authorization header',               { headers: { Authorization: 'Bearer jwt-inspector extra' }, body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) }, 401],
  ['Basic instead of Bearer',                        { headers: { Authorization: 'Basic jwt-inspector' }, body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) }, 401],
  ['missing inspectionId',                           { headers: bearer('jwt-inspector'), body: JSON.stringify({ html: '<p>x</p>' }) }, 400],
  ['a path-shaped inspectionId',                     { headers: bearer('jwt-inspector'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp/../x' }) }, 400],
  ['a non-string inspectionId',                      { headers: bearer('jwt-inspector'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 42 }) }, 400],
  ['oversized html',                                 { headers: bearer('jwt-inspector'), body: JSON.stringify({ html: 'x'.repeat(6_000_001), inspectionId: 'insp_ok' }) }, 413],
  ['Supabase Auth down',                             { headers: bearer('jwt-authdown'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) }, 503],
  ['the authorization check down',                   { headers: bearer('jwt-rpcdown'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) }, 503],
]) {
  const r = await call(nokey, opts);
  ok(`C1b: ${label} → ${want}, browser never reached, generic body`, r.status === want && r.reached === 0 && !LEAKS.test(r.text) && !/jwt-|u-insp|u-home/.test(r.text),
    `${r.status} ${r.text.slice(0, 120)}`);
}
{
  const r = await call(nosupa, { headers: bearer('jwt-inspector'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) });
  ok('C1b: session but NO Supabase config (and no key) → 503, never reached', r.status === 503 && r.reached === 0, `${r.status}`);
}
// Transition: installed builds send the key (and, once updated, a session too).
{
  // Final review (2026-10-11): a PRESENTED session is decisive — an invalid or unverifiable one is
  // refused even with the valid static key (the client then refreshes once, or falls back on-device).
  const r = await call(live, { key: KEY, headers: bearer('jwt-expired') });
  ok('C1b: an EXPIRED session cannot fall back to the static key (401, never reached)', r.status === 401 && r.reached === 0, `${r.status}`);
  const rf = await call(live, { key: KEY, headers: bearer('not-a-session') });
  ok('C1b: a FORGED session cannot fall back to the static key (401, never reached)', rf.status === 401 && rf.reached === 0, `${rf.status}`);
  const ra = await call(live, { key: KEY, headers: bearer('jwt-authdown') });
  ok('C1b: an UNVERIFIABLE session (Auth down) cannot fall back to the static key (503, never reached)', ra.status === 503 && ra.reached === 0, `${ra.status}`);
  const rk = await call(live, { key: KEY });
  ok('C1b transition: NO session + the valid static key (secret still set) → renders (pre-C1b builds)', ok200(rk), `${rk.status}`);
  const r2 = await call(nokey, { key: KEY, headers: bearer('jwt-expired'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) });
  ok('C1b retirement: the same request once RENDER_PDF_SECRET is removed → 401', r2.status === 401 && r2.reached === 0, `${r2.status}`);
  const r3 = await call(live, { key: KEY, headers: bearer('jwt-homeowner'), body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) });
  ok('C1b: a VERIFIED session that is not allowed is refused even if the static key is also sent', r3.status === 403 && r3.reached === 0, `${r3.status}`);
}
ok('C1b: no log line in the whole run carries a session token or user id',
  !allLogs.some(l => /jwt-|u-insp|u-home|u-rpcdown/.test(l)), JSON.stringify(allLogs.filter(l => /jwt-|u-/.test(l))));

// ── 8. W1 · a PRESENTED Authorization header is decisive — even with the valid static key ────────
// These run on `live` (RENDER_PDF_SECRET set) on purpose: with no secret configured the key path is
// off anyway, so a 401 there cannot show that the key was refused. Each row sends the VALID key too.
for (const [label, value] of [
  ['a malformed Bearer header ("Bearer a b")',  'Bearer jwt-inspector extra'],
  ['Basic instead of Bearer',                    'Basic jwt-inspector'],
  ['a scheme with no token ("Bearer")',          'Bearer'],
  ['an EMPTY Authorization header',              ''],
  ['the public anon key as the bearer',          `Bearer ${ANON}`],
  ['a forged bearer token',                      'Bearer not-a-session'],
  ['an expired bearer token',                    'Bearer jwt-expired'],
]) {
  const r = await call(live, { key: KEY, headers: { Authorization: value }, body: JSON.stringify({ html: '<p>x</p>', inspectionId: 'insp_ok' }) });
  ok(`W1: ${label} + the VALID static key → 401, never the key path, browser never reached`,
    r.status === 401 && r.reached === 0 && JSON.stringify(r.json) === '{"error":"unauthorized"}', `${r.status} ${r.text.slice(0, 80)}`);
}
{
  const r = await call(live, { key: KEY });
  ok('W1 transition: NO Authorization header + the valid static key → still renders (installed pre-D4 builds)', ok200(r), `${r.status}`);
}

// ── 9. W1 · the browser runs the submitted HTML with no JavaScript and an allowlisted network ────
{
  const html = [
    '<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
    '<link rel="stylesheet" href="https://fonts.gstatic.com/s/inter.woff2"></head><body>',
    '<script src="https://evil.example/x.js"></script>',
    '<img src="data:image/png;base64,iVBORw0KGgo=">',
    '<img src="https://supa.test/storage/v1/object/sign/inspection-pdfs/a.jpg?token=SIGNED">',
    '<img src="http://supa.test/storage/v1/object/sign/inspection-pdfs/a.jpg">',
    '<img src="https://www.ledrixlabs.com/api/report-asset?path=insp_1/a.jpg">',
    '<img src="http://169.254.169.254/latest/meta-data/">',
    '<img src="http://10.0.0.1/admin">',
    '<iframe src="https://example.com/"></iframe>',
    '<img src="file:///etc/passwd">',
    '<img src="https://supa.test.evil.example/a.jpg">',
    '</body></html>'].join('');
  const r = await call(live, { key: KEY, body: JSON.stringify({ html }) });
  const c = r.log.content[0] ?? {};
  ok('W1: renders (200) with the browser restricted', ok200(r), `${r.status}`);
  ok('W1: page JavaScript is DISABLED before the HTML is loaded', c.jsAtLoad === false && r.log.js[0] === false, JSON.stringify(r.log.js));
  ok('W1: request interception is ON before the HTML is loaded', c.interceptAtLoad === true, JSON.stringify(r.log.intercept));
  const d = Object.fromEntries(r.log.requests.map(x => [x.url, x.decision]));
  const allowed = ['https://fonts.googleapis.com/css2?family=Inter', 'https://fonts.gstatic.com/s/inter.woff2', 'data:image/png;base64,iVBORw0KGgo=',
    'https://supa.test/storage/v1/object/sign/inspection-pdfs/a.jpg?token=SIGNED'];
  const blocked = ['https://evil.example/x.js', 'http://supa.test/storage/v1/object/sign/inspection-pdfs/a.jpg', 'https://www.ledrixlabs.com/api/report-asset?path=insp_1/a.jpg',
    'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/admin', 'https://example.com/', 'file:///etc/passwd', 'https://supa.test.evil.example/a.jpg'];
  ok('W1: the report\'s own resources load — signed Supabase storage photos, Google Fonts, data: images',
    allowed.every(u => d[u] === 'continue'), JSON.stringify(allowed.map(u => [u.slice(0, 40), d[u]])));
  ok('W1: everything else is aborted — other hosts, plain http, cloud metadata, LAN, file:, look-alike hosts, the token-less proxy',
    blocked.every(u => d[u] === 'abort:blockedbyclient'), JSON.stringify(blocked.map(u => [u.slice(0, 40), d[u]])));
  ok('W1: every request the page made was decided by the route (none slipped past interception)',
    r.log.requests.length === allowed.length + blocked.length && r.log.requests.every(x => x.decision && x.decision !== 'NOT INTERCEPTED'), String(r.log.requests.length));
}
{
  // Same restrictions on the session path, not only the key path.
  const r = await call(nokey, { headers: bearer('jwt-inspector'), body: JSON.stringify({ html: '<img src="https://evil.example/a.png">', inspectionId: 'insp_ok' }) });
  ok('W1: the session path renders under the same restrictions', ok200(r) && r.log.content[0]?.jsAtLoad === false && r.log.requests[0]?.decision === 'abort:blockedbyclient',
    JSON.stringify(r.log.requests));
}
{
  const s = readFileSync(join(src, 'app/api/render-pdf/route.ts'), 'utf8');
  ok('[doc] the route states the invariant: it renders submitted HTML and never reads report data by inspectionId',
    /INVARIANT/.test(s) && /never reads report data/i.test(s));
}

// ── 5b. Daily render budget (owner ruling 2026-10-14: 20 per inspector per day) ──────────────
{
  const sess = () => ({ headers: bearer('jwt-inspector'), body: JSON.stringify({ html: '<h1>R</h1>', inspectionId: 'insp_ok' }) });
  const routeSrc = readFileSync(join(src, 'app/api/render-pdf/route.ts'), 'utf8');
  ok('[budget] the limit is 20', /^const RENDERS_PER_DAY = 20;$/m.test(routeSrc));
  ok('[source] the route exports nothing but Next route members (Next rejects other exports)',
    [...routeSrc.matchAll(/^export\s+(?:const|async function|function)\s+(\w+)/gm)].every(m => ['runtime', 'maxDuration', 'dynamic', 'POST'].includes(m[1])));
  renderCounts = {}; counterDown = false;
  let allOk = true;
  for (let i = 0; i < 20; i++) { const r = await call(budget, sess()); if (!ok200(r)) allOk = false; }
  ok('[budget] renders 1..20 succeed', allOk);
  const over = await call(budget, sess());
  ok('[budget] render 21 → 429 and the browser is never opened', over.status === 429 && over.reached === 0 && over.log.connects.length === 0, `${over.status} reached=${over.reached}`);
  ok('[budget] the 429 body is generic', over.status === 429 && /daily render limit/.test(over.json?.error ?? '') && !/u-insp|service/i.test(JSON.stringify(over.json)));
  ok('[budget] counted per user, not globally', renderCounts['u-insp'] === 21 && Object.keys(renderCounts).length === 1, JSON.stringify(renderCounts));

  renderCounts = {};
  await call(budget, { headers: bearer('jwt-inspector'), body: JSON.stringify({ html: '<h1>R</h1>', inspectionId: 'insp_other' }) });
  await call(budget, { headers: bearer('jwt-homeowner'), body: JSON.stringify({ html: '<h1>R</h1>', inspectionId: 'insp_ok' }) });
  await call(budget, { headers: bearer('jwt-expired'), body: JSON.stringify({ html: '<h1>R</h1>', inspectionId: 'insp_ok' }) });
  ok('[budget] refused requests (403/401) spend nothing', Object.keys(renderCounts).length === 0, JSON.stringify(renderCounts));

  renderCounts = {};
  const k = await call(budget, { key: KEY });
  ok('[budget] the static-key path is not counted (no user) and still renders', ok200(k) && Object.keys(renderCounts).length === 0);

  counterDown = true;
  const down = await call(budget, sess());
  counterDown = false;
  ok('[budget] counter error fails OPEN — the render proceeds', ok200(down), String(down.status));
  ok('[budget] counter error is logged without upstream detail', down.logs.some(l => /render budget unavailable/.test(l)) && !down.logs.some(l => /INTERNAL-UPSTREAM-DETAIL/.test(l)));

  renderCounts = {};
  const unconf = await call(nokey, sess());
  ok('[budget] no service key configured → renders, counter never called', ok200(unconf) && !supaLog.some(x => /increment_render_usage/.test(x.path)) && Object.keys(renderCounts).length === 0);

  const s = readFileSync(join(src, 'app/api/render-pdf/route.ts'), 'utf8');
  ok('[source] the counter runs after mayRender (refused requests spend nothing)', s.indexOf('bumpRenders(session.userId)') > s.indexOf('mayRender(session.token'));
}

// ── 6. Source: the comparison is constant-time and the fail-open shape is gone ─────────
{
  const s = readFileSync(join(src, 'app/api/render-pdf/route.ts'), 'utf8');
  ok('[source] key compared with crypto.timingSafeEqual', /timingSafeEqual\s*\(/.test(s));
  ok('[source] no "SECRET &&" fail-open guard remains', !/if\s*\(\s*SECRET\s*&&/.test(s));
  ok('[source] no `detail` field in any response', !/json\(\s*\{[^}]*\bdetail\b/.test(s));
  ok('[source] no exception message or raw error object is logged', !/\.message\b/.test(s) && !/String\(e\)/.test(s) && !/console\.\w+\([^)]*,\s*e\s*\)/.test(s));
}

Module._load = realLoad;
if (failures.length) {
  console.error(`verify-render-pdf: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-render-pdf: all ${checks} checks pass`);
