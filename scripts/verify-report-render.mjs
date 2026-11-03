#!/usr/bin/env node
// verify-report-render — the website renders a sealed report with the phone's own report builder (ledrix-app
// DECISIONS 2026-11-02, "Seal and send on the website", step 2).
//
//   node scripts/verify-report-render.mjs      (LEDRIX_APP=<dir> for another app checkout; ALLOW_NO_APP=1 skips §1–§2)
//
//   §1 PROVENANCE: lib/report/render.mjs was built from exactly the app's current report sources (render.meta.json's
//      sha256 over every source file, ledrix-app bundleSources) — the copy rule verify-scope-web applies to scopeRules
//   §2 PARITY: the committed bundle renders the app's fixture records byte-identical to the app's own code run
//      unbundled (ledrix-app scripts/report-bundle/direct.mjs)
//   §3 lib/report/sealedReport.ts against a FAKE Supabase: the newest version, its bytes proved against the digest, the
//      pack it names (checksum-verified) or a refusal, the photos signed in one batch as the user, every request
//      carrying the user's own token; each refusal (signed out, not sealed, missing, tampered, wrong path, unknown
//      schema, missing or corrupt pack)
//   §4 the ROUTE: node runtime, no service-role key, forwards the caller's token, no cache
//   §5 mutations
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ?? join(ROOT, '..', 'ledrix-app');
registerHooks({
  // `.ts` for the website's own extension-less imports — falling back to the plain specifier, so packages' CommonJS
  // `require('./server')` (qrcode, inside the app's direct run) still resolves.
  resolve(spec, ctx, next) { if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]sx?$|\.json$/.test(spec)) { try { return next(spec + '.ts', ctx); } catch { /* not ours */ } } return next(spec, ctx); },
  load(url, ctx, next) { if (url.endsWith('.json')) return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`, shortCircuit: true }; return next(url, ctx); },
});
const out = []; const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const quiet = async (fn) => { const l = console.log; console.log = (...a) => { if (!String(a[0]).startsWith('[231.x pack]')) l(...a); }; try { return await fn(); } finally { console.log = l; } };
const sha = (s) => createHash('sha256').update(s).digest('hex');

const meta = JSON.parse(read('lib/report/render.meta.json'));
const bundleUrl = pathToFileURL(join(ROOT, 'lib/report/render.mjs')).href;
const R = await quiet(() => import(bundleUrl));
const hasApp = existsSync(join(APP, 'scripts/build-report-bundle.mjs'));

// ── §1 provenance ───────────────────────────────────────────────────────────────────────────────────────────────────
if (!hasApp) {
  if (process.env.ALLOW_NO_APP !== '1') { console.log(`✗ ledrix-app not found at ${APP} (LEDRIX_APP=<dir>, or ALLOW_NO_APP=1 to skip §1–§2)`); process.exit(1); }
  console.log(`§1–§2 skipped — ledrix-app not found at ${APP}`);
} else {
  const B = await import(pathToFileURL(join(APP, 'scripts/build-report-bundle.mjs')).href);
  const src = await B.bundleSources();
  ok('§1 the bundle was built from the app\'s current report sources', meta.sourcesSha256 === src.sha256,
    `render.meta.json ${meta.sourcesSha256?.slice(0, 12)} · app ${src.sha256.slice(0, 12)} — run ledrix-app \`npm run export:report-bundle\``);
  ok('§1 …and says so in its own banner', read('lib/report/render.mjs').slice(0, 600).includes(src.sha256));
  ok('§1 …not from uncommitted app sources', meta.appSourcesDirty === false && /^[0-9a-f]{40}$/.test(meta.appCommit ?? ''));
  const pack = JSON.parse(readFileSync(join(APP, 'src/core/taxonomy/ledrix.core.json'), 'utf8')).packVersion;
  ok('§1 the bundle ships the app\'s pack', R.BUNDLED_PACK_VERSION === pack && meta.packVersion === pack, `${R.BUNDLED_PACK_VERSION} / ${pack}`);
  const schema = Number(/export const FROZEN_RECORD_SCHEMA = (\d+);/.exec(readFileSync(join(APP, 'src/core/services/frozenRecordUpload.ts'), 'utf8'))?.[1]);
  ok('§1 …and reads the record schema the phone uploads', meta.frozenRecordSchema === schema);

  // ── §2 parity with the app's own code ────────────────────────────────────────────────────────────────────────────
  const D = await quiet(async () => (await import(pathToFileURL(join(APP, 'scripts/report-bundle/direct.mjs')).href)).loadDirectEntry());
  const F = await import(pathToFileURL(join(APP, 'scripts/report-bundle/fixtures.mjs')).href);
  const photo = (u) => `https://x.example/${u.split('/').pop()}`;
  for (const name of Object.keys(F.FIXTURES)) {
    const a = () => ({ inspectionId: F.INSPECTION_ID, record: F.fixture(name), revision: { version: 2, digest: 'a'.repeat(64) }, photoUrl: photo, shareToken: F.SHARE_TOKEN });
    const hb = await quiet(() => R.renderSealedReportHtml(a()));
    const hd = await quiet(() => D.renderSealedReportHtml(a()));
    ok(`§2 '${name}': the website's bundle renders exactly what the app's own code does`, hb === hd && hb.length > 20000, `${hb.length} / ${hd.length}`);
    ok(`§2 '${name}': …QR code included`, /width="148" height="148" viewBox="0 0 \d+ \d+"><path/.test(hb));
  }
}

