#!/usr/bin/env node
// ─── Guard: homeowner portal authorization, exercised — not just read ─────────────────────
//
// (Homeowner security passes, 2026-10-19.) The other verify-* scripts mostly read source. This
// one RUNS the real route handlers — /api/docs, /api/portal, /api/portal-links and
// /api/share/[token] — against an in-memory stand-in for Supabase (PostgREST + Storage), with two
// homes A and B, and asserts what each kind of link can and cannot do. No network, no real keys,
// no production data: fetch is replaced before the routes load.
//
// What it cannot prove: live RLS, grants and bucket settings (see the SQL files' post-checks);
// PostgREST's exact parsing (the stand-in implements eq/neq/gt/gte/lt/lte/is/in and the bulk-insert
// key rule, nothing more); Storage's real signed-upload, move, list, Range and MIME enforcement (the
// stand-in binds an upload token to one path, refuses overwrite, lists non-recursively); CORS on the
// browser's direct upload; the rendered React page (its request shapes are read from source and
// replayed, its docHref function is extracted and run, and its Share buttons' helper
// lib/portalShareLink.ts is run against the real /api/portal-links).
import { registerHooks } from 'node:module';
import { webcrypto, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'next/server') return next('next/server.js', ctx);
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.[a-z]+$/i.test(spec)) {
      try { return next(spec + '.ts', ctx); } catch {}
    }
    return next(spec, ctx);
  },
});

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.test/rest/v1';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';

// ── The stand-in ──────────────────────────────────────────────────────────────────────────
const BASE = 'https://fake.supabase.test';
const uuid = () => webcrypto.randomUUID();
const sha = (t) => createHash('sha256').update(t).digest('hex');
const A = { token: 'tok_A_9f8e7d6c5b4a', share: 'insp_A' };
const B = { token: 'tok_B_1a2b3c4d5e6f', share: 'insp_B' };
const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';
const DOC_FORGED = '33333333-3333-4333-8333-333333333333';
let db, objects, calls, uploadSigns, linksTable, linksFail, storageDeleteFails, docInsertFails;
const writeOps = [];
const PDF_HEAD = new TextEncoder().encode('%PDF-1.7\n');
function reset() {
  calls = []; writeOps.length = 0; uploadSigns = new Map();
  linksTable = true; linksFail = false; storageDeleteFails = false; docInsertFails = false;
  objects = new Map([
    ['insp_A/100_aaa_receipt.pdf', { size: 10, mimetype: 'application/pdf', head: PDF_HEAD }],
    ['insp_B/200_bbb_secret.pdf', { size: 10, mimetype: 'application/pdf', head: PDF_HEAD }],
  ]);
  db = {
    home_records: [
      { share_id: A.share, share_token: A.token, address: '1 Alpha Ln', city: 'Austin', state: 'TX', zip: '78701', inspection_date: '2026-10-01', anomalies: [{ description: 'ALPHA-FINDING' }], license_number: 'LIC-A' },
      { share_id: B.share, share_token: B.token, address: '2 Bravo Rd', inspection_date: '2026-10-02', anomalies: [] },
    ],
    portal_links: [],
    home_documents: [
      { id: DOC_A, share_id: A.share, name: 'Receipt', url: `${BASE}/storage/v1/object/public/home-documents/insp_A/100_aaa_receipt.pdf`, path: 'insp_A/100_aaa_receipt.pdf', kind: 'document', created_at: '1' },
      { id: DOC_B, share_id: B.share, name: 'Secret', url: 'x', path: 'insp_B/200_bbb_secret.pdf', kind: 'document', created_at: '1' },
      // A row on share A that names B's file — what the old client-filed rows allowed.
      { id: DOC_FORGED, share_id: A.share, name: 'Forged', url: 'x', path: 'insp_B/200_bbb_secret.pdf', kind: 'document', created_at: '1' },
    ],
    home_reminders: [
      { id: 'r-a1', share_id: A.share, title: 'Filter', completed: false },
      { id: 'r-b1', share_id: B.share, title: 'B task', completed: false },
    ],
    home_projects: [{ id: 'p-a1', share_id: A.share, status: 'identified', seeded: false }],
    home_repairs: [
      { id: 'rp-a1', share_id: A.share, anomaly_ref: 'f1', item: 'Panel', status: 'included' },
      { id: 'rp-a2', share_id: A.share, anomaly_ref: 'f2', item: 'Draft only', status: 'excluded' },
    ],
    home_maintenance_log: [
      { id: 'm-a1', share_id: A.share, title: 'Filter replaced', source: 'manual' },
      { id: 'm-a2', share_id: A.share, title: 'Written elsewhere', source: 'inspector' },
      { id: 'm-b1', share_id: B.share, title: 'B log', source: 'manual' },
    ],
  };
}
const addLink = (share, token, scope, extra = {}) => {
  const row = { id: uuid(), share_id: share, token_hash: sha(token), scope, created_via: 'portal', created_at: String(Date.now()), revoked_at: null, ...extra };
  db.portal_links.push(row); return row;
};

