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
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
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
const reset = () => { log = { connects: [], content: [], pdfOpts: [], closed: 0 }; fault = null; };
const fakePuppeteer = {
  async connect({ browserWSEndpoint }) {
    log.connects.push(browserWSEndpoint);
    if (fault === 'connect') throw new Error(`connect refused at ${browserWSEndpoint} (INTERNAL-UPSTREAM-DETAIL)`);
    if (fault === 'evil-name') { const e = new Error('INTERNAL-UPSTREAM-DETAIL'); e.name = `Bad ${browserWSEndpoint}`; throw e; }
    if (fault === 'non-error') throw `raw string ${browserWSEndpoint} INTERNAL-UPSTREAM-DETAIL`;
    return {
      async newPage() {
        return {
          async setContent(html, opts) {
            log.content.push({ html, opts });
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
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'puppeteer-core') return { __esModule: true, default: fakePuppeteer };
  return realLoad.call(this, request, ...rest);
};

// ── Load the real route once per environment configuration ─────────────────────────────
function build(tag, env) {
  const out = join(repo, 'node_modules/.cache/verify-render-pdf', tag);
  rmSync(out, { recursive: true, force: true });
  const js = ts.transpileModule(readFileSync(join(src, 'app/api/render-pdf/route.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const to = join(out, 'route.js');
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, js);
  const saved = { ...process.env };
  delete process.env.RENDER_PDF_SECRET; delete process.env.BROWSERLESS_WS_ENDPOINT;
  Object.assign(process.env, env);
  const mod = require(to);
  process.env = saved;
  return mod;
}
const KEY = 'app-render-key-19ch';   // same length as the shipped key; the value is a stand-in
const live  = build('live',  { RENDER_PDF_SECRET: KEY, BROWSERLESS_WS_ENDPOINT: WS });
const nokey = build('nokey', { BROWSERLESS_WS_ENDPOINT: WS });
const nows  = build('nows',  { RENDER_PDF_SECRET: KEY });

const { NextRequest } = require('next/server');
// Everything the route logs, per call and across the whole run.
const allLogs = [];
const realConsoleError = console.error;
const call = async (mod, { key, headers = {}, body = JSON.stringify({ html: '<h1>REPORT-CONTENT</h1>' }), withFault = null } = {}) => {
  reset(); fault = withFault;
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
for (const key of [undefined, '', KEY, 'anything']) {
  const r = await call(nokey, { key });
  ok(`no RENDER_PDF_SECRET → 503 and the browser is never reached (key ${JSON.stringify(key)})`,
    r.status === 503 && r.reached === 0, `status ${r.status}, reached ${r.reached}`);
  ok(`no RENDER_PDF_SECRET → generic body naming no configuration (key ${JSON.stringify(key)})`,
    JSON.stringify(r.json) === '{"error":"render unavailable"}' && !LEAKS.test(r.text), r.text);
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
