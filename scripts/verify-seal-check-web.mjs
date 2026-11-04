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
  // 2026-11-04 (owner: "click on those and go straight to the section to fix"): the phone's per-item list comes through,
  // each item carrying the Scope item it opens; an item the phone gave no link keeps its words and opens nothing.
  const listed = { ...hard, title: '2 components missing required facts', items: [
    { label: 'Heating System — Age', sub: 'Heating', fix: { label: 'Edit', route: { pathname: '/ScopeScreen', params: { inspectionId: 'i', nodeId: 'hvac_heating' } } } },
    { label: 'Mystery — Size' }] };
  const li = D.decideSeal({ gates: [listed], reports: [rep([])], team: [], labels: LABELS }).locks.find(l => l.key === 'gate:facts');
  ok('§1 a gate\'s items reach the lock, each with the Scope item it opens', li?.items?.length === 2 && li.items[0].nodeId === 'hvac_heating' && li.items[0].label === 'Heating System — Age' && li.items[0].sub === 'Heating', JSON.stringify(li));
  ok('§1 an item with no link keeps its words and opens nothing', li?.items?.[1]?.label === 'Mystery — Size' && !('nodeId' in (li?.items?.[1] ?? {})), JSON.stringify(li?.items?.[1]));
  ok('§1 a gate with no items has none on its lock (the detail text is shown)', !('items' in (h.locks.find(l => l.key === 'gate:facts') ?? {})));
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
function fakeServer({ conflicts = 0, conflictsFail = false, versions = [], reports = [], team = { people: [] }, docs = 'missing' } = {}) {
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
    // #104 inspection_documents: 'missing' = before it is applied (404), 'down' = a failed read, or the rows
    if (u.pathname === '/rest/v1/inspection_documents') return docs === 'missing' ? json({ code: 'PGRST205', message: 'no table' }, 404) : docs === 'down' ? json({ message: 'down' }, 500) : json(docs);
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
    const factsLock = r0.ok ? r0.locks.find(l => l.key === 'gate:facts') : null;
    ok('§2 …and every one of those facts opens its own Scope item (the phone\'s own nodeId, through the real gates)',
      !!factsLock?.items?.length && factsLock.items.every(it => typeof it.nodeId === 'string' && it.nodeId.length > 0 && /—/.test(it.label)), JSON.stringify(factsLock?.items));
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
    const rd = await run(fakeServer({ docs: 'down', reports: [rep([], 'Kelly')] }));
    const rdOk = await run(fakeServer({ docs: [{ doc_key: 'report_mapping', payload: { order: ['roofing'] }, updated_at: '2026-11-03T02:00:00.000Z', seq: 1 }], reports: [rep([], 'Kelly')] }));
    ok('§2 #104\'s documents: before the table exists the check runs (none); a failed read refuses; rows are read', r0.ok && !rd.ok && rd.code === 'unavailable' && rdOk.ok, JSON.stringify([rd, rdOk.ok]).slice(0, 300));
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
  const seal = read('lib/seal/seal.ts'); const sroute = read('app/api/inspections/[id]/seal/route.ts');
  ok('§3 the panel seals only through the route, after the attestation is ticked (never pre-ticked)', /disabled=\{!confirm\.attest \|\| confirm\.busy\}/.test(panel) && /attest: false/.test(panel) && !/record_report_version|report_seals|\.rpc\(/.test(panel));
  ok('§3 the seal route takes the bearer token; the seal holds no service key', /Bearer\\s\+\(\\S\+\)/.test(sroute) && !/SERVICE_ROLE|service_role/i.test(sroute + seal));
  ok('§3 the PDF goes through /api/render-pdf with the user\'s own session (its budget applies)', /\/api\/render-pdf/.test(seal) && /Authorization: H\.Authorization/.test(seal));
  ok('§3 the page has the Seal & send section', /id: 'seal', label: 'Seal & send'/.test(page) && /<SealPanel inspectionId=\{id\} lock=\{lock\} onOpenItem=/.test(page));
  // 2026-11-04: an item opens Scope at that item, and Scope can take you back
  ok('§3 a Seal & send item opens Scope at that item, with a way back', /onOpenItem=\{nodeId => \{ setScopeFocus\(\{ nodeId, n: Date\.now\(\) \}\); setSection\('scope'\)/.test(page)
    && /focus=\{scopeFocus\} onBackToSeal=/.test(page));
  return out;
}

// ── §5 the seal (10d) against a fake Supabase ──────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';
const shaHex = (x) => createHash('sha256').update(x).digest('hex');
function sealServer({ heartbeat = true, versions = [], reports = [rep([], 'Kelly')], sealsBefore = [], shareToken = null } = {}) {
  const base = fakeServer({ versions, reports });
  const inspRow = { ...FIX.inspection, status: 'in_progress', row_version: 4 };
  const writes = [];
  const seals = [...sealsBefore];
  const objects = new Map();
  const fetch = async (url, init = {}) => {
    const u = new URL(url); const m = init.method ?? 'GET'; const h = init.headers ?? {};
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
    if (h.Authorization !== `Bearer ${TOKEN}`) return json({ message: 'JWT' }, 401);
    const w = (kind, extra = {}) => writes.push({ kind, path: u.pathname, ...extra });
    if (u.pathname === '/rest/v1/rpc/heartbeat_edit') { const b = JSON.parse(init.body); w('heartbeat', { b }); return heartbeat ? json(null) : json({ message: 'not_lease_holder' }, 400); }
    if (u.pathname === '/rest/v1/report_seals' && m === 'GET') return json(seals.slice(-1).map(x => ({ hash: x.hash })));
    if (u.pathname === '/rest/v1/report_seals' && m === 'POST') { const b = JSON.parse(init.body); seals.push(b); w('seal', { b }); return new Response(null, { status: 201 }); }
    if (u.pathname === '/rest/v1/rpc/record_report_version') { const b = JSON.parse(init.body); w('version', { b }); return json({ version: versions.length + 1, digest: b.p_digest }); }
    if (u.pathname === '/rest/v1/home_records' && m === 'GET') return json(shareToken ? [{ share_token: shareToken }] : []);
    if (u.pathname === '/rest/v1/home_records' && m === 'POST') { w('commit', { b: JSON.parse(init.body) }); return new Response(null, { status: 201 }); }
    if (u.pathname === '/rest/v1/home_reports') { w('history', { b: JSON.parse(init.body) }); return new Response(null, { status: 201 }); }
    if (u.pathname === '/rest/v1/inspections' && m === 'PATCH') { w('complete', { b: JSON.parse(init.body) }); return new Response(null, { status: 204 }); }
    if (u.pathname === '/rest/v1/inspections' && m === 'GET') return json([inspRow]);
    if (u.pathname.startsWith('/storage/v1/object/authenticated/inspection-evidence/')) return new Response(Buffer.from(`jpeg:${u.pathname.split('/').pop()}`), { status: 200 });
    if (m === 'POST' && u.pathname.startsWith('/storage/v1/object/inspection-records/')) { w('record', { body: init.body }); return json({ Key: 'x' }); }
    if (m === 'POST' && u.pathname.startsWith('/storage/v1/object/inspection-pdfs/')) {
      const key = u.pathname.replace('/storage/v1/object/inspection-pdfs/', '');
      if (objects.has(key) && h['x-upsert'] !== 'true') return json({ error: 'Duplicate' }, 409);
      objects.set(key, true); w('pdfs', { key, upsert: h['x-upsert'] }); return json({ Key: key });
    }
    return base.fetch(url, init);
  };
  return { fetch, writes, calls: base.calls };
}
// The fixture owes required facts (a hard gate); the success path is run with those two facts' gate removed — the
// orchestration is what §5 tests; the gate itself is §2's and §5's refusal below.
const softOnly = async () => { const A = await import(pathToFileURL(join(ROOT, 'lib/report/assemble.mjs')).href);
  return { createAssembler: () => { const a = A.createAssembler(); return { ...a, assembleServerRecord: async (x) => { const r = await a.assembleServerRecord(x); return { ...r, gates: (r.gates ?? []).filter(g => !g.hard), hardGate: false }; } }; } }; };
const PDF = new Uint8Array(Buffer.from('%PDF-1.7 ' + 'x'.repeat(200)));
async function suiteSeal(file = 'lib/seal/seal.ts') {
  const out = []; const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
  try {
    const S = await fresh(file);
    const REQ = { attest: true, device: 'web_abc123', epoch: 7, expectNext: 1 };
    const run = (srv, req = REQ, extra = {}) => quiet(() => S.sealFromWebsite(INSP, req, { supaUrl: BASE, anonKey: 'anon', token: TOKEN, fetch: srv.fetch, origin: 'https://site', timeZone: 'America/Boise',
      renderPdf: async () => PDF, now: () => new Date('2026-11-03T20:00:00Z'), ...extra }));
    const writesOf = (srv) => srv.writes.filter(w => w.kind !== 'heartbeat');
    // refusals: nothing written
    const s1 = sealServer(); const r1 = await run(s1, { ...REQ, attest: false });
    ok('§5 not attested → refused, nothing written', !r1.ok && r1.code === 'not_attested' && s1.writes.length === 0, JSON.stringify(r1));
    const s2 = sealServer({ heartbeat: false }); const r2 = await run(s2, REQ, { loadAssemble: softOnly });
    ok('§5 without the edit lock on this browser → refused, nothing written', !r2.ok && r2.code === 'no_lock' && writesOf(s2).length === 0, JSON.stringify(r2));
    const s3 = sealServer({ versions: [{ version: 1 }] }); const r3 = await run(s3, REQ, { loadAssemble: softOnly });
    ok('§5 a version sealed since the person looked → refused, nothing written', !r3.ok && r3.code === 'changed' && writesOf(s3).length === 0, JSON.stringify(r3));
    const s4 = sealServer(); const r4 = await run(s4);
    ok('§5 a hard gate (the fixture\'s missing facts) → refused, nothing written', !r4.ok && r4.code === 'locked' && /missing required facts/.test(r4.error) && writesOf(s4).length === 0, JSON.stringify(r4));
    const s4b = sealServer({ reports: [] }); const r4b = await run(s4b, REQ, { loadAssemble: softOnly });
    ok('§5 no phone report → refused, nothing written', !r4b.ok && r4b.code === 'locked' && writesOf(s4b).length === 0);
    // success
    const s5 = sealServer(); const r5 = await run(s5, REQ, { loadAssemble: softOnly });
    const kinds = writesOf(s5).map(w => w.kind).filter((k, i, a) => !(k === 'pdfs' && a[i - 1] === 'pdfs'));
    ok('§5 sealed and sent: version 1, the homeowner link', r5.ok && r5.version === 1 && /^https:\/\/www\.ledrixlabs\.com\/share\/[0-9a-f]{32}$/.test(r5.shareUrl), JSON.stringify(r5).slice(0, 300));
    const order = ['seal', 'record', 'version', 'pdfs', 'commit', 'history', 'complete'];
    const firstIdx = (k) => kinds.indexOf(k);
    ok('§5 in the phone\'s order: seal → record → version → staged files → ONE commit → history → completed', order.every((k, i) => i === 0 || firstIdx(order[i - 1]) < firstIdx(k)) && kinds.filter(k => k === 'commit').length === 1, JSON.stringify(kinds));
    const seal = s5.writes.find(w => w.kind === 'seal')?.b; const rec = s5.writes.find(w => w.kind === 'record');
    const canon = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    ok('§5 the seal attests the record: its hash is the payload\'s, its digest the uploaded record\'s', seal && rec && seal.payload.input_digest === shaHex(rec.body) && seal.hash === shaHex(canon(seal.payload)) && seal.inspector_id === UID && seal.parent_hash === null,
      JSON.stringify(seal).slice(0, 300));
    const commit = s5.writes.find(w => w.kind === 'commit')?.b;
    const staged = s5.writes.filter(w => w.kind === 'pdfs').map(w => w.key);
    ok('§5 the commit switches the Home App to the staged PDF, with the token the report printed', commit && commit.pdf_url.endsWith(staged.find(k => k.endsWith('/report.pdf'))) && r5.shareUrl.endsWith(commit.share_token) && commit.share_id === INSP && commit.inspector_id === UID,
      JSON.stringify({ pdf: commit?.pdf_url, staged }));
    ok('§5 only confirmed findings are published, with public photo copies', commit && commit.anomalies.length > 0 && commit.anomalies.every(a => !a.imageUri || /\/object\/public\/inspection-pdfs\/insp_fixture_0001\/findings\/[0-9a-f]{32}\.jpg$/.test(a.imageUri)) && staged.some(k => /\/findings\//.test(k)), JSON.stringify(commit?.anomalies?.map(a => a.imageUri)));
    const fixed = s5.writes.filter(w => w.kind === 'pdfs' && w.upsert === 'true').map(w => w.key);
    ok('§5 the only overwrite is the fixed report.html, after the commit', JSON.stringify(fixed) === JSON.stringify([`${INSP}/report.html`]) && kinds.lastIndexOf('pdfs') > firstIdx('commit'), JSON.stringify(fixed));
    const done = s5.writes.find(w => w.kind === 'complete')?.b;
    ok('§5 completed under the lock: base version, this device, its epoch', done?.status === 'completed' && done.sync_device === 'web_abc123' && done.lease_epoch === 7 && done.sync_base_version === 4, JSON.stringify(done));
    // re-seal of an unchanged record: no second seal row
    const s6 = sealServer({ sealsBefore: [{ hash: seal.hash }] }); const r6 = await run(s6, REQ, { loadAssemble: softOnly });
    ok('§5 sealing the same record again writes no second seal (same hash)', r6.ok && r6.reSealed && !s6.writes.some(w => w.kind === 'seal'), JSON.stringify(r6).slice(0, 200));
    // the PDF fails: sealed, nothing on the Home App
    const s7 = sealServer(); const r7 = await run(s7, REQ, { loadAssemble: softOnly, renderPdf: async () => null });
    ok('§5 a failed PDF: sealed (says so), and nothing on the Home App changed', !r7.ok && r7.sealed === true && r7.code === 'pdf_failed' && !s7.writes.some(w => w.kind === 'commit' || w.kind === 'pdfs'), JSON.stringify(r7));
  } catch (e) { ok('§5 the seal completed', false, String(e?.stack ?? e).slice(0, 700)); }
  return out;
}

let pass = 0, fail = 0;
const report = (rs) => { for (const r of rs) { if (r.pass) { pass++; console.log(`  ✓ ${r.name}`); } else { fail++; console.log(`  ✗ ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`); } } };
console.log('verify-seal-check-web');
report(await suiteDecide());
report(await suiteCheck());
report(await suiteSeal());
report(suiteStatic());

console.log('\n§4 mutations');
const MUT = [
  { f: 'lib/seal/seal.ts', why: 'the edit lock is not checked', from: "  if (!hb.ok) return refuse(409, 'no_lock',", to: "  if (false) return refuse(409, 'no_lock',", suite: suiteSeal, expect: /^§5 without the edit lock/ },
  { f: 'lib/seal/seal.ts', why: 'a locked job is sealed anyway', from: "  if (!decision.sealable) return refuse(", to: "  if (false) return refuse(", suite: suiteSeal, expect: /^§5 (a hard gate|no phone report)/ },
  { f: 'lib/seal/seal.ts', why: 'the attestation is not required', from: "  if (req?.attest !== true) return refuse(", to: "  if (false) return refuse(", suite: suiteSeal, expect: /^§5 not attested/ },
  { f: 'lib/seal/seal.ts', why: 'the same record seals twice', from: "  const reSealed = parent === hash;", to: "  const reSealed = false;", suite: suiteSeal, expect: /^§5 sealing the same record again/ },
  { f: 'lib/seal/decide.ts', why: 'an unreported job is not locked', from: "  if (state === 'unreported') {", to: "  if (false) {", suite: suiteDecide, expect: /^§1 a job no phone/ },
  { f: 'lib/seal/decide.ts', why: 'unsent work does not lock', from: '    if (n > 0) locks.push(', to: '    if (false) locks.push(', suite: suiteDecide, expect: /^§1 unsent/ },
  { f: 'lib/seal/decide.ts', why: 'a soft gate locks', from: '      if (g.hard) { const items', to: '      if (true) { const items', suite: suiteDecide, expect: /^§1 nothing hard/ },
  { f: 'lib/seal/decide.ts', why: 'the items are dropped (owner 2026-11-04)', from: "...(items ? { items } : {}) });", to: "});", suite: suiteDecide, expect: /^§1 a gate's items reach/ },
  { f: 'lib/seal/decide.ts', why: 'an item loses the Scope item it opens', from: "...(typeof nodeId === 'string' && nodeId ? { nodeId } : {})", to: "", suite: suiteDecide, expect: /^§1 a gate's items reach/ },
  { f: 'lib/seal/check.ts', why: 'conflicts not passed to the gates', from: 'gates: { isFinalized, openConflicts: conflicts }', to: 'gates: { isFinalized, openConflicts: 0 }', suite: suiteCheck, expect: /^§2 (two blocking|conflicts that could not)/ },
  { f: 'lib/seal/check.ts', why: 'a failed read of the documents is taken as none', from: '|| !photos || !documents) return', to: '|| !photos) return', suite: suiteCheck, expect: /^§2 #104/ },
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
