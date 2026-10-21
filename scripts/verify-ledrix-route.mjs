#!/usr/bin/env node
// ─── Regression: /api/ledrix reads a home only for the share TOKEN that names it (S-16) ────────
//
// (Security S-16, 2026-10-10.) The route required a signed-in user but took a caller-supplied
// `shareId` and read that home's record + maintenance log with the SERVICE ROLE into the model's
// context — so any account could ask the AI about any home by guessing an `insp_<ms>` id. This drives
// the REAL route (transpiled with the repo's TypeScript) against a fake Supabase and a fake AI
// gateway, and records exactly which home's data reaches the model. Also covers the failure paths
// (token lookup, data fetch, AI gateway) and non-string token values (S-16 audit follow-up, 2026-10-11).
//
//   node scripts/verify-ledrix-route.mjs
//   WEB_SRC=<dir> node scripts/verify-ledrix-route.mjs   # run against another checkout (e.g. HEAD)
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const src  = process.env.WEB_SRC ? join(process.env.WEB_SRC) : repo;
const require = createRequire(join(repo, 'package.json'));
const ts = require('typescript');

let checks = 0; const failures = [];
const ok = (label, cond, detail) => { checks++; if (!cond) failures.push(detail ? `${label}\n      ${detail}` : label); };

// ── Fakes ──────────────────────────────────────────────────────────────────────────────
const SERVICE = 'service-role-key', GOOD = 'good-user-jwt', USER_ID = '11111111-1111-4111-8111-111111111111';
const TA = 'a'.repeat(32), TB = 'b'.repeat(32);
const A = 'insp_1790000000001', B = 'insp_1790000000002';
const HOMES = {
  [A]: { share_id: A, share_token: TA, address: '1 ALPHA LANE', anomalies: [{ severity: 'critical', unit: 'Roof', description: 'ALPHA-SECRET-FINDING' }] },
  [B]: { share_id: B, share_token: TB, address: '2 BRAVO ROAD', anomalies: [{ severity: 'critical', unit: 'Panel', description: 'BRAVO-SECRET-FINDING' }] },
};
let usageBumps = 0, modelCalls = [], dataReads = [], tokenLookups = 0;
// portal_links (supabase_portal_links.sql). null = table not applied (PostgREST 404), as in production today.
let LINKS = null;
const sha = (t) => createHash('sha256').update(t).digest('hex');
// Fault switches for the failure-path tests: 'http500' | 'drop' (connection destroyed) | 'badjson'.
const faults = { lookup: null, data: null, gateway: null };
const GW_INTERNAL = 'GW-INTERNAL-DETAIL upstream=openai stack=at handler (/srv/gateway.js:42)';
const supa = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (s, b) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  let body = ''; for await (const c of req) body += c;
  if (u.pathname === '/auth/v1/user') {
    return (req.headers.authorization === `Bearer ${GOOD}`)
      ? send(200, { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'someone@example.com' })
      : send(401, { message: 'invalid JWT' });
  }
  if (u.pathname === '/rest/v1/rpc/increment_ledrix_usage') { usageBumps++; return send(200, usageBumps); }
  if (req.headers.apikey !== SERVICE) return send(401, { message: 'permission denied' });
  const fail = (mode) => {
    if (mode === 'drop') { req.socket.destroy(); return true; }
    if (mode === 'http500') { send(500, { message: 'internal error', hint: 'db down' }); return true; }
    if (mode === 'badjson') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('<html>not json'); return true; }
    return false;
  };
  if (u.pathname === '/rest/v1/portal_links') {
    if (!LINKS) return send(404, { code: 'PGRST205' });
    const h = /^eq\.(.*)$/.exec(u.searchParams.get('token_hash') ?? '')?.[1];
    return send(200, LINKS.filter(l => l.token_hash === h));
  }
  if (u.pathname === '/rest/v1/home_records') {
    const tok = /^eq\.(.*)$/.exec(u.searchParams.get('share_token') ?? '')?.[1];
    const sid = /^eq\.(.*)$/.exec(u.searchParams.get('share_id') ?? '')?.[1];
    if (tok !== undefined) { tokenLookups++; if (fail(faults.lookup)) return; return send(200, Object.values(HOMES).filter(h => h.share_token === tok).map(h => ({ share_id: h.share_id }))); }
    if (sid !== undefined) { dataReads.push(sid); if (fail(faults.data)) return; return send(200, HOMES[sid] ? [HOMES[sid]] : []); }
    // Unfiltered: PostgREST would return rows — the fake does too, so a code path that "falls back"
    // to an unfiltered read is visible (it is recorded as a read of '*').
    dataReads.push('*'); return send(200, Object.values(HOMES));
  }
  if (u.pathname === '/rest/v1/home_maintenance_log') {
    const sid = /^eq\.(.*)$/.exec(u.searchParams.get('share_id') ?? '')?.[1];
    if (sid) dataReads.push(`log:${sid}`);
    if (fail(faults.data)) return;
    return send(200, []);
  }
  send(404, {});
});
const gw = createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  modelCalls.push(body);
  if (faults.gateway === 'drop') { req.socket.destroy(); return; }
  if (faults.gateway === 'http500') { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: GW_INTERNAL, key: 'GW-SECRET-KEY-123' })); return; }
  if (faults.gateway === 'badjson') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<html>${GW_INTERNAL}</html>`); return; }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: '{"isLog":false}' } }] }));
});
await new Promise(r => supa.listen(0, '127.0.0.1', r));
await new Promise(r => gw.listen(0, '127.0.0.1', r));
const SUPA = `http://127.0.0.1:${supa.address().port}`, GW = `http://127.0.0.1:${gw.address().port}`;
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => { const { cache, ...rest } = init; return realFetch(url, rest); };