// URLSearchParams has already percent-decoded keys and values, as PostgREST does.
function matches(row, query, write = false) {
  for (const [k, v] of query) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    const m = /^(eq|neq|gt|gte|lt|lte|is|in)\.(.*)$/s.exec(v);
    if (!m) throw new Error(`unsupported filter ${k}=${v}`);
    if (write) writeOps.push(m[1]);
    const [, op, val] = m, cell = row[k];
    const ok = op === 'eq' ? String(cell) === val : op === 'neq' ? String(cell) !== val
      : op === 'is' ? String(cell ?? null) === val
      : op === 'in' ? /^\((.*)\)$/.exec(val)[1].split(',').includes(String(cell))
      : op === 'gt' ? String(cell) > val : op === 'gte' ? String(cell) >= val
      : op === 'lt' ? String(cell) < val : String(cell) <= val;
    if (!ok) return false;
  }
  return true;
}
const pick = (row, sel) => !sel || sel === '*' ? row : Object.fromEntries(sel.split(',').map(c => [c, row[c]]));

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  calls.push({ method, url: url.toString(), headers });

  // The browser's direct upload: authorized by the signed token alone, not the service role.
  const put = /^\/storage\/v1\/object\/upload\/sign\/home-documents\/(.+)$/.exec(url.pathname);
  if (put && method === 'PUT') {
    const path = put[1].split('/').map(decodeURIComponent).join('/');
    if (uploadSigns.get(path) !== url.searchParams.get('token')) return new Response('bad token', { status: 400 });
    if (objects.has(path)) return new Response('exists', { status: 409 });
    const body = init.body;
    const head = body?.slice ? new Uint8Array(await body.slice(0, 64).arrayBuffer()) : new Uint8Array();
    objects.set(path, { size: body?.size ?? 0, mimetype: headers['content-type'] ?? '', head });
    return Response.json({ Key: path });
  }
  if (headers.authorization !== 'Bearer test-service-role') return new Response('no', { status: 401 });

  if (url.pathname.startsWith('/rest/v1/')) {
    const table = url.pathname.slice('/rest/v1/'.length);
    if (table === 'portal_links' && !linksTable) return new Response('{"code":"PGRST205"}', { status: 404 });
    if (table === 'portal_links' && linksFail) return new Response('{"message":"db down"}', { status: 503 });
    const rows = db[table];
    if (!rows) return new Response('{"code":"PGRST205"}', { status: 404 });
    const q = [...url.searchParams.entries()];
    if (method === 'GET') return Response.json(rows.filter(r => matches(r, q)).map(r => pick(r, url.searchParams.get('select'))));
    if (method === 'POST') {
      if (table === 'home_documents' && docInsertFails) return new Response('{"message":"db down"}', { status: 503 });
      const body = JSON.parse(init.body);
      // PostgREST refuses a bulk insert whose objects do not all carry the same keys (PGRST102).
      const keys = JSON.stringify(Object.keys(body[0] ?? {}).sort());
      if (body.some(r => JSON.stringify(Object.keys(r).sort()) !== keys)) return new Response('{"code":"PGRST102"}', { status: 400 });
      if (table === 'portal_links' && body.some(r => r.scope === 'edit' && r.created_via !== 'staff')) return new Response('{"code":"23514"}', { status: 400 });
      const made = body.map(r => ({ id: r.id ?? uuid(), created_at: String(Date.now()), revoked_at: null, ...r }));
      rows.push(...made);
      return headers.prefer?.includes('representation') ? Response.json(made, { status: 201 }) : new Response(null, { status: 201 });
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(init.body);
      const hit = rows.filter(r => matches(r, q, true));
      hit.forEach(r => Object.assign(r, patch));
      return headers.prefer?.includes('representation') ? Response.json(hit) : new Response(null, { status: 204 });
    }
    if (method === 'DELETE') {
      db[table] = rows.filter(r => !matches(r, q, true));
      return new Response(null, { status: 204 });
    }
  }
  if (url.pathname === '/storage/v1/object/list/home-documents' && method === 'POST') {
    // Non-recursive, as Storage lists: only names directly under the prefix.
    const { prefix, search } = JSON.parse(init.body);
    const out = [...objects.entries()].filter(([k]) => k.startsWith(`${prefix}/`) && !k.slice(prefix.length + 1).includes('/')
      && k.slice(prefix.length + 1).includes(search ?? ''))
      .map(([k, v]) => ({ name: k.slice(prefix.length + 1), metadata: { size: v.size, mimetype: v.mimetype } }))
      .sort((a, b) => a.name < b.name ? -1 : 1);
    return Response.json(out);
  }
  if (url.pathname === '/storage/v1/object/move' && method === 'POST') {
    const { bucketId, sourceKey, destinationKey } = JSON.parse(init.body);
    if (bucketId !== 'home-documents' || !objects.has(sourceKey)) return new Response('{"statusCode":"404","error":"not_found"}', { status: 400 });
    if (objects.has(destinationKey)) return new Response('{"statusCode":"409","error":"Duplicate"}', { status: 400 });
    objects.set(destinationKey, objects.get(sourceKey)); objects.delete(sourceKey);
    return Response.json({ message: 'Successfully moved' });
  }
  if (url.pathname === '/storage/v1/object/home-documents' && method === 'DELETE') {
    const { prefixes } = JSON.parse(init.body);
    bulkDeletes.push(...prefixes);
    for (const k of prefixes) objects.delete(k);
    return Response.json(prefixes.map(name => ({ name })));
  }
  const pdfSign = /^\/storage\/v1\/object\/sign\/inspection-pdfs\/(.+)$/.exec(url.pathname);
  if (pdfSign && method === 'POST') return Response.json({ signedURL: `/object/sign/inspection-pdfs/${pdfSign[1]}?token=signed` });
  const sign = /^\/storage\/v1\/object\/upload\/sign\/home-documents\/(.+)$/.exec(url.pathname);
  if (sign && method === 'POST') {
    const path = sign[1].split('/').map(decodeURIComponent).join('/');
    const tok = uuid(); uploadSigns.set(path, tok);
    return Response.json({ url: `/object/upload/sign/home-documents/${sign[1]}?token=${tok}` });
  }
  const obj = /^\/storage\/v1\/object\/(sign\/)?home-documents\/(.+)$/.exec(url.pathname);
  if (obj) {
    const path = obj[2].split('/').map(decodeURIComponent).join('/');
    if (obj[1]) return objects.has(path)
      ? Response.json({ signedURL: `/object/sign/home-documents/${path}?token=signed` })
      : new Response('{}', { status: 400 });
    if (method === 'GET') {
      const o = objects.get(path);
      return o ? new Response(o.head, { status: headers.range ? 206 : 200 }) : new Response('{}', { status: 400 });
    }
    if (method === 'DELETE') {
      if (storageDeleteFails) return new Response('{"statusCode":"500","error":"internal"}', { status: 500 });
      const had = objects.delete(path);
      // Supabase Storage answers a missing object with 400 and a not_found body.
      return had ? Response.json([{ name: path }]) : new Response('{"statusCode":"404","error":"not_found","message":"Object not found"}', { status: 400 });
    }
  }
  return new Response('unhandled', { status: 599 });
};

// ── Load the real routes ──────────────────────────────────────────────────────────────────
const { NextRequest } = await import('next/server.js');
// A missing handler answers 501 so the checks below FAIL instead of the script crashing.
const missing = async () => new Response(null, { status: 501 });
const docsMod   = await import('../app/api/docs/route.ts');
const portalMod = await import('../app/api/portal/route.ts');
const linksMod  = await import('../app/api/portal-links/route.ts').catch(() => ({}));
const shareMod  = await import('../app/api/share/[token]/route.ts');
const assetRoute = await import('../app/api/report-asset/route.ts');
const shareLib  = await import('../lib/shareAccess.ts');
const shareLinkLib = await import('../lib/portalShareLink.ts').catch(() => ({}));
const docs   = { POST: docsMod.POST ?? missing, GET: docsMod.GET ?? missing, DELETE: docsMod.DELETE ?? missing };
const portal = { POST: portalMod.POST ?? missing };
const links  = { POST: linksMod.POST ?? missing };

