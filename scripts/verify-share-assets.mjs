#!/usr/bin/env node
// ─── Regression: report assets are reachable only through the share token (Phase 0b) ─────
//
// (Ledrix security fix, 2026-10-10.) /api/photo, /api/report-asset and /api/reports used the
// service role for ANY caller and ANY path/id; inspection ids are `insp_<ms>`, so every company's
// report PDFs, report HTML, covers, finding photos, evidence photos and confirmed findings were
// walkable. This drives the REAL route handlers (transpiled with the repo's own TypeScript) against
// a fake Supabase holding two companies' shares, and asserts both directions: cross-share and
// tokenless requests are refused WITHOUT the service role signing anything, and a homeowner with a
// valid link still gets every asset of their own report.
//
//   node scripts/verify-share-assets.mjs
//   WEB_SRC=<dir> node scripts/verify-share-assets.mjs   # run against another checkout (e.g. HEAD)
//
// No network, no Supabase, no new dependency.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const src  = process.env.WEB_SRC ? join(process.env.WEB_SRC) : repo;
const require = createRequire(join(repo, 'package.json'));
const ts = require('typescript');

let checks = 0; const failures = [];
const ok = (label, cond, detail) => { checks++; if (!cond) failures.push(detail ? `${label}\n      ${detail}` : label); };

// ── Fake Supabase ────────────────────────────────────────────────────────────────────
const SERVICE = 'service-role-key', ANON = 'anon-key';
const TA = 'a'.repeat(32), TB = 'b'.repeat(32);            // share tokens
const A = 'insp_1790000000001', B = 'insp_1790000000002';  // share_id = inspection id
const DB = {
  home_records: [{ share_token: TA, share_id: A }, { share_token: TB, share_id: B }],
  inspections:  [{ id: A, address: '1 Alpha St' }, { id: B, address: '2 Bravo Ave' }],
  anomalies: [
    { id: 'a1', inspection_id: A, status: 'confirmed', severity: 'deficiency', unit: 'kitchen', description: 'ALPHA-FINDING', image_uri: `${A}/kitchen/a1.jpg` },
    // Inspector-written image_uri naming ANOTHER company's object: must never be signed.
    { id: 'a2', inspection_id: A, status: 'confirmed', severity: 'deficiency', unit: 'bath', description: 'ALPHA-PLANTED', image_uri: `${B}/bath/b1.jpg` },
    { id: 'b1', inspection_id: B, status: 'confirmed', severity: 'critical', unit: 'bath', description: 'BRAVO-SECRET', image_uri: `${B}/bath/b1.jpg` },
  ],
};
let signed = [];   // every [bucket, path] the service role was asked to sign
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const key = req.headers.apikey;
  const send = (s, b) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (u.pathname.startsWith('/rest/v1/')) {
    if (key !== SERVICE) return send(401, { message: 'permission denied' });   // RLS: anon reads nothing
    const table = u.pathname.slice('/rest/v1/'.length);
    let rows = DB[table] ?? [];
    for (const [k, v] of u.searchParams) {
      if (['select', 'limit', 'order'].includes(k)) continue;
      const m = /^eq\.(.*)$/.exec(v); if (m) rows = rows.filter(r => String(r[k]) === m[1]);
    }
    return send(200, rows);
  }
  const sm = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(u.pathname);
  if (sm && req.method === 'POST') {
    if (key !== SERVICE) return send(400, { message: 'not found' });            // private bucket
    signed.push([sm[1], decodeURIComponent(sm[2])]);
    return send(200, { signedURL: `/object/sign/${sm[1]}/${sm[2]}?token=sig` });
  }
  send(404, {});
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const SUPA = `http://127.0.0.1:${server.address().port}`;

// Next's runtime strips fetch's `cache` option; plain Node may reject it. Mirror Next.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => { const { cache, ...rest } = init; return realFetch(url, rest); };

