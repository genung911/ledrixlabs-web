#!/usr/bin/env node
// verify-repair-status — approval pack items 2 + 3 (owner 2026-11-25): the Home Record's repair status pill and the
// inspector's check requests. Runs the real route and loader against a stubbed server, and reads the page source.
//   A · /api/portal reads home_finding_status select-only, and never the homeowner's note or who changed it
//   B · lib/checkRequests: the CALLER's token reads first (RLS decides); the service role only after rows came back
//   C · the page: the pill opens only for the home's holder; the sheet's opt-in; the card's Mark verified; Book a re-check
// `--mutate` proves each check can fail (in memory; files are never written).
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shareSource } from './lib/shareSource.mjs';

let MUT = null; let RUN = 0;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'next/server') return next('next/server.js', ctx);
    let r;
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.[a-z]+$/i.test(spec)) { try { r = next(spec + '.ts', ctx); } catch {} }
    r = r ?? next(spec, ctx);
    if (r.url.startsWith('file:') && !r.url.includes('node_modules') && ctx.parentURL?.includes('?run=')) r = { ...r, url: r.url.split('?')[0] + '?run=' + ctx.parentURL.split('?run=')[1] };
    return r;
  },
  load(url, ctx, next) {
    const res = next(url, ctx);
    if (MUT && url.split('?')[0].endsWith(MUT.file)) {
      const src = String(res.source ?? readFileSync(fileURLToPath(url.split('?')[0]), 'utf8'));
      return { ...res, source: src.replace(MUT.from, MUT.to) };
    }
    return res;
  },
});
const BASE = 'https://fake.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_URL = BASE + '/rest/v1';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-0123456789abcdef';
const ANON = 'test-anon-key-0123456789abcdef', SVC = 'test-service-role', USER = 'jwt.inspector-0123456789abcdef';
const HO = '11111111-2222-4333-8444-555555555555';

// a tiny PostgREST: home_records (token → share), home_finding_status, homeowner_profiles
let CALLS = [];
const STATUS = [{ share_id: 'S1', anomaly_ref: 'a1', status: 'fixed', check_requested_at: '2026-12-02T10:00:00Z', check_note: 'Plumber replaced it',
  verified_at: null, verified_name: null, updated_at: '2026-12-02T10:00:00Z', updated_by: HO }];
let RLS_SEES = true;
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(String(input)); const h = init.headers ?? {};
  CALLS.push({ path: u.pathname, search: u.search, apikey: h.apikey, auth: h.Authorization });
  const table = u.pathname.replace('/rest/v1/', '');
  if (table === 'portal_links') return Response.json([]);
  if (table === 'home_records') {
    if (u.searchParams.get('share_token')) return Response.json(u.searchParams.get('share_token') === 'eq.tok_S1_abcdef' ? [{ share_id: 'S1' }] : []);
    return Response.json([{ anomalies: [{ id: 'a1', issueTitle: 'Corrosion at supply fitting', unit: 'Water heater', location: 'Garage', severity: 'deficiency' }] }]);
  }
  if (table === 'home_finding_status') {
    const asUser = h.Authorization === `Bearer ${USER}` && h.apikey === ANON;
    const asSvc = h.Authorization === `Bearer ${SVC}`;
    if (!asUser && !asSvc) return new Response('{}', { status: 401 });
    if (asUser && !RLS_SEES) return Response.json([]);
    const sel = u.searchParams.get('select')?.split(',') ?? null;
    return Response.json(STATUS.map(r => sel ? Object.fromEntries(sel.map(c => [c, r[c]])) : r));
  }
  if (table === 'homeowner_profiles') return Response.json([{ id: HO, email: 'owner@example.com' }]);
  return new Response('{}', { status: 404 });
};
const req = (body) => ({ json: async () => body, headers: { get: () => null } });

const PAGE_FILES = { share: () => shareSource(fileURLToPath(new URL('..', import.meta.url))), card: () => readFileSync(new URL('../components/workspace/CheckRequestsCard.tsx', import.meta.url), 'utf8'),
  newp: () => readFileSync(new URL('../app/app/inspections/new/page.tsx', import.meta.url), 'utf8') };