const bulkDeletes = [];
let checks = 0; const failures = [];
const ok = (label, cond, detail) => { checks++; if (!cond) failures.push(detail ? `${label}\n      ${detail}` : label); };
const req = (url, init) => new NextRequest(new URL(url, 'https://ledrixlabs.test'), init);
const json = (url, body, method = 'POST') => req(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const callPortal = (body) => portal.POST(json('/api/portal', body));
const callLinks  = (body) => links.POST(json('/api/portal-links', body));
const getShare   = (token) => shareMod.GET(req(`/api/share/${token}`), { params: Promise.resolve({ token }) });
const getDoc     = (q) => docs.GET(req(`/api/docs?${q}`));
const delDoc     = (token, id) => docs.DELETE(json('/api/docs', { token, id }, 'DELETE'));

/** The page's three-step upload, replayed: sign → PUT the bytes to storage → complete. */
async function uploadAsPage(token, file, kind = 'document') {
  const signed = await docs.POST(json('/api/docs', { token, action: 'upload-url', name: file.name, size: file.size, kind }));
  if (!signed.ok) return { step: 'sign', status: signed.status };
  const { uploadUrl, path, contentType } = await signed.json();
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, body: file });
  if (!put.ok) return { step: 'put', status: put.status };
  const done = await docs.POST(json('/api/docs', { token, action: 'complete', path, name: file.name, kind }));
  return { step: 'complete', status: done.status, body: done.ok ? await done.json() : null, path, uploadUrl };
}
const pdf = (name = 'warranty.pdf', size = 10) => {
  const bytes = new Uint8Array(size); bytes.set(PDF_HEAD.slice(0, Math.min(size, PDF_HEAD.length)));
  return new File([bytes], name, { type: 'application/pdf' });
};
const fileOf = (name, text, type) => new File([new TextEncoder().encode(text)], name, { type });
const filed = (staging) => staging.replace('/_incoming/', '/');

// ══ Scoped links: the original link edits, minted links read or show repairs only ═════════
reset();
const READ_A = 'read_tok_A_000000000000000000000000000000000';
const REP_A  = 'repairs_tok_A_00000000000000000000000000000';
addLink(A.share, READ_A, 'read');
addLink(A.share, REP_A, 'repairs');
{
  const edit = await (await getShare(A.token)).json();
  ok('S the original link still loads the home, marked edit', edit.share_id === A.share && edit.access === 'edit');
  ok('S the record never carries share_token', !('share_token' in edit));
  const read = await (await getShare(READ_A)).json();
  ok('S a view-only link loads the same home, marked read', read.share_id === A.share && read.access === 'read');
  const rep = await getShare(REP_A);
  const repBody = await rep.json();
  ok('S a repairs link gets only address and inspection date', rep.status === 200 && repBody.access === 'repairs'
    && repBody.address === '1 Alpha Ln' && !('anomalies' in repBody) && !('share_id' in repBody) && !('license_number' in repBody));

  const rSel = await callPortal({ token: READ_A, table: 'home_reminders', op: 'select' });
  ok('S a view-only link reads', rSel.status === 200 && (await rSel.json()).every(r => r.share_id === A.share));
  for (const [label, body] of [
    ['insert', { table: 'home_reminders', op: 'insert', body: { title: 'x' } }],
    ['update', { table: 'home_reminders', op: 'update', filter: 'id=eq.r-a1', body: { completed: true } }],
    ['delete', { table: 'home_reminders', op: 'delete', filter: 'id=eq.r-a1' }],
  ]) {
    const r = await callPortal({ token: READ_A, ...body });
    ok(`S a view-only link cannot ${label}`, r.status === 404);
  }
  ok('S …and nothing changed', db.home_reminders.length === 2 && db.home_reminders[0].completed === false);

  const repList = await (await callPortal({ token: REP_A, table: 'home_repairs', op: 'select', filter: 'status=eq.excluded' })).json();
  ok('S a repairs link sees only included repair items, whatever it asks for', repList.length === 0);
  const repAll = await (await callPortal({ token: REP_A, table: 'home_repairs', op: 'select', order: 'sort_order.asc' })).json();
  ok("S …which are its own home's included items", repAll.length === 1 && repAll[0].id === 'rp-a1');
  for (const t of ['home_reminders', 'home_documents', 'home_reports', 'home_projects']) {
    ok(`S a repairs link cannot read ${t}`, (await callPortal({ token: REP_A, table: t, op: 'select' })).status === 404);
  }
  ok('S a repairs link cannot open documents', (await getDoc(`t=${REP_A}&id=${DOC_A}`)).status === 404);
  ok('S (control) an active edit or view-only link opens report assets',
    [302, 307].includes((await assetRoute.GET(req(`/api/report-asset?t=${A.token}&path=insp_A/report.pdf`))).status)
      && [302, 307].includes((await assetRoute.GET(req(`/api/report-asset?t=${READ_A}&path=insp_A/report.pdf`))).status));
  ok('S a repairs link cannot open report assets', (await assetRoute.GET(req(`/api/report-asset?t=${REP_A}&path=insp_A/report.pdf`))).status === 404);
  ok('S a view-only link can open documents', [302, 307].includes((await getDoc(`t=${READ_A}&id=${DOC_A}`)).status));
  ok('S a view-only link cannot delete documents', (await delDoc(READ_A, DOC_A)).status === 404 && db.home_documents.some(d => d.id === DOC_A));
  const up = await uploadAsPage(READ_A, pdf());
  ok('S a view-only link cannot upload', up.step === 'sign' && up.status === 404);
}

// ══ Revocation ══════════════════════════════════════════════════════════════════════════════
reset();
{
  // Staff revocation of an ORIGINAL link: a row with its hash and revoked_at set (SQL runbook).
  addLink(A.share, A.token, 'edit', { created_via: 'staff', revoked_at: '2026-10-19T00:00:00Z' });
  ok('R a revoked original link no longer loads the home', (await getShare(A.token)).status === 404);
  ok('R …nor reads portal data', (await callPortal({ token: A.token, table: 'home_reminders', op: 'select' })).status === 404);
  ok('R …nor opens documents', (await getDoc(`t=${A.token}&id=${DOC_A}`)).status === 404);
  ok('R …nor uploads', (await uploadAsPage(A.token, pdf())).status === 404);
  ok('R …nor mints links', (await callLinks({ action: 'create', token: A.token, scope: 'read' })).status === 404);
  ok('R …nor lists or revokes links', (await callLinks({ action: 'list', token: A.token })).status === 404
    && (await callLinks({ action: 'revoke', token: A.token, id: uuid() })).status === 404);
  ok('R …nor deletes documents', (await delDoc(A.token, DOC_A)).status === 404 && db.home_documents.some(d => d.id === DOC_A));
  ok('R …nor writes portal data', (await callPortal({ token: A.token, table: 'home_reminders', op: 'insert', body: { title: 'x' } })).status === 404
    && db.home_reminders.length === 2);
  ok('R …nor completes an upload begun before revocation', (await docs.POST(json('/api/docs', { token: A.token, action: 'complete', path: `insp_A/_incoming/${Date.now()}_abcdef012345_x.pdf`, name: 'x.pdf' }))).status === 404);
  ok('R …nor opens report assets', (await assetRoute.GET(req(`/api/report-asset?t=${A.token}&path=insp_A/report.pdf`))).status === 404);
  ok('R the resolver itself refuses it, for every read and edit caller (incl. Ask Ledrix)',
    await shareLib.shareIdForToken(A.token) === null && await shareLib.editShareIdForToken(A.token) === null);
  ok('R home_records was not touched to revoke it', db.home_records.find(h => h.share_id === A.share).share_token === A.token);
  ok('R another home is unaffected', (await getShare(B.token)).status === 200);
  const NEW_A = 'replacement_edit_A_0000000000000000000000000';
  addLink(A.share, NEW_A, 'edit', { created_via: 'staff' });
  const repl = await (await getShare(NEW_A)).json();
  ok('R a staff-issued replacement edit link works', repl.share_id === A.share && repl.access === 'edit');
  const RV = 'read_to_revoke_0000000000000000000000000000';
  addLink(A.share, RV, 'read', { revoked_at: 'now' });
  ok('R a revoked view-only link is refused', (await getShare(RV)).status === 404);
  ok('R …everywhere', (await callPortal({ token: RV, table: 'home_reminders', op: 'select' })).status === 404
    && (await getDoc(`t=${RV}&id=${DOC_A}`)).status === 404 && await shareLib.shareIdForToken(RV) === null);
  const RD = 'read_holder_00000000000000000000000000000000';
  const rdRow = addLink(A.share, RD, 'read');
  ok('R a view-only holder cannot revoke its own link', (await callLinks({ action: 'revoke', token: RD, id: rdRow.id })).status === 404 && !rdRow.revoked_at);
  const origRow = db.portal_links.find(l => l.token_hash === sha(NEW_A));
  ok('R a view-only holder cannot revoke the edit link', (await callLinks({ action: 'revoke', token: RD, id: origRow.id })).status === 404 && !origRow.revoked_at);
  ok('R an edit holder cannot revoke an edit link, its own included', (await callLinks({ action: 'revoke', token: NEW_A, id: origRow.id })).status === 404 && !origRow.revoked_at);
  ok('R there is no route parameter that revokes by token or share', (await callLinks({ action: 'revoke', token: NEW_A, share_id: A.share, scope: 'edit' })).status === 404
    && db.portal_links.filter(l => l.revoked_at).length === 2);
}
reset();
{
  linksTable = false;   // before supabase_portal_links.sql is applied
  const r = await getShare(A.token);
  ok('R before the links table exists, original links work exactly as before', r.status === 200 && (await r.json()).access === 'edit');
  linksTable = true; linksFail = true;
  ok('R if revocation state cannot be read, the token is refused (fail closed)', (await getShare(A.token)).status === 404
    && (await callPortal({ token: A.token, table: 'home_reminders', op: 'select' })).status === 404);
}

