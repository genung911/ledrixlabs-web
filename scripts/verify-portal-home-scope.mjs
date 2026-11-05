#!/usr/bin/env node
// ─── Guard: the portal reads and writes homeowner upkeep by the HOME (ruling A, owner 2026-11-04; #108 + #109) ─────
//
// RUNS the real /api/portal and /api/docs handlers against an in-memory PostgREST stand-in that understands the one
// `or=(share_id.eq."…",home_id.eq."…")` term the server adds. Two homes: H1 (share S1, plus a row the Home app wrote
// with only a home_id) and H2. Proves:
//   · a report link reads its share's rows AND its home's rows (what the phone wrote), never another home's;
//   · every row the portal inserts is filed under the share AND the home, and a client-sent home_id is dropped;
//   · a change or delete reaches a home row by id, never another home's;
//   · without a home (inspection_home missing — #109 unapplied) everything is the share alone, as before;
//   · home_reports is never widened to the home;
//   · /api/docs files a stored document under the home too, and checks a file's path against the row's OWN share.
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

let DB, HOME_RPC;
function seed() {
  DB = {
    home_records: [{ share_id: 'S1', share_token: 'tok_S1_abcdef' }, { share_id: 'S2', share_token: 'tok_S2_abcdef' }],
    portal_links: [],
    home_reminders: [
      { id: 'r1', share_id: 'S1', home_id: 'H1', title: 'portal S1' },
      { id: 'r0', share_id: 'S1', home_id: null, title: 'portal S1 unfiled' },
      { id: 'r2', share_id: null, home_id: 'H1', title: 'phone H1' },
      { id: 'r3', share_id: 'S2', home_id: 'H2', title: 'portal S2' },
      { id: 'r4', share_id: null, home_id: 'H2', title: 'phone H2' },
    ],
    home_reports: [{ id: 'p1', share_id: 'S1', home_id: 'H1', title: 'S1 report' }, { id: 'p2', share_id: 'S9', home_id: 'H1', title: 'other report' }],
    home_documents: [],
  };
  HOME_RPC = true;
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
  if (u.pathname === '/rest/v1/rpc/inspection_home') {
    if (!HOME_RPC) return new Response('{}', { status: 404 });
    const { p_inspection } = JSON.parse(init.body);
    return Response.json(p_inspection === 'S1' ? 'H1' : p_inspection === 'S2' ? 'H2' : null);
  }
  if (u.pathname.startsWith('/storage/')) {
    if (u.pathname.includes('/object/list/')) return Response.json([{ name: JSON.parse(init.body).search, metadata: { size: 10, mimetype: 'application/pdf' } }]);
    if (u.pathname.includes('/object/move')) return new Response('{}');
    if (u.pathname.includes('/object/sign/')) return Response.json({ signedURL: '/object/sign/x?token=t' });
    if (method === 'GET') return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), { status: 206 });
    return new Response('{}');
  }
  const table = u.pathname.replace('/rest/v1/', '');
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
  const call = async (b) => { const r = await POST(req({ token: 'tok_S1_abcdef', ...b })); return { status: r.status, data: r.status === 200 ? await r.json() : null }; };
  const titles = (d) => (d ?? []).map(r => r.title).sort();

  seed();
  let r = await call({ table: 'home_reminders', op: 'select', filter: 'share_id=eq.S1' });
  ok('a report link reads its share and its home (the phone\'s row)', JSON.stringify(titles(r.data)) === '["phone H1","portal S1","portal S1 unfiled"]', JSON.stringify(titles(r.data)));
  await call({ table: 'home_reminders', op: 'insert', body: { title: 'new', home_id: 'H2' } });
  const n = DB.home_reminders.find(x => x.title === 'new');
  ok('an insert is filed under the share AND the home; a client home_id is dropped', n?.share_id === 'S1' && n?.home_id === 'H1', JSON.stringify(n));
  await call({ table: 'home_reminders', op: 'update', filter: 'id=eq.r2', body: { completed: true } });
  ok('a change reaches the home\'s phone row by id', DB.home_reminders.find(x => x.id === 'r2')?.completed === true);
  await call({ table: 'home_reminders', op: 'update', filter: 'id=eq.r4', body: { completed: true } });
  ok('…never another home\'s', DB.home_reminders.find(x => x.id === 'r4')?.completed !== true);
  await call({ table: 'home_reminders', op: 'delete', filter: 'id=eq.r4' });
  ok('a delete never reaches another home', DB.home_reminders.some(x => x.id === 'r4'));
  await call({ table: 'home_reminders', op: 'delete', filter: 'id=eq.r2' });
  ok('a delete reaches the home\'s own row', !DB.home_reminders.some(x => x.id === 'r2'));
  r = await call({ table: 'home_reports', op: 'select' });
  ok('home_reports stays the share alone', JSON.stringify(titles(r.data)) === '["S1 report"]', JSON.stringify(titles(r.data)));

  seed(); HOME_RPC = false;
  RUN++;
  const fresh = await import(ROUTE + '?run=' + RUN);
  const r2 = await fresh.POST(req({ token: 'tok_S1_abcdef', table: 'home_reminders', op: 'select' }));
  ok('without a home (#109 not applied): the share alone, as before', JSON.stringify(titles(await r2.json())) === '["portal S1","portal S1 unfiled"]');
  await fresh.POST(req({ token: 'tok_S1_abcdef', table: 'home_reminders', op: 'insert', body: { title: 'nohome' } }));
  ok('…and inserts carry no home', DB.home_reminders.find(x => x.title === 'nohome')?.home_id === undefined);

  // /api/docs: a stored file is filed under the home; opening checks the row's own share
  seed();
  const up = await docs.POST(req({ token: 'tok_S1_abcdef', action: 'complete', name: 'f.pdf', path: 'S1/_incoming/1730000000000_aaaaaaaaaaaa_f.pdf', kind: 'other' }));
  const d = DB.home_documents[0];
  ok('/api/docs files a stored document under the share and the home', up.status === 200 && d?.share_id === 'S1' && d?.home_id === 'H1', `${up.status} ${JSON.stringify(d)}`);
  const src = readFileSync(new URL('../app/api/docs/route.ts', import.meta.url), 'utf8');
  ok('/api/docs checks a file path against the row\'s own share', (src.match(/docPathInShare\(doc\.path, doc\.share\)/g) ?? []).length === 2);
  return out;
}