// ── Load the real route handlers ─────────────────────────────────────────────────────
const FILES = ['app/api/photo/route.ts', 'app/api/report-asset/route.ts', 'app/api/reports/route.ts', 'lib/portalAssets.ts'];
function build(tag, env) {
  const out = join(repo, 'node_modules/.cache/verify-share-assets', tag);
  rmSync(out, { recursive: true, force: true });
  const files = [...FILES, ...readdirSync(join(src, 'lib')).filter(f => f.endsWith('.ts')).map(f => `lib/${f}`)];
  for (const rel of new Set(files)) {
    const from = join(src, rel);
    if (!existsSync(from)) continue;
    const js = ts.transpileModule(readFileSync(from, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const to = join(out, rel.replace(/\.tsx?$/, '.js'));
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, js);
  }
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const k of Object.keys(env)) if (env[k] === undefined) delete process.env[k];
  const load = (rel) => { const p = join(out, rel); return existsSync(p) ? require(p) : null; };
  const mods = {
    photo: load('app/api/photo/route.js'), asset: load('app/api/report-asset/route.js'),
    reports: load('app/api/reports/route.js'), portal: load('lib/portalAssets.js'),
  };
  process.env = saved;
  return mods;
}
const { NextRequest } = require('next/server');
const call = async (mod, qs) => {
  signed = [];
  const res = await mod.GET(new NextRequest(`https://www.ledrixlabs.com/api/x?${qs}`));
  return { status: res.status, location: res.headers.get('location') ?? '', body: res.status === 200 ? await res.text() : '', signed: [...signed] };
};
const q = (o) => new URLSearchParams(o).toString();
const pub = (p) => `${SUPA}/storage/v1/object/public/inspection-pdfs/${p}`;

const live = build('live', { NEXT_PUBLIC_SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: SERVICE, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON });

// ── 1. /api/report-asset ─────────────────────────────────────────────────────────────
{
  const m = live.asset;
  const deny = async (label, params) => {
    const r = await call(m, q(params));
    ok(`R1 report-asset DENY · ${label}`, r.status === 404 && r.signed.length === 0,
      `status ${r.status}, signed ${JSON.stringify(r.signed)}`);
  };
  const allow = async (label, params, path) => {
    const r = await call(m, q(params));
    ok(`R1 report-asset ALLOW · ${label}`,
      r.status >= 300 && r.status < 400 && r.signed.length === 1 && r.signed[0][1] === path && r.location.includes(path),
      `status ${r.status}, signed ${JSON.stringify(r.signed)}`);
  };
  await deny('the original exploit: another company\'s PDF, no token', { path: `${B}/report.pdf` });
  await deny('own PDF but no token', { path: `${A}/report.pdf` });
  await deny('unknown token', { path: `${A}/report.pdf`, t: 'c'.repeat(32) });
  await deny('malformed token', { path: `${A}/report.pdf`, t: 'x;select' });
  await deny('token A, company B\'s PDF', { path: `${B}/report.pdf`, t: TA });
  await deny('token A, company B\'s report.html', { path: `${B}/report.html`, t: TA });
  await deny('token A, company B\'s archived version', { path: `${B}/reports/20261001-120000/report.pdf`, t: TA });
  await deny('token A, company B\'s PDF photo', { path: `report/${B}/0.jpg`, t: TA });
  await deny('token A, B\'s legacy public URL (stored cover_url/pdf_url shape)', { path: pub(`${B}/cover.jpg`), t: TA });
  await deny('token A, traversal out of A', { path: `${A}/../${B}/report.pdf`, t: TA });
  await deny('token A, prefix look-alike', { path: `${A}9/report.pdf`, t: TA });
  await deny('token A, encoded traversal', { path: `${A}/%2e%2e/${B}/report.pdf`, t: TA });
  // normalizePath strips everything up to the FIRST '/inspection-pdfs/'. If the route checked one
  // normalization and the signer applied a second, a doubled marker would check as A, sign as B.
  await deny('token A, doubled bucket marker (check-as-A, sign-as-B)', { path: `x/inspection-pdfs/${A}/inspection-pdfs/${B}/report.pdf`, t: TA });
  await deny('token A, bare path with an embedded marker', { path: `${A}/inspection-pdfs/${B}/report.pdf`, t: TA });
  await allow('token A, own PDF', { path: `${A}/report.pdf`, t: TA }, `${A}/report.pdf`);
  await allow('token A, own report.html', { path: `${A}/report.html`, t: TA }, `${A}/report.html`);
  await allow('token A, own archived version', { path: `${A}/reports/20261001-120000/report.html`, t: TA }, `${A}/reports/20261001-120000/report.html`);
  await allow('token A, own legacy public pdf_url', { path: pub(`${A}/report.pdf`), t: TA }, `${A}/report.pdf`);
  await allow('token A, own cover', { path: pub(`${A}/cover.jpg`), t: TA }, `${A}/cover.jpg`);
  await allow('token A, own finding photo', { path: pub(`${A}/findings/a1.jpg`), t: TA }, `${A}/findings/a1.jpg`);
  await allow('token A, own PDF photo (report/<id>/…)', { path: `report/${A}/3.jpg`, t: TA }, `report/${A}/3.jpg`);
  await allow('token B, own PDF', { path: `${B}/report.pdf`, t: TB }, `${B}/report.pdf`);
}