// ══ /api/portal-links ═══════════════════════════════════════════════════════════════════════
reset();
{
  const c = await callLinks({ action: 'create', token: A.token, scope: 'read' });
  const made = await c.json();
  ok('L an edit link mints a view-only link', c.status === 200 && typeof made.token === 'string' && made.token.length >= 40 && /^[A-Za-z0-9_-]+$/.test(made.token));
  const stored = db.portal_links.find(l => l.id === made.id);
  ok('L only the hash is stored, never the token', stored && stored.token_hash === sha(made.token) && !JSON.stringify(db.portal_links).includes(made.token));
  ok('L …and the minted link works as view-only', (await (await getShare(made.token)).json()).access === 'read');
  const rep = await (await callLinks({ action: 'create', token: A.token, scope: 'repairs' })).json();
  ok('L an edit link mints a repairs link', (await (await getShare(rep.token)).json()).access === 'repairs');
  ok('L an edit link cannot be minted', (await callLinks({ action: 'create', token: A.token, scope: 'edit' })).status === 400);
  ok('L a view-only link cannot mint links', (await callLinks({ action: 'create', token: made.token, scope: 'read' })).status === 404);
  ok('L a repairs link cannot mint links', (await callLinks({ action: 'create', token: rep.token, scope: 'repairs' })).status === 404);
  ok('L no token cannot mint links', (await callLinks({ action: 'create', scope: 'read' })).status === 404);
  const list = await (await callLinks({ action: 'list', token: A.token })).json();
  ok("L list shows this home's minted links, without hashes", list.length === 2 && list.every(l => !('token_hash' in l)));
  const bLink = await (await callLinks({ action: 'create', token: B.token, scope: 'read' })).json();
  ok("L another home's link cannot be revoked", (await callLinks({ action: 'revoke', token: A.token, id: bLink.id })).status === 404
    && (await getShare(bLink.token)).status === 200);
  const staffEdit = addLink(A.share, 'staff_edit_A_000000000000000000000000000000', 'edit', { created_via: 'staff' });
  ok('L an edit link cannot revoke an edit link', (await callLinks({ action: 'revoke', token: A.token, id: staffEdit.id })).status === 404 && !staffEdit.revoked_at);
  ok("L an edit link revokes its own home's view-only link", (await callLinks({ action: 'revoke', token: A.token, id: made.id })).status === 204
    && (await getShare(made.token)).status === 404);
  ok('L a repairs link cannot revoke', (await callLinks({ action: 'revoke', token: rep.token, id: rep.id })).status === 404);
  linksTable = false;
  ok('L before the table exists, minting answers 503 "not available yet"', (await callLinks({ action: 'create', token: A.token, scope: 'read' })).status === 503);
}

// ══ Share buttons fail closed (lib/portalShareLink.ts against the real /api/portal-links) ═══
reset();
{
  const viaRoute = (u, init) => links.POST(req(u, init));
  const portalShareUrl = shareLinkLib.portalShareUrl ?? (async () => ({ ok: true, url: `https://ledrixlabs.test/share/${A.token}` }));
  const share = (o) => portalShareUrl({ fetchFn: viaRoute, origin: 'https://ledrixlabs.test', token: A.token, pageScope: 'edit',
    currentHref: `https://ledrixlabs.test/share/${A.token}`, ...o });
  const leaksEdit = (r) => JSON.stringify(r).includes(A.token);

  const good = await share({ kind: 'read' });
  const mintedTok = good.ok ? good.url.split('/share/')[1] : '';
  ok('F success: an edit page shares a freshly minted view-only link', good.ok && !leaksEdit(good) && (await (await getShare(mintedTok)).json()).access === 'read');
  const rep2 = await share({ kind: 'repairs' });
  ok('F success: the repair button shares a repairs-only link', rep2.ok && rep2.url.endsWith('/repairs') && !leaksEdit(rep2)
    && (await (await getShare(rep2.url.split('/share/')[1].replace('/repairs', ''))).json()).access === 'repairs');
  linksTable = false;
  for (const kind of ['read', 'repairs']) {
    const r = await share({ kind });
    ok(`F missing portal_links table (${kind}): an error, and no link — never the edit link`, r.ok === false && !!r.message && !leaksEdit(r) && !('url' in r));
  }
  linksTable = true; linksFail = true;
  for (const kind of ['read', 'repairs']) {
    const r = await share({ kind });
    ok(`F database error (${kind}): an error, and no link`, r.ok === false && !leaksEdit(r) && !('url' in r));
  }
  linksFail = false;
  for (let i = 0; i < 30; i++) addLink(A.share, `cap_${i}_${'0'.repeat(30)}`, 'read');
  const capped = await share({ kind: 'read' });
  ok('F per-home cap reached: an error, and no link', capped.ok === false && !leaksEdit(capped));
  const odd = await portalShareUrl({ fetchFn: async () => Response.json({ token: A.token }), origin: 'https://x', token: A.token, pageScope: 'edit', kind: 'read' });
  ok('F a response echoing the edit token is not shared', odd.ok === false && !leaksEdit(odd));
  const thrown = await portalShareUrl({ fetchFn: async () => { throw new Error('offline'); }, origin: 'https://x', token: A.token, pageScope: 'edit', kind: 'read' });
  ok('F a network failure: an error, and no link', thrown.ok === false && !leaksEdit(thrown));
  const readPage = await portalShareUrl({ fetchFn: async () => { throw new Error('not called'); }, origin: 'https://x', token: READ_A, pageScope: 'read', kind: 'read', currentHref: `https://x/share/${READ_A}` });
  ok('F a view-only page shares its own (view-only) link without minting', readPage.ok && readPage.url === `https://x/share/${READ_A}`);
  const readRepairs = await portalShareUrl({ fetchFn: async () => { throw new Error('not called'); }, origin: 'https://x', token: READ_A, pageScope: 'read', kind: 'repairs' });
  ok('F a view-only page cannot hand out a repairs link', readRepairs.ok === false);
  ok('F failed shares leave existing links working', (await getShare(A.token)).status === 200 && (await getShare(mintedTok)).status === 200);
}