// ── Load the real route ────────────────────────────────────────────────────────────────
const out = join(repo, 'node_modules/.cache/verify-ledrix-route');
rmSync(out, { recursive: true, force: true });
for (const rel of ['app/api/ledrix/route.ts', 'lib/usage.ts', 'lib/entitlement.ts', 'lib/homeownerRecommendation.ts', 'lib/shareAccess.ts']) {
  const from = join(src, rel);
  if (!existsSync(from)) continue;
  const js = ts.transpileModule(readFileSync(from, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const to = join(out, rel.replace(/\.ts$/, '.js'));
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, js);
}
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: SERVICE, GATEWAY_URL: GW, GATEWAY_KEY: 'GW-SECRET-KEY-123' });
delete process.env.STRIPE_SECRET_KEY; delete process.env.BILLING_ENABLED;
const route = require(join(out, 'app/api/ledrix/route.js'));
const { NextRequest } = require('next/server');

const call = async (body, auth = GOOD, withFaults = {}) => {
  usageBumps = 0; modelCalls = []; dataReads = []; tokenLookups = 0;
  Object.assign(faults, { lookup: null, data: null, gateway: null }, withFaults);
  const res = await route.POST(new NextRequest('https://www.ledrixlabs.com/api/ledrix', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  }));
  const sent = modelCalls.join('\n');
  const text = await res.text().catch(() => '');
  Object.assign(faults, { lookup: null, data: null, gateway: null });
  return { status: res.status, sent, text, reads: [...dataReads], bumps: usageBumps, modelCalls: modelCalls.length, lookups: tokenLookups };
};
const leaked = (r, home) => r.sent.includes(home === A ? 'ALPHA' : 'BRAVO') || r.reads.some(x => x.includes(home));