const MUTS = [
  ['the portal scope ignores the home', 'lib/portalPolicy.ts', "if (UPKEEP_TABLES.has(table) && homeId && PLAIN_ID.test(homeId) && PLAIN_ID.test(shareId)) {", 'if (false) {'],
  ['inserts are not filed under the home', 'lib/portalPolicy.ts', "if (UPKEEP_TABLES.has(table) && homeId && PLAIN_ID.test(homeId)) out.home_id = homeId;", ''],
  ['the scope is the home alone', 'lib/portalPolicy.ts', '(share_id.eq."${shareId}",home_id.eq."${homeId}")', '(home_id.eq."${homeId}",home_id.eq."${homeId}")'],
  ['the route never asks for the home', 'app/api/portal/route.ts', "const homeId = UPKEEP_TABLES.has(table) ? await homeIdForShare(shareId) : null;", 'const homeId = null as string | null;'],
  ['a missing function is treated as a home', 'lib/shareAccess.ts', "    if (!r.ok) return null;\n    const v = await r.json().catch(() => null);", "    const v = r.ok ? await r.json().catch(() => null) : 'H1';"],
  ['docs file without the home', 'app/api/docs/route.ts', "stampRow('home_documents', { name, url: `storage://${DOC_BUCKET}/${path}`, path, kind, size: obj.size }, shareId, await homeIdForShare(shareId))", "{ share_id: shareId, name, url: `storage://${DOC_BUCKET}/${path}`, path, kind, size: obj.size }"],
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