// ══ A2 · upload: signed, direct to storage, completed and checked by the server ═════════════
reset();
{
  const r = await uploadAsPage(A.token, pdf());
  ok('A2 an edit link uploads (sign → PUT → complete)', r.status === 200 && !!r.body?.id, JSON.stringify(r));
  const row = db.home_documents.find(d => d.id === r.body?.id);
  ok("A2 the row is written by the server, under the token's share, with the stored size", row?.share_id === A.share && row?.path === filed(r.path ?? '') && row?.size === 10);
  ok('A2 the upload URL names a staging path; the file is filed elsewhere and staging is left empty',
    /^insp_A\/_incoming\/\d{13}_[0-9a-f]{12}_warranty\.pdf$/.test(r.path ?? '') && objects.has(filed(r.path)) && !objects.has(r.path));
  ok('A2 the response carries no public URL', !JSON.stringify(r.body).includes('/object/public/'));
  const sign = calls.find(c => c.url.includes('/object/upload/sign/') && c.method === 'POST');
  ok('A2 the signed upload never upserts', sign?.headers['x-upsert'] === 'false');
}
reset();
for (const [label, token] of [['missing token', undefined], ['invalid token', 'tok_nope'], ['malformed token', '../insp_B'], ['token as an array', [A.token]]]) {
  const r = await docs.POST(json('/api/docs', { token, action: 'upload-url', name: 'x.pdf', size: 10 }));
  ok(`A2 ${label} cannot get an upload URL`, r.status === 404, `status ${r.status}`);
}
{
  const legacy = new FormData(); legacy.append('file', pdf()); legacy.append('shareId', B.share);
  const r = await docs.POST(req('/api/docs', { method: 'POST', body: legacy }));
  ok('A2 the old multipart shareId upload is refused', r.status === 400 || r.status === 404, `status ${r.status}`);
  ok('A2 refused uploads store nothing', objects.size === 2 && db.home_documents.length === 3);
  ok('A2 an unsupported type is refused before signing', (await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: 'x.html', size: 5 }))).status === 400);
  ok('A2 a declared size over 20 MB is refused before signing', (await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: 'x.pdf', size: 20 * 1024 * 1024 + 1 }))).status === 400);
  ok('A2 an empty file is refused', (await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: 'x.pdf', size: 0 }))).status === 400);
}
{
  // Lie about the size: declare 10 bytes, store 21 MB. complete reads the real size and refuses.
  const signed = await (await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: 'big.pdf', size: 10 }))).json();
  await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf('big.pdf', 21 * 1024 * 1024) });
  const done = await docs.POST(json('/api/docs', { token: A.token, action: 'complete', path: signed.path, name: 'big.pdf' }));
  ok('A2 an oversized stored file is refused at completion and removed', done.status === 400 && !objects.has(signed.path)
    && !objects.has(filed(signed.path)) && !db.home_documents.some(d => d.path === filed(signed.path)));
  const signed2 = await (await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: 'x.pdf', size: 10 }))).json();
  await fetch(signed2.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: pdf('x.pdf') });
  ok('A2 a stored file of the wrong type is refused at completion and removed',
    (await docs.POST(json('/api/docs', { token: A.token, action: 'complete', path: signed2.path, name: 'x.pdf' }))).status === 400
      && !objects.has(signed2.path) && !objects.has(filed(signed2.path)));
  // The stored type is whatever the browser sent; the bytes are checked too.
  for (const [label, file, type] of [
    ['HTML named .pdf and sent as application/pdf', fileOf('a.pdf', '<html><script>alert(1)</script></html>', 'application/pdf'), 'application/pdf'],
    ['HTML named .txt', fileOf('notes.txt', '  <!doctype html><script>x()</script>', 'text/plain'), 'text/plain'],
    ['a binary blob named .png', fileOf('p.png', 'MZ\u0090\u0000 not an image', 'image/png'), 'image/png'],
  ]) {
    const sg = await (await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: file.name, size: file.size }))).json();
    await fetch(sg.uploadUrl, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
    const st = (await docs.POST(json('/api/docs', { token: A.token, action: 'complete', path: sg.path, name: file.name }))).status;
    ok(`A2 ${label} is refused by its bytes and removed`, st === 400 && !objects.has(sg.path) && !objects.has(filed(sg.path))
      && !db.home_documents.some(d => d.name === file.name), `status ${st}`);
  }
  const txt = await uploadAsPage(A.token, fileOf('notes.txt', 'Furnace filter 16x25x1, changed 10/19', 'text/plain'));
  ok('A2 a plain text file is accepted', txt.status === 200, JSON.stringify(txt));
  const sg = await (await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: 'r.pdf', size: 10 }))).json();
  await fetch(sg.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf('r.pdf') });
  docInsertFails = true;
  const failed = await docs.POST(json('/api/docs', { token: A.token, action: 'complete', path: sg.path, name: 'r.pdf' }));
  docInsertFails = false;
  ok('A2 if the row cannot be written, the moved file is removed (no unlisted file left behind)',
    failed.status === 502 && !objects.has(filed(sg.path)) && !objects.has(sg.path));
}
reset();
addLink(A.share, READ_A, 'read');
{
  const forge = async (path, name, token = A.token) => (await docs.POST(json('/api/docs', { token, action: 'complete', path, name }))).status;
  ok("A2 complete cannot file another home's object", await forge('insp_B/200_bbb_secret.pdf', 'secret.pdf') === 404);
  ok('A2 complete cannot file an existing object of its own home that it did not just issue', await forge('insp_A/100_aaa_receipt.pdf', 'receipt.pdf') === 404);
  ok('A2 complete cannot file a path that was never uploaded', await forge(`insp_A/_incoming/${Date.now()}_abcdef012345_ghost.pdf`, 'ghost.pdf') === 404);
  ok('A2 complete accepts only a staging path, never a final-looking one', await forge(`insp_A/${Date.now()}_abcdef012345_ghost.pdf`, 'ghost.pdf') === 404);
  const r = await uploadAsPage(A.token, pdf('once.pdf'));
  ok('A2 a completed upload cannot be filed twice', r.status === 200 && await forge(r.path, 'once.pdf') === 404
    && db.home_documents.filter(d => d.path === filed(r.path)).length === 1);
  ok('A2 a view-only link cannot complete an upload', await forge(r.path, 'once.pdf', READ_A) === 404);
  // The upload URL can still write its staging path for a while (Storage tokens last 2 h). That
  // must not reach the filed file, and what it writes is never filed or served.
  const done = db.home_documents.find(d => d.path === filed(r.path));
  const reput = await fetch(r.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf('once.pdf', 77) });
  ok('A2 re-using an upload URL after completion cannot change the filed file',
    reput.ok && objects.get(filed(r.path)).size === 10 && objects.get(r.path)?.size === 77);
  ok('A2 …and what it wrote cannot be filed', await forge(r.path, 'once.pdf') === 404 && db.home_documents.filter(d => d.share_id === A.share && d.name === 'once.pdf').length === 1);
  db.home_documents.push({ id: '44444444-4444-4444-8444-444444444444', share_id: A.share, name: 'staged', url: 'x', path: r.path, kind: 'document' });
  ok('A2 a staging object is never served, even if a row names it', (await getDoc(`t=${A.token}&id=44444444-4444-4444-8444-444444444444`)).status === 404);
  ok('A2 a mismatched file name cannot complete another upload', await (async () => {
    const s2 = await (await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: 'a.pdf', size: 10 }))).json();
    await fetch(s2.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf('a.pdf') });
    return await forge(s2.path, 'b.pdf') === 404 && objects.has(s2.path);
  })());
  ok('A2 (fixture) the first completion was filed', !!done);
  const signed = await (await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: 'twin.pdf', size: 10 }))).json();
  await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf('twin.pdf') });
  const again = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: pdf('twin.pdf', 99) });
  ok('A2 a signed upload URL cannot overwrite what it already stored', again.status === 409 && objects.get(signed.path).size === 10);
}

