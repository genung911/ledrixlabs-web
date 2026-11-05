#!/usr/bin/env node
// ─── Guard: the portal reads and writes homeowner upkeep by the share and ITS OWNER'S TENURE (#109, owner 2026-11-04) ──
//
// "For the homeowner, they should start fresh." RUNS the real /api/portal and /api/docs handlers against an in-memory
// PostgREST stand-in that understands the one `or=(share_id.eq."…",tenure_id.eq.…)` term the server adds. One house
// (H1) carries three owners' rows: the previous owner's (T0), this report's client (T1) and another buyer's (T2).
// Proves:
//   · a claimed report link reads its share's rows and its tenure's rows (what that owner's phone wrote) — never the
//     previous owner's or another buyer's on the same house;
//   · every row the portal inserts is filed under the share AND the tenure; a client-sent tenure_id/home_id is dropped;
//   · a change or delete reaches only those rows;
//   · unclaimed, or #109 unapplied: everything is the share alone, as before;
//   · an ENDED tenure's link still reads, and changes nothing (portal and docs);
//   · home_reports is never widened;
//   · /api/docs files a stored document under the tenure too, and checks a file's path against the row's OWN share.
// `--mutate` swaps source in memory (a load hook, nothing is written to disk) and proves each check can fail.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let MUT = null;            // { file, from, to } — applied in the load hook, in memory only
let RUN = 0;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'next/server') return next('next/server.js', ctx);
    let r;
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.[a-z]+$/i.test(spec)) {
      try { r = next(spec + '.ts', ctx); } catch {}
    }
    r = r ?? next(spec, ctx);
    // a fresh copy of every repo module per run, so a mutation never leaks into the next one
    if (r.url.startsWith('file:') && !r.url.includes('node_modules') && ctx.parentURL?.includes('?run=')) {
      r = { ...r, url: r.url.split('?')[0] + '?run=' + ctx.parentURL.split('?run=')[1] };
    }
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

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.test/rest/v1';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
const BASE = 'https://fake.supabase.test';