// ── §3 sealedReport against a fake Supabase ─────────────────────────────────────────────────────────────────────────
const S = await import(pathToFileURL(join(ROOT, 'lib/report/sealedReport.ts')).href);
const INSP = 'insp_fixture_0001';
const BASE = 'https://proj.supabase.example';
const TOKEN = 'user-jwt-123';
const corePack = R.BUNDLED_PACK_VERSION;
const FIX = hasApp ? await import(pathToFileURL(join(APP, 'scripts/report-bundle/fixtures.mjs')).href) : null;
const sampleRecord = () => FIX ? FIX.fixture('full') : {
  inputs: { inspection: { address: '1 Test St', state: 'ID' }, reportIdentity: { inspector: 'T', date: '2026-11-03T02:30:00Z' }, reportTimeZone: 'America/Boise',
    findings: [{ id: 'f1', status: 'confirmed', severity: 'deficiency', description: 'A test finding with enough words to show.', unit: 'INTERIOR', imageUri: `file:///x/ledrix/evidence/${INSP}/ev_1.jpg` }],
    specInventory: [], activeSystems: [], limitations: { systems: {}, slots: {} } },
  refs: { taxonomyPackVersion: corePack }, evidence: [],
};

const SHARE = 'shr_fixture_7Kq2Lm9Pz4';
function fakeServer({ record, version = 3, schema = 1, objectPath, tamper = false, objectMissing = false, rows, packs = {}, signFails = false, shareToken = SHARE } = {}) {
  const bytes = JSON.stringify(record ?? sampleRecord());
  const digest = sha(bytes);
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url); const h = init.headers ?? {};
    calls.push({ url, method: init.method ?? 'GET', auth: h.Authorization, apikey: h.apikey, body: init.body });
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
    if (h.Authorization !== `Bearer ${TOKEN}`) return json({ message: 'JWT' }, 401);
    if (u.pathname === '/rest/v1/report_versions') {
      const all = rows ?? [{ version, digest, object_path: objectPath ?? `${INSP}/${digest}.json`, input_schema_version: schema, created_at: '2026-11-03T03:00:00Z' }];
      const want = /version=eq\.(\d+)/.exec(u.search)?.[1];
      return json(all.filter(r => !want || String(r.version) === want));
    }
    if (u.pathname.startsWith('/storage/v1/object/authenticated/inspection-records/')) {
      if (objectMissing) return json({ error: 'not_found' }, 400);
      return new Response(tamper ? bytes.replace('Boise', 'Bo1se') : bytes, { status: 200 });
    }
    if (u.pathname === '/storage/v1/object/sign/inspection-evidence') {
      if (signFails) return json({ message: 'denied' }, 403);
      const { paths } = JSON.parse(init.body);
      return json(paths.map(p => ({ path: p, signedURL: `/object/sign/inspection-evidence/${p}?token=s`, error: null })));
    }
    if (u.pathname === '/rest/v1/home_records') {
      return json(shareToken && u.search.includes(`share_id=eq.${INSP}`) ? [{ share_token: shareToken }] : []);
    }
    if (u.pathname === '/rest/v1/taxonomy_packs') {
      const v = decodeURIComponent(/pack_version=eq\.([^&]+)/.exec(u.search)?.[1] ?? '');
      return json(packs[v] ? [packs[v]] : []);
    }
    return json({ message: 'no route' }, 404);
  };
  return { fetch, calls, digest };
}
const deps = (srv, extra = {}) => ({ supaUrl: BASE, anonKey: 'anon-key', token: TOKEN, fetch: srv.fetch, load: async () => R, ...extra });