// ══ A2 · abandoned uploads are swept, only from this home's staging folder ══════════════════
reset();
{
  const old = Date.now() - 7 * 3600_000, fresh = Date.now() - 60_000;
  const put = (k) => objects.set(k, { size: 10, mimetype: 'application/pdf', head: PDF_HEAD });
  put(`insp_A/_incoming/${old}_aaaaaaaaaaaa_old.pdf`);
  put(`insp_A/_incoming/${fresh}_bbbbbbbbbbbb_fresh.pdf`);
  put('insp_A/_incoming/not-ours.pdf');
  put(`insp_B/_incoming/${old}_cccccccccccc_b_old.pdf`);
  put(`insp_A/${old}_dddddddddddd_filed.pdf`);
  const r = await docs.POST(json('/api/docs', { token: A.token, action: 'upload-url', name: 'x.pdf', size: 10 }));
  ok('A2 starting an upload sweeps this home\'s abandoned uploads older than 6 h', r.status === 200 && !objects.has(`insp_A/_incoming/${old}_aaaaaaaaaaaa_old.pdf`));
  ok('A2 …but not a recent one (it may still be uploading)', objects.has(`insp_A/_incoming/${fresh}_bbbbbbbbbbbb_fresh.pdf`));
  ok('A2 …nor a name the route never issues', objects.has('insp_A/_incoming/not-ours.pdf'));
  ok("A2 …nor another home's", objects.has(`insp_B/_incoming/${old}_cccccccccccc_b_old.pdf`));
  ok('A2 …nor any filed document', objects.has(`insp_A/${old}_dddddddddddd_filed.pdf`) && objects.has('insp_A/100_aaa_receipt.pdf'));
  ok('A2 the sweep deletes by exact name under the staging folder only', bulkDeletes.length > 0 && bulkDeletes.every(k => /^insp_A\/_incoming\/\d{13}_[0-9a-f]{12}_/.test(k)));
  bulkDeletes.length = 0;
  ok('A2 a view-only link cannot trigger the sweep', (await docs.POST(json('/api/docs', { token: READ_A, action: 'upload-url', name: 'x.pdf', size: 10 }))).status === 404 && bulkDeletes.length === 0);
}