// ── 2. /api/photo ────────────────────────────────────────────────────────────────────
{
  const m = live.photo;
  const deny = async (label, params, status = 404) => {
    const r = await call(m, q(params));
    ok(`R2 photo DENY · ${label}`, r.status === status && r.signed.length === 0,
      `status ${r.status}, location ${r.location}, signed ${JSON.stringify(r.signed)}`);
  };
  await deny('the original exploit: another company\'s evidence, no token', { path: `${B}/bath/b1.jpg` });
  await deny('own evidence but no token', { path: `${A}/kitchen/a1.jpg` });
  await deny('unknown token', { path: `${A}/kitchen/a1.jpg`, t: 'c'.repeat(32) });
  await deny('token A, company B\'s evidence', { path: `${B}/bath/b1.jpg`, t: TA });
  await deny('token A, traversal', { path: `${A}/../${B}/bath/b1.jpg`, t: TA });
  await deny('open redirect to an absolute URL', { path: 'https://evil.example/x.jpg', t: TA });
  {
    const r = await call(m, q({ path: `${A}/kitchen/a1.jpg`, t: TA }));
    ok('R2 photo ALLOW · token A, own evidence',
      r.status >= 300 && r.status < 400 && r.signed.length === 1 && r.signed[0][0] === 'inspection-evidence' && r.signed[0][1] === `${A}/kitchen/a1.jpg`,
      `status ${r.status}, signed ${JSON.stringify(r.signed)}`);
  }
}

// ── 3. /api/reports ──────────────────────────────────────────────────────────────────
{
  const m = live.reports;
  const deny = async (label, params) => {
    const r = await call(m, q(params));
    ok(`R3 reports DENY · ${label}`,
      r.status === 404 && !/BRAVO|ALPHA|Bravo|Alpha/.test(r.body) && r.signed.length === 0,
      `status ${r.status}, signed ${JSON.stringify(r.signed)}`);
  };
  await deny('the original exploit: another company\'s inspection by id, no token', { inspectionId: B });
  await deny('own inspection by id, no token', { inspectionId: A });
  await deny('unknown token', { token: 'c'.repeat(32) });
  await deny('token A, inspectionId B', { token: TA, inspectionId: B });
  {
    const r = await call(m, q({ token: TA }));
    ok('R3 reports ALLOW · token A renders A\'s confirmed findings', r.status === 200 && r.body.includes('ALPHA-FINDING') && r.body.includes('1 Alpha St'),
      `status ${r.status}`);
    ok('R3 reports ALLOW · and none of B\'s', !r.body.includes('BRAVO-SECRET') && !r.body.includes('2 Bravo Ave'));
    ok('R3 reports · A\'s own photo is signed', r.signed.some(([b, p]) => b === 'inspection-evidence' && p === `${A}/kitchen/a1.jpg`),
      JSON.stringify(r.signed));
    ok('R3 reports DENY · a finding\'s planted image_uri naming B is NOT signed', !r.signed.some(([, p]) => p.startsWith(`${B}/`)),
      JSON.stringify(r.signed));
    const r2 = await call(m, q({ token: TA, inspectionId: A }));
    ok('R3 reports ALLOW · token A with matching inspectionId', r2.status === 200 && r2.body.includes('ALPHA-FINDING'), `status ${r2.status}`);
  }
}

