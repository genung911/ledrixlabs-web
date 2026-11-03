#!/usr/bin/env node
// verify-seal-check-web — the Seal & send panel's check (10c of ledrix-app "Seal and send on the website", DECISIONS
// 2026-11-03 (fourth); mockup screens 1–2): lib/seal/decide.ts, lib/seal/check.ts, the route and the panel.
//   node scripts/verify-seal-check-web.mjs      (LEDRIX_APP=<dir> for another app checkout; the app is required)
//
//   §1 decide (pure): hard gates lock, soft gates inform; a job no phone has reported on locks; a phone holding parts
//      locks and names them; unsent work locks; gates that could not run lock; nothing → sealable
//   §2 loadSealCheck against a FAKE Supabase serving the app's own fixture job (scripts/report-bundle/serverFixture):
//      the gates are the app's own for the same rows; conflicts lock, and unknown conflicts fail closed; a re-seal; the
//      preview renders; every request is the user's own (bearer token), read-only (no write method but the two read
//      RPCs and photo signing); signed out is refused
//   §3 static: the route needs a bearer token and holds no service key; the panel's frame runs no script; the page
//      has the section
//   §4 mutations — each rule broken once must fail here
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ?? join(ROOT, '..', 'ledrix-app');
registerHooks({
  resolve(spec, ctx, next) { if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]sx?$|\.json$/.test(spec)) { try { return next(spec + '.ts', ctx); } catch { /* not ours */ } } return next(spec, ctx); },
  load(url, ctx, next) { if (url.split('?')[0].endsWith('.json')) return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url.split('?')[0]), 'utf8')};`, shortCircuit: true }; return next(url, ctx); },
});
if (!existsSync(join(APP, 'scripts/report-bundle/serverFixture.mjs'))) { console.log(`✗ ledrix-app not found at ${APP} (LEDRIX_APP=<dir>)`); process.exit(1); }
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = (...a) => { if (!String(a[0]).startsWith('[231.x pack]')) l(...a); }; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
let n = 0; const fresh = (f) => import(pathToFileURL(join(ROOT, f)).href + `?v=${++n}`);

// ── §1 decide ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const LABELS = { extras: 'Report extras', coverImageUris: 'Cover photos', sopProgress: 'Photo checklist' };
const rep = (parts, name = 'Jordan') => ({ user_id: `u_${name}`, name, device: 'iphone', parts, reported_at: '2026-11-03T18:00:00Z' });
async function suiteDecide(file = 'lib/seal/decide.ts') {
  const out = []; const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
  const D = await fresh(file);
  const soft = { key: 'concerns', hard: false, title: 'Ledrix final check (optional)' };
  const hard = { key: 'facts', hard: true, title: '1 component missing required facts', detail: 'Water Heater — Location' };
  const clear = D.decideSeal({ gates: [soft], reports: [rep([])], team: [], labels: LABELS });
  ok('§1 nothing hard, every phone clear → sealable; a soft gate is a note', clear.sealable && clear.locks.length === 0 && clear.notes.length === 1 && clear.phoneOnly.state === 'clear', JSON.stringify(clear));
  const h = D.decideSeal({ gates: [hard, soft], reports: [rep([])], team: [], labels: LABELS });
  ok('§1 a hard gate locks, with its detail', !h.sealable && h.locks.some(l => l.key === 'gate:facts' && /Location/.test(l.detail)), JSON.stringify(h.locks));
  const un = D.decideSeal({ gates: [], reports: [], team: [], labels: LABELS });
  ok('§1 a job no phone has reported on locks (the website cannot know what a phone holds)', !un.sealable && un.phoneOnly.state === 'unreported' && un.locks.some(l => l.key === 'phone-only'), JSON.stringify(un));
  const parts = D.decideSeal({ gates: [], reports: [rep(['coverImageUris', 'extras']), rep([], 'Kelly')], team: [], labels: LABELS });
  ok('§1 a phone holding parts locks, naming the phone and the parts in words', !parts.sealable && parts.phoneOnly.state === 'parts'
    && parts.locks.some(l => /Jordan/.test(l.title) && /Cover photos · Report extras/.test(l.detail)), JSON.stringify(parts.locks));
  const uns = D.decideSeal({ gates: [], reports: [rep([])], team: [{ user_id: 'u2', name: 'Sam', unsent: 3 }, { user_id: 'u3', name: 'Lee', unsent: 0 }], labels: LABELS });
  ok('§1 unsent work on a teammate\'s phone locks (only theirs, with the count)', !uns.sealable && uns.locks.length === 1 && /Sam's phone has 3 changes not sent/.test(uns.locks[0].title), JSON.stringify(uns.locks));
  const nul = D.decideSeal({ gates: null, reports: [rep([])], team: [], labels: LABELS });
  ok('§1 gates that could not run lock (fail closed)', !nul.sealable && nul.locks.some(l => l.key === 'gates'));
  return out;
}

// ── §2 loadSealCheck against a fake Supabase ────────────────────────────────────────────────────────────────────────
const SF = await import(pathToFileURL(join(APP, 'scripts/report-bundle/serverFixture.mjs')).href);
const DL = await import(pathToFileURL(join(APP, 'scripts/report-bundle/direct.mjs')).href);
const { rows: FIX } = await quiet(() => SF.recordOnPhone(DL.createLoader(), { live: true, client: true }));
const INSP = FIX.inspection.id;
const BASE = 'https://proj.supabase.example';
const TOKEN = 'user-jwt-123';
const UID = FIX.sealer.id;
function fakeServer({ conflicts = 0, conflictsFail = false, versions = [], reports = [], team = { people: [] } } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url); const h = init.headers ?? {};
    calls.push({ path: u.pathname, method: init.method ?? 'GET', auth: h.Authorization });
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
    if (h.Authorization !== `Bearer ${TOKEN}`) return json({ message: 'JWT' }, 401);
    const T = { inspections: [FIX.inspection], anomalies: FIX.anomalies, technical_specs: FIX.technicalSpecs, inspection_values: FIX.values,
      inspection_templates: FIX.template ? [FIX.template] : [], measurements: FIX.measurements, inspection_photos: FIX.photos,
      inspector_profiles: [{ full_name: FIX.sealer.full_name, company_name: FIX.sealer.company_name, license_number: FIX.sealer.license_number }],
      report_versions: versions };
    if (u.pathname === '/auth/v1/user') return json({ id: UID, email: FIX.sealer.email });
    if (u.pathname === '/rest/v1/inspection_conflicts') return conflictsFail ? json({ message: 'down' }, 500) : json(Array.from({ length: conflicts }, (_, i) => ({ id: `c${i}` })));
    if (u.pathname === '/rest/v1/rpc/job_phone_only') return json(reports);
    if (u.pathname === '/rest/v1/rpc/job_team') return json(team);
    if (u.pathname === '/storage/v1/object/sign/inspection-evidence') {
      const { paths } = JSON.parse(init.body);
      return json(paths.map(p => ({ path: p, signedURL: `/object/sign/inspection-evidence/${p}?token=s`, error: null })));
    }
    const t = u.pathname.replace('/rest/v1/', '');
    if (t in T) return json(T[t]);
    return json({ message: 'no route' }, 404);
  };
  return { fetch, calls };
}
const appGates = async (o) => (await quiet(() => DL.createLoader({ assembly: true }).require(join(APP, 'scripts/report-bundle/assemble-entry.ts'))
  .assembleServerRecord({ rows: FIX, timeZone: 'America/Boise', gates: o }))).gates;

async function suiteCheck(file = 'lib/seal/check.ts') {
  const out = []; const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
  try {
    const C = await fresh(file);
    const run = (srv, token = TOKEN) => quiet(() => C.loadSealCheck(INSP, { supaUrl: BASE, anonKey: 'anon', token, fetch: srv.fetch, timeZone: 'America/Boise' }));
    const s0 = fakeServer({ reports: [rep([], 'Kelly')] });
    const r0 = await run(s0);
    const want0 = await appGates({ isFinalized: false, openConflicts: 0 });
    const lockKeys = (r) => r.locks.map(l => l.key).sort();
    ok('§2 the check runs on the app\'s fixture job', r0.ok === true, JSON.stringify(r0).slice(0, 300));
    ok('§2 its gates are the app\'s own for the same rows (hard → locks, soft → notes)',
      r0.ok && JSON.stringify(lockKeys(r0)) === JSON.stringify(want0.filter(g => g.hard).map(g => `gate:${g.key}`).sort())
      && JSON.stringify(r0.notes.map(g => g.key)) === JSON.stringify(want0.filter(g => !g.hard).map(g => g.key)), JSON.stringify([r0.locks, r0.notes, want0]));
    ok('§2 …the fixture owes required facts, so it is locked, and says which', r0.ok && !r0.sealable && r0.locks.some(l => l.key === 'gate:facts' && /—/.test(l.detail)));
    const r2 = await run(fakeServer({ conflicts: 2, reports: [rep([], 'Kelly')] }));
    ok('§2 two blocking conflicts lock it', r2.ok && r2.conflicts === 2 && r2.locks.some(l => /conflict/.test(l.key)), JSON.stringify(r2.locks?.map(l => l.key)));
    const rf = await run(fakeServer({ conflictsFail: true, reports: [rep([], 'Kelly')] }));
    ok('§2 conflicts that could not be read fail closed (a lock)', rf.ok && rf.conflicts === null && rf.locks.length > r0.locks.length, JSON.stringify(rf.locks?.map(l => l.key)));
    const rv = await run(fakeServer({ versions: [{ version: 3 }], reports: [rep([], 'Kelly')] }));
    ok('§2 a job sealed before is a re-seal: version 4, and no first-seal notes', rv.ok && rv.isFinalized && rv.nextVersion === 4 && !rv.notes.some(n => n.key === 'missed'), JSON.stringify([rv.isFinalized, rv.nextVersion, rv.notes?.map(n => n.key)]));
    const ru = await run(fakeServer({ reports: [] }));
    ok('§2 no phone report → locked as unreported', ru.ok && ru.phoneOnly.state === 'unreported' && ru.locks.some(l => l.key === 'phone-only'));
    const rp = await run(fakeServer({ reports: [rep(['coverImageUris'], 'Jordan')] }));
    ok('§2 a phone report names the part in the app\'s words and maps it as phone-only', rp.ok && rp.locks.some(l => /Cover photos/.test(l.detail)) && rp.dataMap.some(d => d.label === 'Cover photos' && d.where === 'phone'), JSON.stringify(rp.dataMap));
    ok('§2 the preview renders from the assembled record, photos signed', r0.ok && r0.preview?.html?.length > 40000 && r0.preview.photos.shown > 0, JSON.stringify(r0.preview?.photos));
    const writes = s0.calls.filter(c => c.method !== 'GET' && !['/rest/v1/rpc/job_phone_only', '/rest/v1/rpc/job_team', '/storage/v1/object/sign/inspection-evidence'].includes(c.path));
    ok('§2 every request is the user\'s own and read-only', s0.calls.length > 8 && s0.calls.every(c => c.auth === `Bearer ${TOKEN}`) && writes.length === 0, JSON.stringify(writes));
    const so = await run(fakeServer(), '');
    const sb = await run(fakeServer(), 'someone-else');
    ok('§2 signed out (no token, or a token the server refuses) is refused', !so.ok && so.code === 'signed_out' && !sb.ok && sb.code === 'signed_out', JSON.stringify([so, sb]));
  } catch (e) { ok('§2 the check completed', false, String(e?.stack ?? e).slice(0, 600)); }
  return out;
}

// ── §3 static ────────────────────────────────────────────────────────────────────────────────────────────────────────
function suiteStatic() {
  const out = []; const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
  const route = read('app/api/inspections/[id]/seal-check/route.ts');
  const lib = read('lib/seal/check.ts') + read('lib/seal/decide.ts');
  const panel = read('components/workspace/SealPanel.tsx');
  const page = read('app/app/inspections/[id]/page.tsx');
  ok('§3 the route takes the user\'s bearer token and holds no service key', /Bearer\\s\+\(\\S\+\)/.test(route) && !/SERVICE_ROLE|service_role/i.test(route + lib));
  ok('§3 the check writes nothing (no insert/update/upsert/delete, no write RPC)', !/\.(insert|update|upsert|delete)\(|method: '(PATCH|DELETE|PUT)'/.test(lib) && [...lib.matchAll(/rpc\('(\w+)'/g)].every(m => ['job_phone_only', 'job_team'].includes(m[1])));
  ok('§3 the preview frame runs no script (sandbox="")', /<iframe[^>]*sandbox=""/.test(panel) && !/allow-scripts/.test(panel));
  ok('§3 the panel does not seal yet (10d): its button is disabled', /<button type="button" disabled/.test(panel) && !/record_report_version|report_seals/.test(panel + lib));
  ok('§3 the page has the Seal & send section', /id: 'seal', label: 'Seal & send'/.test(page) && /<SealPanel inspectionId=\{id\} lock=\{lock\} \/>/.test(page));
  return out;
}

let pass = 0, fail = 0;
const report = (rs) => { for (const r of rs) { if (r.pass) { pass++; console.log(`  ✓ ${r.name}`); } else { fail++; console.log(`  ✗ ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`); } } };
console.log('verify-seal-check-web');
report(await suiteDecide());
report(await suiteCheck());
report(suiteStatic());

console.log('\n§4 mutations');
const MUT = [
  { f: 'lib/seal/decide.ts', why: 'an unreported job is not locked', from: "  if (state === 'unreported') {", to: "  if (false) {", suite: suiteDecide, expect: /^§1 a job no phone/ },
  { f: 'lib/seal/decide.ts', why: 'unsent work does not lock', from: '    if (n > 0) locks.push(', to: '    if (false) locks.push(', suite: suiteDecide, expect: /^§1 unsent/ },
  { f: 'lib/seal/decide.ts', why: 'a soft gate locks', from: '      if (g.hard) locks.push(', to: '      if (true) locks.push(', suite: suiteDecide, expect: /^§1 nothing hard/ },
  { f: 'lib/seal/check.ts', why: 'conflicts not passed to the gates', from: 'gates: { isFinalized, openConflicts: conflicts }', to: 'gates: { isFinalized, openConflicts: 0 }', suite: suiteCheck, expect: /^§2 (two blocking|conflicts that could not)/ },
  { f: 'lib/seal/check.ts', why: 'a sealed job not treated as a re-seal', from: 'const isFinalized = lastVersion > 0;', to: 'const isFinalized = false;', suite: suiteCheck, expect: /^§2 a job sealed before/ },
];
for (const m of MUT) {
  const src = read(m.f);
  if (src.split(m.from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${m.why}`); continue; }
  const tmp = m.f.replace(/([^/]+)\.ts$/, '.__mut_$1.ts');
  writeFileSync(join(ROOT, tmp), src.replace(m.from, m.to));
  let res;
  try { res = await m.suite(tmp); } finally { rmSync(join(ROOT, tmp), { force: true }); }
  if (res.some(r => !r.pass && m.expect.test(r.name))) { pass++; console.log(`  ✓ caught: ${m.why}`); } else { fail++; console.log(`  ✗ NOT caught: ${m.why}`); }
}
console.log(`\nverify-seal-check-web — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