// ── Denied ─────────────────────────────────────────────────────────────────────────────
{
  const r = await call({ shareId: B, mode: 'insight' });
  ok('DENY the original exploit: signed-in user names another home by shareId alone', r.status === 404 && !leaked(r, B) && r.modelCalls === 0,
    `status ${r.status}, reads ${JSON.stringify(r.reads)}, model calls ${r.modelCalls}`);
}
{
  const r = await call({ shareId: B, token: TA, mode: 'chat', messages: [{ role: 'user', content: 'hi' }] });
  ok('DENY token for home A with shareId of home B (mismatch)', r.status === 404 && !leaked(r, B) && !leaked(r, A) && r.modelCalls === 0,
    `status ${r.status}, reads ${JSON.stringify(r.reads)}`);
}
{
  const r = await call({ token: 'c'.repeat(32), mode: 'insight' });
  ok('DENY unknown token', r.status === 404 && r.reads.length === 0 && r.modelCalls === 0, `status ${r.status}`);
}
{
  const r = await call({ token: 'x;select*', shareId: A, mode: 'insight' });
  ok('DENY malformed token', r.status === 404 && r.reads.length === 0 && r.modelCalls === 0, `status ${r.status}`);
}
{
  const r = await call({ token: TA, mode: 'insight' }, null);
  ok('DENY no login (401) even with a valid token', r.status === 401 && r.reads.length === 0 && r.modelCalls === 0, `status ${r.status}`);
}
{
  const r = await call({ token: TA, mode: 'insight' }, 'forged-jwt');
  ok('DENY forged login', r.status === 401 && r.reads.length === 0, `status ${r.status}`);
}
{
  const r = await call({ shareId: B, mode: 'insight' });
  ok('a refused request does not consume the daily cap', r.bumps === 0, `bumps ${r.bumps}`);
}

// ── Allowed ────────────────────────────────────────────────────────────────────────────
{
  const r = await call({ token: TA, shareId: A, mode: 'insight' });
  ok('ALLOW token + matching shareId: home A context reaches the model', r.status === 200 && r.sent.includes('ALPHA-SECRET-FINDING') && !leaked(r, B),
    `status ${r.status}`);
}
{
  const r = await call({ token: TA, mode: 'chat', messages: [{ role: 'user', content: 'what should I fix first?' }] });
  ok('ALLOW token alone: home A context, never B', r.status === 200 && r.sent.includes('1 ALPHA LANE') && !leaked(r, B), `status ${r.status}`);
}
{
  const r = await call({ token: TB, shareId: B, mode: 'logparse', question: 'we replaced the panel' });
  ok('ALLOW logparse for home B with its own token', r.status === 200 && r.modelCalls === 1, `status ${r.status}`);
}
{
  const r = await call({ mode: 'chat', messages: [{ role: 'user', content: 'general question' }] });
  ok('ALLOW a request naming no home: no home data read (unchanged behaviour)', r.status === 200 && r.reads.length === 0 && r.sent.includes('No inspection record'),
    `status ${r.status}, reads ${JSON.stringify(r.reads)}`);
}

// ── 1 · Token lookup failure fails CLOSED ─────────────────────────────────────────────
// The request also names home A, so a "fall back to the caller's shareId" bug would show as a read.
for (const mode of ['http500', 'drop', 'badjson']) {
  const r = await call({ token: TA, shareId: A, mode: 'insight' }, GOOD, { lookup: mode });
  ok(`FAIL CLOSED: token lookup ${mode} → 404, no data read, no model call, no cap used`,
    r.status === 404 && r.reads.length === 0 && r.modelCalls === 0 && r.bumps === 0 && JSON.parse(r.text || '{}').error === 'Not found.',
    `status ${r.status}, reads ${JSON.stringify(r.reads)}, model ${r.modelCalls}, bumps ${r.bumps}, body ${r.text}`);
}

// ── 2 · Data fetch failure never falls back to another home ───────────────────────────
for (const mode of ['http500', 'drop', 'badjson']) {
  const r = await call({ token: TA, shareId: A, mode: 'chat', messages: [{ role: 'user', content: 'hi' }] }, GOOD, { data: mode });
  ok(`DATA FAILURE (${mode}): only home A was asked for, nothing unfiltered, model gets the no-record context only`,
    r.status === 200 && r.modelCalls === 1 && r.reads.every(x => x === A || x === `log:${A}`) && !r.reads.includes('*')
      && r.sent.includes('No inspection record') && !leaked(r, B) && !r.sent.includes('ALPHA'),
    `status ${r.status}, reads ${JSON.stringify(r.reads)}, sent ${r.sent.slice(0, 200)}`);
}