const T0 = '00000000-0000-4000-8000-0000000000a0', T1 = '00000000-0000-4000-8000-0000000000a1';
const T2 = '00000000-0000-4000-8000-0000000000a2', T3 = '00000000-0000-4000-8000-0000000000a3';
let DB, RPC, STORAGE_DELETES = [], HIST_FAIL = false;
function seed() {
  DB = {
    home_records: [{ share_id: 'S1', share_token: 'tok_S1_abcdef' }, { share_id: 'S2', share_token: 'tok_S2_abcdef' },
                   { share_id: 'S3', share_token: 'tok_S3_abcdef' }],
    portal_links: [],
    home_reminders: [
      { id: 'r1', share_id: 'S1', tenure_id: T1, home_id: 'H1', title: 'portal S1' },
      { id: 'r0', share_id: 'S1', tenure_id: null, home_id: null, title: 'portal S1 unfiled' },
      { id: 'r2', share_id: null, tenure_id: T1, home_id: 'H1', title: 'phone T1' },
      { id: 'r4', share_id: null, tenure_id: T2, home_id: 'H1', title: 'other buyer T2' },
      { id: 'r5', share_id: null, tenure_id: T0, home_id: 'H1', title: 'previous owner T0' },
      { id: 'r6', share_id: 'S2', tenure_id: null, home_id: null, title: 'portal S2' },
      { id: 'r7', share_id: 'S3', tenure_id: T3, home_id: 'H3', title: 'portal S3 sold' },
    ],
    home_reports: [{ id: 'p1', share_id: 'S1', tenure_id: T1, title: 'S1 report' }, { id: 'p2', share_id: 'S9', tenure_id: T1, title: 'other report' }],
    home_documents: [],
  };
  RPC = { S1: [{ home_id: 'H1', tenure_id: T1, ended: false }], S2: [], S3: [{ home_id: 'H3', tenure_id: T3, ended: true }] };
}
const termsOf = (qs) => [...new URLSearchParams(qs)].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k));
function match(row, [k, v]) {
  if (k === 'or') {
    const inner = v.replace(/^\(|\)$/g, '');
    return inner.split(',').some(t => { const [c, , ...val] = t.split('.'); return String(row[c]) === val.join('.').replace(/^"|"$/g, ''); });
  }
  const dot = v.indexOf('.'); const op = v.slice(0, dot); const val = v.slice(dot + 1);
  if (op === 'eq') return String(row[k]) === val;
  if (op === 'is') return val === 'null' ? row[k] == null : String(row[k]) === val;
  if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').includes(String(row[k]));
  return false;
}
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(String(input)); const method = (init.method ?? 'GET').toUpperCase();
  if (!u.href.startsWith(BASE)) throw new Error('network');
  if (u.pathname === '/rest/v1/rpc/share_tenure') {
    if (!RPC) return new Response('{}', { status: 404 });
    return Response.json(RPC[JSON.parse(init.body).p_share] ?? []);
  }
  if (u.pathname.startsWith('/storage/')) {
    if (method === 'DELETE') { STORAGE_DELETES.push(u.pathname); return new Response('{}'); }
    if (u.pathname.includes('/object/list/')) return Response.json([{ name: JSON.parse(init.body).search, metadata: { size: 10, mimetype: 'application/pdf' } }]);
    if (u.pathname.includes('/object/move')) return new Response('{}');
    if (u.pathname.includes('/object/sign/')) return Response.json({ signedURL: '/object/sign/x?token=t' });
    if (method === 'GET') return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), { status: 206 });
    return new Response('{}');
  }
  const table = u.pathname.replace('/rest/v1/', '');
  if (table === 'home_history_documents' && HIST_FAIL) return new Response('{}', { status: 500 });
  const rows = DB[table] ?? (DB[table] = []);
  const terms = termsOf(u.search.slice(1));
  const hit = rows.filter(r => terms.every(t => match(r, t)));
  if (method === 'GET') return Response.json(hit);
  if (method === 'POST') {
    const body = JSON.parse(init.body); const add = (Array.isArray(body) ? body : [body]).map(r => ({ id: r.id ?? `n${rows.length + 1}`, ...r }));
    rows.push(...add); return Response.json(add, { status: 201 });
  }
  if (method === 'PATCH') { const patch = JSON.parse(init.body); hit.forEach(r => Object.assign(r, patch)); return new Response(null, { status: 204 }); }
  if (method === 'DELETE') { DB[table] = rows.filter(r => !hit.includes(r)); return Response.json(hit); }
  return new Response(null, { status: 405 });
};

const ROUTE = new URL('../app/api/portal/route.ts', import.meta.url).href;
const DOCS = new URL('../app/api/docs/route.ts', import.meta.url).href;
const req = (body) => ({ json: async () => body });