{
  const srv = fakeServer();
  const r = await quiet(() => S.loadSealedReport(INSP, null, deps(srv)));
  ok('§3 renders the newest sealed version', r.ok && r.version === 3 && r.digest === srv.digest, JSON.stringify(r).slice(0, 200));
  const rec = sampleRecord();
  const findingPhotos = rec.inputs.findings.length;
  ok('§3 every saved photo is shown, signed for this user', r.ok && r.photos.shown === findingPhotos && rec.inputs.findings.every(f => r.html.includes(`${BASE}/storage/v1/object/sign/inspection-evidence/${INSP}/photos/${f.imageUri.split('/').pop()}?token=s`)), JSON.stringify(r.photos));
  ok('§3 …a photo not on the server yet is counted, not linked', r.ok && (FIX ? r.photos.phoneOnly === 1 : r.photos.phoneOnly === 0) && !/file:\/\//.test(r.html));
  const signs = srv.calls.filter(c => c.url.includes('/object/sign/'));
  ok('§3 …in one batch, of this inspection\'s photos only', signs.length === 1 && JSON.parse(signs[0].body).paths.every(p => p.startsWith(`${INSP}/`)));
  ok('§3 every request goes as the user (their token, the public key) — no service key', srv.calls.length >= 3 && srv.calls.every(c => c.auth === `Bearer ${TOKEN}` && c.apikey === 'anon-key'));
  if (hasApp) {
    const D = await quiet(async () => (await import(pathToFileURL(join(APP, 'scripts/report-bundle/direct.mjs')).href)).loadDirectEntry());
    const signedFor = (u) => { const p = R.serverPhotoFor(u, INSP); return p.kind === 'stored' ? `${BASE}/storage/v1/object/sign/inspection-evidence/${p.path}?token=s` : p.kind === 'url' ? p.url : null; };
    const phone = await quiet(() => D.renderSealedReportHtml({ inspectionId: INSP, record: rec, revision: { version: 3, digest: srv.digest }, photoUrl: signedFor, shareToken: SHARE }));
    ok('§3 the page is the one the phone\'s own code renders from that record', r.ok && r.html === phone, r.ok ? (() => { let i = 0; while (i < r.html.length && r.html[i] === phone[i]) i++; return `${r.html.length} vs ${phone.length} at ${i}: ${JSON.stringify(r.html.slice(i - 60, i + 60))} | ${JSON.stringify(phone.slice(i - 60, i + 60))}`; })() : '');
    ok('§3 …with the QR code to the homeowner\'s report, as the phone prints it', r.ok && r.qr === true && r.html.includes(`ledrixlabs.com/share/${SHARE}`) && /width="148" height="148" viewBox="0 0 \d+ \d+"><path/.test(r.html));
  }
  const v2 = fakeServer({ rows: [{ version: 2, digest: srv.digest, object_path: `${INSP}/${srv.digest}.json`, input_schema_version: 1 }, { version: 3, digest: 'f'.repeat(64), object_path: `${INSP}/${'f'.repeat(64)}.json`, input_schema_version: 1 }] });
  const r2 = await quiet(() => S.loadSealedReport(INSP, 2, deps(v2)));
  ok('§3 a named version is that version', r2.ok && r2.version === 2 && v2.calls[0].url.includes('version=eq.2'));
}
const code = async (srvOpts, version = null, dep = {}) => { const r = await quiet(() => S.loadSealedReport(INSP, version, deps(fakeServer(srvOpts), dep))); return r.ok ? 'ok' : r.code; };
ok('§3 signed out → signed_out', (await quiet(() => S.loadSealedReport(INSP, null, deps(fakeServer(), { token: '' })))).code === 'signed_out');
ok('§3 no sealed version → not_sealed', await code({ rows: [] }) === 'not_sealed');
ok('§3 the record object not uploaded yet → record_missing', await code({ objectMissing: true }) === 'record_missing');
ok('§3 bytes that do not hash to the digest → record_mismatch (never shown)', await code({ tamper: true }) === 'record_mismatch');
ok('§3 a row naming another path → record_mismatch', await code({ objectPath: `other/${'a'.repeat(64)}.json` }) === 'record_mismatch');
ok('§3 a record schema this build does not know → record_schema', await code({ schema: 2 }) === 'record_schema');
ok('§3 a bad id or version → bad_request', (await quiet(() => S.loadSealedReport('../x', null, deps(fakeServer())))).code === 'bad_request' && (await quiet(() => S.loadSealedReport(INSP, -1, deps(fakeServer())))).code === 'bad_request');
{
  const other = '2026.01.01.1';
  const rec = sampleRecord(); rec.refs.taxonomyPackVersion = other;
  const core = JSON.parse(readFileSync(join(hasApp ? APP : ROOT, hasApp ? 'src/core/taxonomy/ledrix.core.json' : 'lib/scope/core/taxonomy/ledrix.core.json'), 'utf8'));
  const alt = JSON.parse(JSON.stringify(core)); alt.packVersion = other;
  const key = ['label', 'name', 'title'].find(k => typeof alt.systems?.[0]?.[k] === 'string');
  for (const s of alt.systems) s[key] = `${s[key]} (pack ${other})`;
  const text = JSON.stringify(alt);
  ok('§3 the pack it names is not on the server → pack_missing', await code({ record: rec }) === 'pack_missing');
  ok('§3 a pack that fails its checksum → pack_mismatch', await code({ record: rec, packs: { [other]: { pack_json: text, checksum: 'sha256:' + '0'.repeat(64) } } }) === 'pack_mismatch');
  const srv = fakeServer({ record: rec, packs: { [other]: { pack_json: text, checksum: `sha256:${sha(text)}` } } });
  const [withAlt, plain] = await Promise.all([
    quiet(() => S.loadSealedReport(INSP, null, deps(srv))),
    quiet(() => S.loadSealedReport(INSP, null, deps(fakeServer()))),
  ]);
  ok('§3 with the exact pack it names, it renders with that pack', withAlt.ok && withAlt.html.includes(`(pack ${other})`) && withAlt.packVersion === other);
  ok('§3 …while a render of another record at the same moment keeps the bundled pack (one render at a time)', plain.ok && !plain.html.includes(`(pack ${other})`));
}
ok('§3 a report never published prints no QR code (as on the phone)', await (async () => { const r = await quiet(() => S.loadSealedReport(INSP, null, deps(fakeServer({ shareToken: null })))); return r.ok && r.qr === false && !r.html.includes('ledrixlabs.com/share/'); })());
ok('§3 a photo signing failure leaves photos out, it does not fail the report', await (async () => { const r = await quiet(() => S.loadSealedReport(INSP, null, deps(fakeServer({ signFails: true })))); return r.ok && r.photos.shown === 0 && !/file:\/\//.test(r.html); })());

// ── §4 the route ────────────────────────────────────────────────────────────────────────────────────────────────────
const route = read('app/api/inspections/[id]/report/route.ts');
const lib = read('lib/report/sealedReport.ts');
ok('§4 the route runs on Node and is never cached', /export const runtime = 'nodejs'/.test(route) && /export const dynamic = 'force-dynamic'/.test(route) && /'Cache-Control': 'private, no-store'/.test(route));
ok('§4 …forwards the caller\'s own token to loadSealedReport', /authorization/.test(route) && /loadSealedReport\(id, version, \{ supaUrl: SUPA_URL, anonKey: ANON, token \}\)/.test(route));
ok('§4 no service-role key in the route or the module', !/SERVICE_ROLE/.test(route) && !/SERVICE_ROLE/.test(lib));
ok('§4 the bundle is generated, not edited (its banner)', read('lib/report/render.mjs').startsWith('// GENERATED — do not edit.'));

// ── §5 mutations ────────────────────────────────────────────────────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'report-render-'));
try {
  const mutate = async (from, to) => {
    const p = join(tmp, `m${Math.random().toString(36).slice(2)}.ts`);
    copyFileSync(join(ROOT, 'lib/report/render.meta.json'), join(tmp, 'render.meta.json'));
    writeFileSync(p, lib.replace(from, to));
    return import(pathToFileURL(p).href);
  };
  const noHash = await mutate("if (sha256(bytes) !== digest) return refuse(", "if (false) return refuse(");
  const r = await quiet(() => noHash.loadSealedReport(INSP, null, deps(fakeServer({ tamper: true }))));
  ok('§5 mutation: without the digest check a tampered record would render (the check is what refuses it)', r.ok === true);
  const anyPath = await mutate("inspectionId && path.startsWith", "inspectionId && path.startsWith");   // control: unchanged module renders
  ok('§5 control: the unchanged module still refuses the tampered record', (await quiet(() => anyPath.loadSealedReport(INSP, null, deps(fakeServer({ tamper: true }))))).code === 'record_mismatch');
} finally { rmSync(tmp, { recursive: true, force: true }); }

const failed = out.filter(o => !o.pass);
for (const o of out) console.log(`${o.pass ? '✓' : '✗'} ${o.name}${!o.pass && o.detail ? `\n    ${o.detail}` : ''}`);
console.log(`\n${out.length - failed.length}/${out.length} checks passed`);
process.exit(failed.length ? 1 : 0);