// ── 3 · analyze and insight use only the token's home ─────────────────────────────────
{
  const img = 'data:image/png;base64,iVBORw0KGgo=';
  const a = await call({ token: TA, mode: 'analyze', image: img, question: 'is this ok?' });
  ok('ANALYZE with home A token alone: home A context reaches the model, never B',
    a.status === 200 && a.modelCalls === 1 && a.sent.includes('ALPHA-SECRET-FINDING') && !leaked(a, B), `status ${a.status}`);
  const a2 = await call({ token: TA, shareId: A, mode: 'analyze', image: img });
  ok('ANALYZE with home A token + matching id: home A only', a2.status === 200 && a2.sent.includes('1 ALPHA LANE') && !leaked(a2, B), `status ${a2.status}`);
  const i = await call({ token: TB, mode: 'insight' });
  ok('INSIGHT with home B token alone: home B context only', i.status === 200 && i.sent.includes('BRAVO-SECRET-FINDING') && !leaked(i, A), `status ${i.status}`);
  for (const mode of ['analyze', 'insight']) {
    const m = await call({ token: TA, shareId: B, mode, image: img });
    ok(`DENY ${mode}: home A token + home B id → 404, nothing read, no model call`,
      m.status === 404 && m.reads.length === 0 && m.modelCalls === 0 && !leaked(m, B) && !leaked(m, A), `status ${m.status}, reads ${JSON.stringify(m.reads)}`);
  }
}

// ── 4 · Non-string token values ───────────────────────────────────────────────────────
// A token must be a primitive string. Everything else — including a one-element array holding a VALID
// token, and numbers/booleans — is refused at the type check, before any lookup: no coercion.
{
  const rejected = [
    ['object', { $eq: TA }], ['empty object', {}], ['two-token array', [TA, TB]], ['nested array', [[TA, TB]]],
    ['array with injection', [`${TA},share_id.eq.${B}`]], ['empty array', []], ['null', null],
    ['one-element array holding valid token A', [TA]], ['number', 12345], ['zero', 0], ['boolean true', true], ['boolean false', false],
  ];
  for (const [label, token] of rejected) {
    const r = await call({ token, shareId: A, mode: 'insight' });
    ok(`DENY non-string token (${label}) → 404 with no token lookup, no data, no model call, no cap used`,
      r.status === 404 && r.lookups === 0 && r.reads.length === 0 && r.modelCalls === 0 && r.bumps === 0,
      `status ${r.status}, lookups ${r.lookups}, reads ${JSON.stringify(r.reads)}, model ${r.modelCalls}, bumps ${r.bumps}`);
  }
  for (const [label, token] of [['[validTokenA] alone', [TA]], ['[validTokenA] with home B id', [TA]]]) {
    const r = await call({ token, ...(label.includes('home B') ? { shareId: B } : {}), mode: 'chat', messages: [{ role: 'user', content: 'hi' }] });
    ok(`DENY ${label} → 404, no lookup, neither home leaks`,
      r.status === 404 && r.lookups === 0 && r.modelCalls === 0 && !leaked(r, A) && !leaked(r, B), `status ${r.status}, lookups ${r.lookups}`);
  }
  // Malformed STRINGS are the shape gate's job (the type check lets every string through to it).
  for (const [label, token] of [['injection characters', 'x;select*'], ['filter smuggling', `${TA},share_id.eq.${B}`], ['too long (129)', 'a'.repeat(129)], ['inner space', 'a b'], ['empty', ''], ['whitespace only', '   ']]) {
    const r = await call({ token, shareId: A, mode: 'insight' });
    ok(`DENY malformed string token (${label}) → 404 with no token lookup`,
      r.status === 404 && r.lookups === 0 && r.reads.length === 0 && r.modelCalls === 0 && r.bumps === 0, `status ${r.status}, lookups ${r.lookups}`);
  }
  // Valid strings keep working exactly as before (trim included).
  const padded = await call({ token: `  ${TA}  `, shareId: A, mode: 'insight' });
  ok('ALLOW valid string token with surrounding spaces (trimmed, as before): home A only',
    padded.status === 200 && padded.sent.includes('ALPHA-SECRET-FINDING') && !leaked(padded, B), `status ${padded.status}`);
}