async function checks() {
  const out = []; const ok = (name, c, info = '') => out.push({ name, pass: !!c, info });
  RUN++;
  const { POST } = await import(ROUTE + '?run=' + RUN);
  const docs = await import(DOCS + '?run=' + RUN);
  const call = async (b, tok = 'tok_S1_abcdef') => { const r = await POST(req({ token: tok, ...b })); return { status: r.status, data: r.status === 200 ? await r.json() : null }; };
  const titles = (d) => (d ?? []).map(r => r.title).sort();

  seed();
  let r = await call({ table: 'home_reminders', op: 'select', filter: 'share_id=eq.S1' });
  ok('a claimed link reads its share and its owner\'s tenure (their phone\'s row)', JSON.stringify(titles(r.data)) === '["phone T1","portal S1","portal S1 unfiled"]', JSON.stringify(titles(r.data)));
  ok('…never the previous owner\'s or another buyer\'s rows on the same house', !titles(r.data).some(t => /T0|T2/.test(t)));
  r = await call({ table: 'home_reminders', op: 'select', filter: `tenure_id=eq.${T0}` });
  ok('a client filter naming another tenure only narrows, never widens', Array.isArray(r.data) && r.data.length === 0, JSON.stringify(r));
  await call({ table: 'home_reminders', op: 'insert', body: { title: 'new', tenure_id: T2, home_id: 'H9' } });
  const n = DB.home_reminders.find(x => x.title === 'new');
  ok('an insert is filed under the share AND the tenure; a client tenure_id/home_id is dropped', n?.share_id === 'S1' && n?.tenure_id === T1 && n?.home_id === undefined, JSON.stringify(n));
  await call({ table: 'home_reminders', op: 'update', filter: 'id=eq.r2', body: { completed: true } });
  ok('a change reaches the owner\'s own phone row by id', DB.home_reminders.find(x => x.id === 'r2')?.completed === true);
  await call({ table: 'home_reminders', op: 'update', filter: 'id=eq.r5', body: { completed: true } });
  ok('…never the previous owner\'s', DB.home_reminders.find(x => x.id === 'r5')?.completed !== true);
  await call({ table: 'home_reminders', op: 'delete', filter: 'id=eq.r4' });
  ok('a delete never reaches another buyer\'s row', DB.home_reminders.some(x => x.id === 'r4'));
  await call({ table: 'home_reminders', op: 'delete', filter: 'id=eq.r2' });
  ok('a delete reaches the owner\'s own row', !DB.home_reminders.some(x => x.id === 'r2'));
  r = await call({ table: 'home_reports', op: 'select' });
  ok('home_reports stays the share alone', JSON.stringify(titles(r.data)) === '["S1 report"]', JSON.stringify(titles(r.data)));

  seed();
  r = await call({ table: 'home_reminders', op: 'select' }, 'tok_S2_abcdef');
  ok('an unclaimed link: the share alone', JSON.stringify(titles(r.data)) === '["portal S2"]', JSON.stringify(titles(r.data)));
  await call({ table: 'home_reminders', op: 'insert', body: { title: 'unclaimed new' } }, 'tok_S2_abcdef');
  ok('…and its inserts carry no tenure', DB.home_reminders.find(x => x.title === 'unclaimed new')?.tenure_id === undefined);

  seed(); RPC = null;
  RUN++;
  const fresh = await import(ROUTE + '?run=' + RUN);
  const r2 = await fresh.POST(req({ token: 'tok_S1_abcdef', table: 'home_reminders', op: 'select' }));
  ok('#109 not applied (no function): the share alone, as before', JSON.stringify(titles(await r2.json())) === '["portal S1","portal S1 unfiled"]');

  seed();
  r = await call({ table: 'home_reminders', op: 'select' }, 'tok_S3_abcdef');
  ok('a sold owner\'s link still reads its rows', JSON.stringify(titles(r.data)) === '["portal S3 sold"]', JSON.stringify(titles(r.data)));
  const ins3 = await call({ table: 'home_reminders', op: 'insert', body: { title: 'after sale' } }, 'tok_S3_abcdef');
  const upd3 = await call({ table: 'home_reminders', op: 'update', filter: 'id=eq.r7', body: { completed: true } }, 'tok_S3_abcdef');
  const del3 = await call({ table: 'home_reminders', op: 'delete', filter: 'id=eq.r7' }, 'tok_S3_abcdef');
  ok('…and changes nothing (add, change, delete refused)', ins3.status === 404 && upd3.status === 404 && del3.status === 404
    && !DB.home_reminders.some(x => x.title === 'after sale') && DB.home_reminders.find(x => x.id === 'r7')?.completed !== true
    && DB.home_reminders.some(x => x.id === 'r7'), `${ins3.status} ${upd3.status} ${del3.status}`);

  // /api/docs: a stored file is filed under the tenure; a sold link can neither upload nor delete
  seed();
  const up = await docs.POST(req({ token: 'tok_S1_abcdef', action: 'complete', name: 'f.pdf', path: 'S1/_incoming/1730000000000_aaaaaaaaaaaa_f.pdf', kind: 'other' }));
  const d = DB.home_documents[0];
  ok('/api/docs files a stored document under the share and the tenure', up.status === 200 && d?.share_id === 'S1' && d?.tenure_id === T1, `${up.status} ${JSON.stringify(d)}`);
  seed(); DB.home_documents.push({ id: '11111111-2222-4333-8444-555555555555', share_id: 'S3', tenure_id: T3, path: null, name: 'kept.pdf' });
  const up3 = await docs.POST(req({ token: 'tok_S3_abcdef', action: 'complete', name: 'g.pdf', path: 'S3/_incoming/1730000000000_aaaaaaaaaaaa_g.pdf', kind: 'other' }));
  const del = await docs.DELETE(req({ token: 'tok_S3_abcdef', id: '11111111-2222-4333-8444-555555555555' }));
  ok('/api/docs: a sold link can neither upload nor delete', up3.status === 404 && del.status === 404 && DB.home_documents.length === 1, `${up3.status} ${del.status} ${DB.home_documents.length}`);
  const src = readFileSync(new URL('../app/api/docs/route.ts', import.meta.url), 'utf8');
  ok('/api/docs checks a file path against the row\'s own share', (src.match(/docPathInShare\(doc\.path, doc\.share\)/g) ?? []).length === 2);

  // #110: a receipt names its system; a receipt already passed to the house's history keeps its file
  seed();
  await docs.POST(req({ token: 'tok_S1_abcdef', action: 'complete', name: 'r.pdf', path: 'S1/_incoming/1730000000000_aaaaaaaaaaaa_r.pdf', kind: 'receipt', system: 'HVAC' }));
  await docs.POST(req({ token: 'tok_S1_abcdef', action: 'complete', name: 'o.pdf', path: 'S1/_incoming/1730000000001_aaaaaaaaaaaa_o.pdf', kind: 'other', system: 'HVAC' }));
  const rec = DB.home_documents.find(x => x.name === 'r.pdf'), oth = DB.home_documents.find(x => x.name === 'o.pdf');
  ok('/api/docs: a receipt is filed with the system it is for; another kind never carries one', rec?.system === 'HVAC' && oth && oth.system === undefined, JSON.stringify([rec, oth]));
  const DOC_A = '11111111-2222-4333-8444-00000000000a', DOC_B = '11111111-2222-4333-8444-00000000000b';
  seed(); STORAGE_DELETES = [];
  DB.home_documents.push({ id: DOC_A, share_id: 'S1', tenure_id: T1, path: 'S1/passed.pdf', name: 'passed.pdf' },
                         { id: DOC_B, share_id: 'S1', tenure_id: T1, path: 'S1/mine.pdf', name: 'mine.pdf' });
  DB.home_history_documents = [{ id: 'h1', path: 'S1/passed.pdf' }];
  const dA = await docs.DELETE(req({ token: 'tok_S1_abcdef', id: DOC_A }));
  ok('/api/docs: deleting a receipt already in the house history removes the row and KEEPS the file', dA.status === 204
    && !DB.home_documents.some(x => x.id === DOC_A) && !STORAGE_DELETES.some(p => p.includes('passed.pdf')), `${dA.status} ${JSON.stringify(STORAGE_DELETES)}`);
  const dB = await docs.DELETE(req({ token: 'tok_S1_abcdef', id: DOC_B }));
  ok('/api/docs: any other document\'s file is deleted with it', dB.status === 204 && STORAGE_DELETES.some(p => p.includes('mine.pdf')), `${dB.status} ${JSON.stringify(STORAGE_DELETES)}`);
  seed(); STORAGE_DELETES = []; HIST_FAIL = true;
  DB.home_documents.push({ id: DOC_A, share_id: 'S1', tenure_id: T1, path: 'S1/passed.pdf', name: 'passed.pdf' });
  const dC = await docs.DELETE(req({ token: 'tok_S1_abcdef', id: DOC_A }));
  HIST_FAIL = false;
  ok('/api/docs: when the history cannot be checked, nothing is deleted', dC.status === 502 && DB.home_documents.some(x => x.id === DOC_A) && STORAGE_DELETES.length === 0, `${dC.status}`);
  return out;
}