async function checks(srcMut = null) {
  const out = []; const ok = (n, c, info = '') => out.push({ n, pass: !!c, info });
  RUN++;
  const { POST } = await import(new URL('../app/api/portal/route.ts', import.meta.url).href + '?run=' + RUN);
  const { loadCheckRequests } = await import(new URL('../lib/checkRequests.ts', import.meta.url).href + '?run=' + RUN);
  const call = async (b) => { const r = await POST(req({ token: 'tok_S1_abcdef', table: 'home_finding_status', ...b })); return { status: r.status, data: r.status === 200 ? await r.json() : null }; };
  // A
  let r = await call({ op: 'select', select: 'anomaly_ref,status,check_requested_at,verified_at,verified_name,updated_at' });
  ok('A the link reads each finding\'s status', r.status === 200 && r.data?.[0]?.status === 'fixed' && !('check_note' in (r.data?.[0] ?? {})), JSON.stringify(r));
  r = await call({ op: 'select', select: 'anomaly_ref,check_note' });
  ok('A …never the homeowner\'s note to their inspector', r.status === 400, `${r.status}`);
  r = await call({ op: 'select', select: 'anomaly_ref,updated_by' });
  ok('A …nor who changed it', r.status === 400, `${r.status}`);
  r = await call({ op: 'select', select: '*' }); const r0 = await call({ op: 'select' });
  ok('A …and not the whole row (* or no select)', r.status === 400 && r0.status === 400, `${r.status} ${r0.status}`);
  const w = await Promise.all(['insert', 'update', 'delete'].map(op => call({ op, filter: 'anomaly_ref=eq.a1', body: { status: 'open' } })));
  ok('A nothing is written through the link (the homeowner saves through set_finding_status)', w.every(x => x.status === 404), w.map(x => x.status).join(' '));
  // B
  CALLS = []; RLS_SEES = true;
  let c = await loadCheckRequests('S1', { supaUrl: BASE, anonKey: ANON, serviceKey: SVC, token: USER });
  ok('B a request comes back with the finding\'s words, the note and the homeowner\'s email', c.ok && c.requests[0]?.title === 'Corrosion at supply fitting'
    && c.requests[0]?.note === 'Plumber replaced it' && c.requests[0]?.homeownerEmail === 'owner@example.com' && c.requests[0]?.fixedAt, JSON.stringify(c));
  const first = CALLS[0];
  ok('B the first read is the caller\'s own (anon key + their token), so row-level security decides', first?.path.endsWith('/home_finding_status') && first.apikey === ANON && first.auth === `Bearer ${USER}`, JSON.stringify(first));
  ok('B only requests are listed (check_requested_at set)', /check_requested_at=not\.is\.null/.test(first?.search ?? ''), first?.search);
  CALLS = []; RLS_SEES = false;
  c = await loadCheckRequests('S1', { supaUrl: BASE, anonKey: ANON, serviceKey: SVC, token: USER });
  ok('B someone the database shows nothing gets nothing — and the service role is never used', c.ok && c.requests.length === 0 && CALLS.every(x => x.auth !== `Bearer ${SVC}`), JSON.stringify(CALLS));
  CALLS = [];
  const noTok = await loadCheckRequests('S1', { supaUrl: BASE, anonKey: ANON, serviceKey: SVC, token: '' });
  const anonTok = await loadCheckRequests('S1', { supaUrl: BASE, anonKey: ANON, serviceKey: SVC, token: ANON });
  ok('B signed out (no token, or the anon key) is refused before any call', !noTok.ok && !anonTok.ok && noTok.status === 401 && CALLS.length === 0);
  RLS_SEES = true;
  // C
  const S = srcMut?.file === 'share' ? srcMut.apply(PAGE_FILES.share()) : PAGE_FILES.share();
  const C = srcMut?.file === 'card' ? srcMut.apply(PAGE_FILES.card()) : PAGE_FILES.card();
  const N = srcMut?.file === 'newp' ? srcMut.apply(PAGE_FILES.newp()) : PAGE_FILES.newp();
  ok('C the pill opens the sheet only for the home\'s holder', S.includes("<StatusPill st={st} onOpen={can('status.set') && a.id ? () => setStatusFor(a) : undefined} />"));
  ok('C status.set is a holder-only action', /const can = \(a: PortalAction\) => PORTAL_HOLDS && portalCan\(PORTAL_SCOPE, a\);/.test(S)
    && readFileSync(new URL('../lib/portalActions.ts', import.meta.url), 'utf8').includes("'status.set',"));
  ok('C the sheet saves through set_finding_status, and only asks for a check when Fixed and ticked',
    S.includes("supabase.rpc('set_finding_status', {") && S.includes("p_ask_check: status === 'fixed' && ask,") && S.includes("if (!can('status.set') || !a.id) return;"));
  ok('C a verified repair shows ✓ Verified; the homeowner can never set it', S.includes("const verified = s === 'fixed' && !!st?.verified_at;") && !/rpc\('mark_finding_verified'/.test(S));
  ok('C every finding row on Home carries the pill (What to do first, a system, Repairs)', (S.match(/\.map\(findingRow\)/g) ?? []).length >= 3);
  ok('C the card marks verified as the signed-in inspector, and can undo', C.includes('const why = await markFindingVerified(inspectionId, ref, on);')
    && readFileSync(new URL('../lib/findings/repairCheck.ts', import.meta.url), 'utf8').includes("workspace.rpc('mark_finding_verified', { p_share_id: inspectionId, p_ref: ref, p_verified: on })")
    && C.includes('verify(r.ref, false)') && C.includes('verify(r.ref, true)'));
  ok('C the card shows only when there are requests', C.includes('if (rows.length === 0) return null;'));
  ok('C Book a re-check opens New inspection as a Re-inspection with the job filled in', C.includes("q.set('type', 'reinspection')") && C.includes("put('address', job?.address)")
    && N.includes("if (q.get('type') !== 'reinspection') return;") && /re-\?inspection\/i\.test\(n\)/.test(N));
  return out;
}

const MUTS = [
  ['the link reads the note', 'lib/portalPolicy.ts', "selectCols: set('anomaly_ref', 'status',", "selectCols: set('check_note', 'updated_by', 'anomaly_ref', 'status',"],
  ['the column list is not enforced', 'app/api/portal/route.ts', "const select = cleaned === null ? null : selectFor(table, cleaned);", "const select = cleaned;"],
  ['* passes', 'lib/portalPolicy.ts', "if (!select || select === '*') return null;", "if (!select || select === '*') return select;"],
  ['the link can write a status', 'lib/portalPolicy.ts', "    ops: set<Op>('select'),\n    selectCols", "    ops: set<Op>('select', 'insert', 'update', 'delete'),\n    insert: set('anomaly_ref', 'status'), update: set('status'),\n    selectCols"],
  ['the loader reads as the service role first', 'lib/checkRequests.ts', "{ headers: { apikey: o.anonKey, Authorization: `Bearer ${o.token}` }, cache: 'no-store' });\n    if (mine.status === 401)", "{ headers: { apikey: o.serviceKey, Authorization: `Bearer ${o.serviceKey}` }, cache: 'no-store' });\n    if (mine.status === 401)"],
  ['the service role runs with no rows', 'lib/checkRequests.ts', "    if (!Array.isArray(rows) || rows.length === 0) return { ok: true, requests: [] };\n", "    const _r = Array.isArray(rows) ? rows : [];\n"],
  ['the anon key passes as a person', 'lib/checkRequests.ts', "if (!o.token || o.token === o.anonKey)", "if (!o.token)"],
  ['withdrawn and never-asked rows are listed', 'lib/checkRequests.ts', "+ `&check_requested_at=not.is.null&select=", "+ `&select="],
  ['no email', 'lib/checkRequests.ts', "homeownerEmail: emails.get(r.updated_by) ?? null,", "homeownerEmail: null,"],
];
const SRC_MUTS = [
  ['the pill opens for anyone', 'share', "onOpen={can('status.set') && a.id ? () => setStatusFor(a) : undefined}", "onOpen={a.id ? () => setStatusFor(a) : undefined}"],
  ['the check is asked even when not Fixed', 'share', "p_ask_check: status === 'fixed' && ask,", "p_ask_check: ask,"],
  ['a system page has no pill', 'share', "<div className=\"hr-card\">{fs.length ? fs.map(findingRow)", "<div className=\"hr-card\">{fs.length ? fs.map((a: Anomaly) => <span key={a.id}>{a.unit}</span>)"],
  ['Mark verified cannot be undone', 'card', "verify(r.ref, false)", "verify(r.ref, true)"],
  ['the homeowner page can verify', 'share', "const r = await supabase.rpc('set_finding_status', {", "const r = await supabase.rpc('mark_finding_verified', {"],
  ['Mark verified reaches the wrong record', 'card', 'const why = await markFindingVerified(inspectionId, ref, on);', "const why = await markFindingVerified('x', ref, on);"],
  ['the card shows with nothing', 'card', "if (rows.length === 0) return null;", ""],
  ['the re-check is booked as an ordinary job', 'card', "q.set('type', 'reinspection')", "q.set('kind', 'reinspection')"],
];

let fail = 0;
for (const c of await checks()) { console.log(`${c.pass ? '✓' : '✗'} ${c.n}${c.pass ? '' : '  ' + c.info}`); if (!c.pass) fail++; }
if (process.argv.includes('--mutate')) {
  let caught = 0; const all = MUTS.length + SRC_MUTS.length;
  for (const [why, file, from, to] of MUTS) {
    const real = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    if (real.split(from).length !== 2) { console.log(`✗ anchor present once: ${why}`); fail++; continue; }
    MUT = { file, from, to };
    const hit = (await checks().catch(() => [{ pass: false }])).some(c => !c.pass);
    MUT = null;
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  for (const [why, file, from, to] of SRC_MUTS) {
    const real = PAGE_FILES[file]();
    if (real.split(from).length !== 2) { console.log(`✗ anchor present once: ${why}`); fail++; continue; }
    const hit = (await checks({ file, apply: s => s.replace(from, to) })).some(c => !c.pass);
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  console.log(`${caught}/${all} mutations caught`);
}
console.log(`\nverify-repair-status — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