// ── 6 · Scoped and revoked links (portal_links applied) ───────────────────────────────
{
  const READ = 'r'.repeat(43), REP = 'p'.repeat(43);
  LINKS = [
    { id: '1', share_id: A, token_hash: sha(TA), scope: 'edit', revoked_at: '2026-10-19T00:00:00Z' },
    { id: '2', share_id: A, token_hash: sha(READ), scope: 'read', revoked_at: null },
    { id: '3', share_id: A, token_hash: sha(REP), scope: 'repairs', revoked_at: null },
  ];
  const rv = await call({ token: TA, shareId: A, mode: 'insight' });
  ok('REVOKED original link → 404, no data read, no model call, no cap used',
    rv.status === 404 && rv.reads.length === 0 && rv.modelCalls === 0 && rv.bumps === 0, `status ${rv.status}`);
  const rd = await call({ token: READ, mode: 'insight' });
  ok('VIEW-ONLY link may ask about its own home', rd.status === 200 && rd.sent.includes('ALPHA-SECRET-FINDING') && !leaked(rd, B), `status ${rd.status}`);
  const rp = await call({ token: REP, mode: 'insight' });
  ok('REPAIRS-only link cannot ask about the home', rp.status === 404 && rp.reads.length === 0 && rp.modelCalls === 0, `status ${rp.status}`);
  const other = await call({ token: TB, mode: 'insight' });
  ok('another home is unaffected by A\'s revocation', other.status === 200 && other.sent.includes('BRAVO'), `status ${other.status}`);
  LINKS = null;
}

// ── 5 · AI gateway failure: opaque 502, nothing internal leaks ────────────────────────
for (const mode of ['http500', 'drop', 'badjson']) {
  const r = await call({ token: TA, shareId: A, mode: 'chat', messages: [{ role: 'user', content: 'hi' }] }, GOOD, { gateway: mode });
  let body = {}; try { body = JSON.parse(r.text); } catch {}
  const leaks = ['GW-INTERNAL', 'GW-SECRET-KEY', 'service-role-key', 'openai', 'stack', '127.0.0.1', 'ALPHA', 'BRAVO', TA, TB]
    .filter(x => r.text.includes(x));
  ok(`GATEWAY ${mode} → 502 with only a generic error, no internal detail, key, URL or home data`,
    r.status === 502 && Object.keys(body).join() === 'error' && /^(Ledrix is unavailable right now\.|Network error reaching Ledrix\.)$/.test(body.error) && leaks.length === 0,
    `status ${r.status}, body ${r.text}, leaks ${JSON.stringify(leaks)}`);
}

// ── Chat answers sign-in questions accurately (it cannot send links) ─────────────────
{
  const c = await call({ token: TA, mode: 'chat', messages: [{ role: 'user', content: 'Can I get a sign in link?' }] });
  ok('CHAT instructions tell Ledrix it cannot send sign-in links and how to sign in on another device',
    c.status === 200 && c.sent.includes("you can't send links or change accounts") && c.sent.includes('already signed in on this device')
      && c.sent.includes('open the sign-in link from that email on that same device'), `status ${c.status}`);
  const i = await call({ token: TA, mode: 'insight' });
  ok('…and only the chat carries it (insight instructions unchanged)', i.status === 200 && !i.sent.includes('sign-in link'), `status ${i.status}`);
}

// ── The portal sends its token on every call ──────────────────────────────────────────
{
  const page = readFileSync(join(src, 'app/share/[id]/page.tsx'), 'utf8');
  const calls = [...page.matchAll(/fetch\('\/api\/ledrix',[\s\S]{0,400}?JSON\.stringify\(\{([^}]*)\}/g)].map(m => m[1]);
  ok('every /api/ledrix call in the portal is found', calls.length === 5, `${calls.length} calls`);
  ok('every /api/ledrix call sends token: PORTAL_TOKEN', calls.length > 0 && calls.every(b => /token:\s*PORTAL_TOKEN/.test(b)),
    calls.filter(b => !/token:\s*PORTAL_TOKEN/.test(b)).join(' | '));
}

supa.close(); gw.close();
if (failures.length) {
  console.error(`verify-ledrix-route${src === repo ? '' : ` (${src})`}: ${failures.length} of ${checks} checks FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-ledrix-route: all ${checks} checks pass`);