const MUTS = [
  ['the portal scope ignores the tenure', 'lib/portalPolicy.ts', "if (UPKEEP_TABLES.has(table) && tenure && UUID.test(tenure.tenureId) && PLAIN_ID.test(shareId)) {", 'if (false) {'],
  ['the scope is the whole home', 'lib/portalPolicy.ts', '(share_id.eq."${shareId}",tenure_id.eq.${tenure.tenureId})', '(share_id.eq."${shareId}",home_id.eq.H1)'],
  ['inserts are not filed under the tenure', 'lib/portalPolicy.ts', "if (UPKEEP_TABLES.has(table) && tenure && UUID.test(tenure.tenureId)) out.tenure_id = tenure.tenureId;", ''],
  ['an ended tenure stays writable', 'lib/portalPolicy.ts', "return UPKEEP_TABLES.has(table) && op !== 'select' && !!tenure?.ended;", 'return false;'],
  ['the route never asks for the tenure', 'app/api/portal/route.ts', "const tenure = UPKEEP_TABLES.has(table) ? await tenureForShare(shareId) : null;", 'const tenure = null as TenureRef;'],
  ['a missing function is treated as a tenure', 'lib/shareAccess.ts', "    if (!r.ok) return null;\n    const rows = await r.json().catch(() => null);", "    const rows = r.ok ? await r.json().catch(() => null) : [{ home_id: 'H1', tenure_id: '00000000-0000-4000-8000-0000000000a0', ended: false }];"],
  ['docs file without the tenure', 'app/api/docs/route.ts', "...(system ? { system } : {}) }, shareId, tenure)]),", "...(system ? { system } : {}) }, shareId, null)]),"],
  ['a receipt\'s system is dropped', 'app/api/docs/route.ts', "size: obj.size, ...(system ? { system } : {}) }", "size: obj.size }"],
  ['any kind carries a system', 'app/api/docs/route.ts', "const system = kind === 'receipt' && typeof body.system", "const system = typeof body.system"],
  ['a passed receipt\'s file is deleted', 'app/api/docs/route.ts', "const passed = doc.path ? await passedToHistory(doc.path) : false;", "const passed = false;"],
  ['an unchecked history deletes anyway', 'app/api/docs/route.ts', "    if (passed === null) return NextResponse.json({ error: 'Delete failed.' }, { status: 502 });\n", ""],
  ['docs upload after the sale', 'app/api/docs/route.ts', "  if (endedRefuses('home_documents', 'insert', tenure)) return notFound();", ''],
  ['docs delete after the sale', 'app/api/docs/route.ts', "  if (endedRefuses('home_documents', 'delete', await tenureForShare(shareId))) return notFound();", ''],
];

let fail = 0;
for (const c of await checks()) { console.log(`${c.pass ? '✓' : '✗'} ${c.name}${c.pass ? '' : '  ' + c.info}`); if (!c.pass) fail++; }
if (process.argv.includes('--mutate')) {
  let caught = 0;
  for (const [why, file, from, to] of MUTS) {
    const real = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    if (real.split(from).length !== 2) { console.log(`✗ mutation anchor present once: ${why}`); fail++; continue; }
    MUT = { file, from, to };
    const hit = (await checks().catch(() => [{ pass: false }])).some(c => !c.pass);
    MUT = null;
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  console.log(`${caught}/${MUTS.length} mutations caught`);
}
console.log(`\nverify-portal-home-scope — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