// ── 4. No service role → nothing is signed, nothing is read ─────────────────────────
{
  const anonOnly = build('anon', { NEXT_PUBLIC_SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON });
  const a = await call(anonOnly.asset, q({ path: `${A}/report.pdf`, t: TA }));
  ok('R4 report-asset without service role fails closed', !(a.status >= 300 && a.status < 400) && a.signed.length === 0, `status ${a.status}`);
  const p = await call(anonOnly.photo, q({ path: `${A}/kitchen/a1.jpg`, t: TA }));
  ok('R4 photo without service role fails closed', !(p.status >= 300 && p.status < 400), `status ${p.status}`);
  const r = await call(anonOnly.reports, q({ token: TA }));
  ok('R4 reports without service role fails closed', r.status !== 200, `status ${r.status}`);
}

// ── 5. The portal hands its token to every signed asset ──────────────────────────────
{
  const P = live.portal;
  ok('R5 lib/portalAssets exists', !!P);
  if (P) {
    ok('R5 assetUrl carries the token', P.assetUrl('photo', `${A}/k/a1.jpg`, TA) === `/api/photo?path=${encodeURIComponent(`${A}/k/a1.jpg`)}&t=${TA}`);
    const stored = `<img src="https://www.ledrixlabs.com/api/report-asset?path=report%2F${A}%2F0.jpg">`
      + `<div style="background:url(https://www.ledrixlabs.com/api/report-asset?path=report%2F${A}%2F1.jpg)"></div>`
      + `<img src='/api/photo?path=${A}%2Fk%2Fa1.jpg&amp;t=${TA}'>`;
    const out = P.withTokenInHtml(stored, TA);
    ok('R5 stored report.html photos get the token', out.includes(`path=report%2F${A}%2F0.jpg&t=${TA}"`) && out.includes(`path=report%2F${A}%2F1.jpg&t=${TA})`),
      out);
    ok('R5 a URL that already has a token is left alone', out.includes(`a1.jpg&amp;t=${TA}'`) && (out.match(/t=/g) ?? []).length === 3, out);
    // End to end: the rewritten URL is accepted by the real route.
    const url = new URL(out.match(/https:\/\/www\.ledrixlabs\.com(\/api\/report-asset\?[^"]+)/)[1], 'https://www.ledrixlabs.com');
    const r = await call(live.asset, url.searchParams.toString());
    ok('R5 the rewritten stored URL resolves through /api/report-asset', r.status >= 300 && r.status < 400 && r.signed[0]?.[1] === `report/${A}/0.jpg`, `status ${r.status}`);
  }
  const page = readFileSync(join(src, 'app/share/[id]/page.tsx'), 'utf8').replace(/\/\/.*$/gm, '');
  ok('R5 the portal builds no tokenless /api/photo or /api/report-asset URL',
    !/\/api\/(photo|report-asset)\?path=/.test(page),
    'every asset URL must go through assetUrl(…, PORTAL_TOKEN)');
  ok('R5 the portal routes every asset URL through assetUrl with the portal token',
    (page.match(/assetUrl\('(photo|report-asset)', [^)]*PORTAL_TOKEN\)/g) ?? []).length >= 6);
  ok('R5 the stored report HTML is tokenized before rendering', /withTokenInHtml\(t, PORTAL_TOKEN\)/.test(page));
}

server.close();
const label = src === repo ? 'working tree' : relative(repo, src) || src;
if (failures.length) {
  console.error(`verify-share-assets (${label}): ${failures.length} of ${checks} checks FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-share-assets (${label}): all ${checks} checks pass`);