// ══ A1 · retrieval and deletion ═════════════════════════════════════════════════════════════
reset();
{
  const r = await getDoc(`t=${A.token}&id=${DOC_A}`);
  ok('A1 own document opens through a short-lived signed link', [302, 307].includes(r.status), `status ${r.status}`);
  ok('A1 the redirect is a signed URL, not a public one', /\/object\/sign\/home-documents\/insp_A\//.test(r.headers.get('location') ?? ''));
  ok('A1 the redirect is not cached', /no-store/.test(r.headers.get('cache-control') ?? ''));
}
for (const [label, q] of [
  ["another home's document id with my token", `t=${A.token}&id=${DOC_B}`],
  ["a row on my share that names another home's path", `t=${A.token}&id=${DOC_FORGED}`],
  ['no token', `id=${DOC_A}`],
  ['an invalid token', `t=tok_nope&id=${DOC_A}`],
  ['a storage path instead of an id', `t=${A.token}&id=insp_B/200_bbb_secret.pdf`],
]) ok(`A1 ${label} → 404`, (await getDoc(q)).status === 404);
ok('A1 no refused request asked storage to sign anything', calls.filter(c => c.url.includes('/object/sign/')).length === 1);
reset();
{
  ok("A1 deleting another home's document is refused", (await delDoc(A.token, DOC_B)).status === 404
    && objects.has('insp_B/200_bbb_secret.pdf') && db.home_documents.some(d => d.id === DOC_B));
  ok("A1 a forged row cannot delete another home's file, but its own row is removable",
    (await delDoc(A.token, DOC_FORGED)).status === 204 && objects.has('insp_B/200_bbb_secret.pdf') && !db.home_documents.some(d => d.id === DOC_FORGED));
  ok('A1 delete without a token is refused', (await delDoc(undefined, DOC_A)).status === 404);
  storageDeleteFails = true;
  ok('A1 if storage cannot delete the file, the row is kept for a retry', (await delDoc(A.token, DOC_A)).status === 502
    && db.home_documents.some(d => d.id === DOC_A) && objects.has('insp_A/100_aaa_receipt.pdf'));
  storageDeleteFails = false;
  ok('A1 deleting own document removes the row and the stored file', (await delDoc(A.token, DOC_A)).status === 204
    && !objects.has('insp_A/100_aaa_receipt.pdf') && !db.home_documents.some(d => d.id === DOC_A));
}
reset();
objects.delete('insp_A/100_aaa_receipt.pdf');
ok('A1 a file already gone from storage still lets its row be removed', (await delDoc(A.token, DOC_A)).status === 204);

// ══ A3 · the portal data route ══════════════════════════════════════════════════════════════
reset();
{
  const rows = await (await callPortal({ token: A.token, table: 'home_reminders', op: 'select', filter: `share_id=eq.${B.share}` })).json();
  ok('A3 a smuggled share_id cannot read another home', rows.every(x => x.share_id === A.share));
  ok('A3 an invalid token reads nothing', (await callPortal({ token: 'tok_nope', table: 'home_reminders', op: 'select' })).status === 404);
  const none = await callPortal({ table: 'home_reminders', op: 'select' });
  ok('A3 a missing token reads nothing', none.status === 400 || none.status === 404);
}
for (const [label, extra] of [
  ['an or= filter', { op: 'select', filter: `or=(share_id.eq.${B.share})` }],
  ['an unknown filter operator', { op: 'select', filter: 'title=like.*' }],
  ['a select that embeds another table', { op: 'select', select: '*,home_records(*)' }],
  ['an order clause carrying grammar', { op: 'select', order: 'title.asc,home_records(share_token)' }],
  ['control characters in a value', { op: 'select', filter: 'title=eq.a%00b' }],
  ['a delete by inequality (all-but-one)', { op: 'delete', filter: 'id=neq.nothing' }],
  ['an update by range', { op: 'update', filter: 'title=gt.', body: { completed: true } }],
  ['an update with no filter of its own', { op: 'update', body: { completed: false } }],
  ['a delete with no filter of its own', { op: 'delete' }],
]) ok(`A3 ${label} is refused`, (await callPortal({ token: A.token, table: 'home_reminders', ...extra })).status === 400);
ok('A3 …and none of them changed anything', db.home_reminders.length === 2 && db.home_reminders.every(r => r.completed === false));
{
  const r = await callPortal({ token: A.token, table: 'home_reminders', op: 'insert', body: { title: 'Gutters', share_id: B.share, id: 'r-b1', seeded: false } });
  const made = db.home_reminders.filter(x => x.title === 'Gutters');
  ok("A3 an insert is forced onto the token's share and cannot choose its id", r.status === 204 && made.length === 1 && made[0].share_id === A.share && made[0].id !== 'r-b1');
  await callPortal({ token: A.token, table: 'home_reminders', op: 'update', filter: 'id=eq.r-b1', body: { completed: true } });
  ok("A3 an update naming another home's row changes nothing", db.home_reminders.find(x => x.id === 'r-b1').completed === false);
  await callPortal({ token: A.token, table: 'home_reminders', op: 'update', filter: 'id=eq.r-a1', body: { completed: true, id: 'hijack', share_id: B.share, title: 'renamed' } });
  const a1 = db.home_reminders.find(x => x.id === 'r-a1');
  ok('A3 an update keeps only allow-listed columns', a1?.completed === true && a1.share_id === A.share && a1.title === 'Filter');
  ok('A3 an update with no allowed column is refused', (await callPortal({ token: A.token, table: 'home_reminders', op: 'update', filter: 'id=eq.r-a1', body: { share_id: B.share } })).status === 400);
  await callPortal({ token: A.token, table: 'home_reminders', op: 'delete', filter: 'id=eq.r-b1' });
  ok("A3 a delete naming another home's row removes nothing", db.home_reminders.some(x => x.id === 'r-b1'));
  const hash = await callPortal({ token: A.token, table: 'home_reminders', op: 'delete', filter: 'id=eq.r-a1#&seeded=eq.true' });
  const sent = calls.filter(c => c.method === 'DELETE').at(-1)?.url ?? '';
  ok("A3 a '#' in a value is encoded, never truncating the query", hash.status === 204 && sent.includes('%23') && !sent.includes('#') && db.home_reminders.some(r => r.id === 'r-a1'));
  ok("A3 every write the routes sent used equality (or the server's own guard)", writeOps.every(o => o === 'eq' || o === 'in'), writeOps.join(','));
  ok("A3 every write is scoped to the token's share before any client term", calls.filter(c => ['PATCH', 'DELETE'].includes(c.method) && c.url.includes('/rest/v1/home_'))
    .every(c => new URL(c.url).search.startsWith(`?share_id=eq.${A.share}&`)));
}
{
  ok('A3 a client-filed document row cannot point at storage', (await callPortal({ token: A.token, table: 'home_documents', op: 'insert', body: [{ name: 'x', url: `${BASE}/storage/v1/object/public/home-documents/insp_B/200_bbb_secret.pdf`, kind: 'manual' }] })).status === 400);
  const withPath = await callPortal({ token: A.token, table: 'home_documents', op: 'insert', body: [{ name: 'x', url: 'https://example.com/m.pdf', path: 'insp_B/200_bbb_secret.pdf', kind: 'manual' }] });
  ok('A3 a client-filed document row cannot carry a storage path', withPath.status === 204 && db.home_documents.find(d => d.url === 'https://example.com/m.pdf')?.path === undefined);
  ok('A3 document rows are deleted only through /api/docs', (await callPortal({ token: A.token, table: 'home_documents', op: 'delete', filter: `id=eq.${DOC_A}` })).status === 404);
  ok('A3 read-only tables refuse writes', (await callPortal({ token: A.token, table: 'home_reports', op: 'insert', body: { x: 1 } })).status === 404);
  ok('A3 tables outside the allow-list are unreachable', (await callPortal({ token: A.token, table: 'home_records', op: 'select' })).status === 404
    && (await callPortal({ token: A.token, table: 'portal_links', op: 'select' })).status === 404);
  ok('A3 oversized batches are refused', (await callPortal({ token: A.token, table: 'home_maintenance_log', op: 'insert', body: Array.from({ length: 101 }, () => ({ title: 't' })) })).status === 400);
  ok('A3 a batch whose rows carry different columns is refused by the database, not partly written',
    (await callPortal({ token: A.token, table: 'home_maintenance_log', op: 'insert', body: [{ title: 'a', note: 'x' }, { title: 'b' }] })).status === 400
    && db.home_maintenance_log.length === 3);
}

// ══ Maintenance log: homeowner-created entries are deletable, nothing else ═══════════════════
reset();
addLink(A.share, READ_A, 'read');
{
  ok('M an edit link deletes a homeowner-created entry', (await callPortal({ token: A.token, table: 'home_maintenance_log', op: 'delete', filter: 'id=eq.m-a1' })).status === 204
    && !db.home_maintenance_log.some(m => m.id === 'm-a1'));
  await callPortal({ token: A.token, table: 'home_maintenance_log', op: 'delete', filter: 'id=eq.m-a2' });
  ok('M an entry not created by the homeowner is not deleted', db.home_maintenance_log.some(m => m.id === 'm-a2'));
  await callPortal({ token: A.token, table: 'home_maintenance_log', op: 'delete', filter: 'id=eq.m-b1' });
  ok("M another home's entry is not deleted", db.home_maintenance_log.some(m => m.id === 'm-b1'));
  ok('M a view-only link cannot delete entries', (await callPortal({ token: READ_A, table: 'home_maintenance_log', op: 'delete', filter: 'id=eq.m-a2' })).status === 404);
  ok('M entries still cannot be edited', (await callPortal({ token: A.token, table: 'home_maintenance_log', op: 'update', filter: 'id=eq.m-a2', body: { title: 'x' } })).status === 404);
}

// ══ Client contract: the portal page's own code, end to end ═════════════════════════════════
reset();
{
  const page = readFileSync(new URL('../app/share/[id]/page.tsx', import.meta.url), 'utf8');
  const repairsPage = readFileSync(new URL('../app/share/[id]/repairs/page.tsx', import.meta.url), 'utf8');
  const tab = page.slice(page.indexOf('function DocsTab('), page.indexOf('// ── Category detail'));
  ok('C upload is sign → PUT → complete, with the token, never a shareId or a file through the route',
    /action: 'upload-url', name: f\.name, size: f\.size, kind/.test(tab) && /method: 'PUT'/.test(tab)
      && /action: 'complete', path, name: f\.name, kind/.test(tab) && !/append\('shareId'/.test(tab) && !/new FormData\(\)/.test(tab));
  ok('C the client no longer files or deletes document rows itself', !/supaPost\('home_documents'/.test(tab) && !/supaDelete\('home_documents'/.test(tab));
  ok('C delete goes to /api/docs with the token and id', /fetch\('\/api\/docs', \{ method: 'DELETE'[^\n]*JSON\.stringify\(\{ token: PORTAL_TOKEN, id: d\.id \}\)/.test(tab));
  ok('C no document link is built from a stored public URL', /href=\{docHref\(d\)\}/.test(page) && !/href=\{d\.url\}/.test(page));
  // The tile list renders after '// ── Category detail', outside `tab`, so these read the whole page.
  ok('C view-only links hide upload, document delete and log delete', /openCat !== 'reports' && canEdit\(\)/.test(page)
    && /\{canEdit\(\) && <button onClick=\{\(\) => removeDoc\(d\)\}/.test(page) && /canEdit\(\) && \['manual', 'task', 'voice'\]\.includes/.test(page));
  ok('C the page shares a minted view-only link, and repair links are minted repairs links',
    /shareUrlFor\('read'\)/.test(page) && /shareUrlFor\('repairs'\)/.test(page) && !/\/share\/\$\{shareId\}\/repairs/.test(page)
      && /from '@\/lib\/portalShareLink'/.test(page) && /fetchFn: \(u, i\) => fetch\(u, i\)/.test(page));
  const handleShare = page.slice(page.indexOf('const handleShare = async'), page.indexOf('if (loading)', page.indexOf('const handleShare = async')));
  ok('C Share stops on a failed mint and has no fallback to the page URL',
    /if \(!link\.ok\) \{ window\.alert\(link\.message\); return; \}/.test(handleShare) && !/window\.location\.href/.test(handleShare) && !/mintPortalLink/.test(page));
  ok('C the repair Share stops on a failed mint', /if \(!link\.ok\) \{ window\.alert\(`\$\{link\.message\} You can use Copy text instead\.`\); return; \}/.test(page));
  ok('C a repairs link opening the main page is sent to the repairs page', /rec\?\.access === 'repairs'\) \{ window\.location\.replace/.test(page));
  ok('C seeding writes run only for edit links', /if \(!seeded\.current && canEdit\(\)\)/.test(page));
  ok('C the repairs page accepts a repairs-only record', /d\?\.access === 'repairs'/.test(repairsPage));

  const src = /const docHref = \(d: any\): string \| undefined =>([\s\S]*?);\n/.exec(tab)?.[1];
  ok('C docHref is present', !!src);
  const docHref = src ? new Function('PORTAL_TOKEN', `return (d) => ${src};`)(A.token) : () => undefined;
  const list = await (await callPortal({ token: A.token, table: 'home_documents', op: 'select', filter: `share_id=eq.${encodeURIComponent(A.share)}`, order: 'created_at.desc' })).json();
  const href = docHref(list.find(d => d.id === DOC_A)) ?? '';
  ok('C a legacy row with a public URL opens through /api/docs', href.startsWith('/api/docs?t=') && !href.includes('/object/public/'));
  ok('C …and resolves to a signed URL for its own file', ((await getDoc(href.slice('/api/docs?'.length))).headers.get('location') ?? '').includes('/object/sign/home-documents/insp_A/100_aaa_receipt.pdf'));
  ok('C a manual-link row opens its outside link', docHref({ id: 'x', path: null, url: 'https://www.rheem.com/m.pdf' }) === 'https://www.rheem.com/m.pdf');
  ok('C a row with neither opens nothing', docHref({ id: 'x', path: null, url: 'storage://home-documents/x' }) === undefined);
  const up = await uploadAsPage(A.token, pdf('manual.pdf'));
  const mine = (await (await callPortal({ token: A.token, table: 'home_documents', op: 'select' })).json()).find(d => d.name === 'manual.pdf');
  ok("C an upload made the page's way is listed, opens, and deletes with its file", up.status === 200 && mine?.kind === 'document'
    && [302, 307].includes((await getDoc((docHref(mine) ?? '').slice('/api/docs?'.length))).status)
    && (await delDoc(A.token, mine.id)).status === 204 && !objects.has(mine.path));
}

// ══ Intended workflows still work (original links) ══════════════════════════════════════════
reset();
{
  ok('W maintenance log entry is saved', (await callPortal({ token: A.token, table: 'home_maintenance_log', op: 'insert', body: [{ share_id: A.share, title: 'Filter replaced', system: 'HVAC', kind: 'service', note: null, done_date: '2026-10-19', source: 'manual' }] })).status === 204);
  ok('W project status advances', (await callPortal({ token: A.token, table: 'home_projects', op: 'update', filter: 'id=eq.p-a1', body: { status: 'in_progress' } })).status === 204 && db.home_projects[0].status === 'in_progress');
  ok('W repair request draft is saved (anomaly_ref filter)', (await callPortal({ token: A.token, table: 'home_repairs', op: 'update', filter: `share_id=eq.${A.share}&anomaly_ref=eq.f1`, body: { remedy: 'Clear 36 in.', updated_at: '2026-10-19T00:00:00Z' } })).status === 204 && db.home_repairs[0].remedy === 'Clear 36 in.');
  ok('W seeded-reminder reset still runs', (await callPortal({ token: A.token, table: 'home_reminders', op: 'delete', filter: `share_id=eq.${A.share}&seeded=eq.true` })).status === 204);
  ok('W manufacturer-manual link is filed', (await callPortal({ token: A.token, table: 'home_documents', op: 'insert', body: [{ share_id: A.share, name: 'Rheem Manual', url: 'https://www.rheem.com/manual.pdf', path: null, kind: 'manual', size: null }] })).status === 204);
  ok('W ordered, column-limited reads work', (await callPortal({ token: A.token, table: 'home_reminders', op: 'select', order: 'due_date.asc.nullslast', limit: 200, select: 'id,title' })).status === 200);
}

console.log(`verify-portal-security: ${checks - failures.length}/${checks} passed`);
if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
