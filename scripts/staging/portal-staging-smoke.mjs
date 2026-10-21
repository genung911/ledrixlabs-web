#!/usr/bin/env node
// ─── STAGING ONLY — exercise the homeowner portal against a REAL Supabase project ─────────
//
// (Homeowner security pass 4, 2026-10-20.) verify-portal-security.mjs runs the routes against a
// fake Supabase. This runs the deployed routes (a Vercel preview or `next dev`) against the real
// staging project, so Storage's own behaviour is observed, not assumed: signed upload, overwrite
// refusal, bucket size/type limits, move, Range reads, the private bucket, and revocation.
// It needs no keys — only the site URL and the staging home's edit token — and prints no tokens.
//
//   STG_BASE=https://<preview>.vercel.app STG_EDIT_TOKEN=<token> node scripts/staging/portal-staging-smoke.mjs <phase>
//
//   phase  links-absent   before supabase_portal_links.sql: originals work, minting answers 503
//          full           after both migrations: links, uploads, documents, limits, privacy
//          revoked        after S4a (portal_staging_checks.sql): the original link is refused everywhere
//
// Safety: refuses ledrixlabs.com hosts, and refuses to write anything unless the token's home has
// a share_id beginning `stg_` (made by portal_staging_fixture.sql) — so it cannot touch a real home.
// It does NOT exercise the browser (CORS, the page's buttons); those are manual steps.

const phase = process.argv[2];
const BASE = (process.env.STG_BASE ?? '').replace(/\/+$/, '');
const TOKEN = process.env.STG_EDIT_TOKEN ?? '';
if (!['links-absent', 'full', 'revoked'].includes(phase) || !BASE || !TOKEN) {
  console.error('usage: STG_BASE=<preview or http://localhost:3000> STG_EDIT_TOKEN=<staging edit token> node scripts/staging/portal-staging-smoke.mjs links-absent|full|revoked');
  process.exit(2);
}
const host = new URL(BASE).hostname;
if (/(^|\.)ledrixlabs\.com$/i.test(host)) { console.error(`STOP: ${host} is production. Use a preview URL or localhost.`); process.exit(2); }

const rows = [];
const record = (step, expected, actual, pass) => { rows.push({ step, expected, actual: String(actual), pass: !!pass }); };
const api = (path, init = {}) => fetch(`${BASE}${path}`, { redirect: 'manual', ...init });
const postJson = (path, body, method = 'POST') => api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const PDF = (n = 2048) => { const b = new Uint8Array(n); b.set(new TextEncoder().encode('%PDF-1.7\n%staging\n')); return b; };
const sha = async (buf) => Buffer.from(await crypto.subtle.digest('SHA-256', buf)).toString('hex').slice(0, 16);

async function upload(name, bytes, putType, declaredSize = bytes.length) {
  const s = await postJson('/api/docs', { token: TOKEN, action: 'upload-url', name, size: declaredSize, kind: 'document' });
  if (!s.ok) return { step: 'sign', status: s.status };
  const { uploadUrl, path, contentType } = await s.json();
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': putType ?? contentType, 'x-upsert': 'false' }, body: bytes });
  const putBody = put.ok ? '' : (await put.text()).slice(0, 120);
  if (!put.ok) return { step: 'put', status: put.status, putBody, uploadUrl, path };
  const done = await postJson('/api/docs', { token: TOKEN, action: 'complete', path, name, kind: 'document' });
  return { step: 'complete', status: done.status, body: done.ok ? await done.json() : await done.json().catch(() => ({})), uploadUrl, path };
}

// ── Which home is this? ───────────────────────────────────────────────────────────────────
const shareRes = await api(`/api/share/${TOKEN}`);
if (phase === 'revoked') {
  record('original link loads the home', '404', shareRes.status, shareRes.status === 404);
} else {
  const rec = shareRes.ok ? await shareRes.json() : {};
  if (!String(rec.share_id ?? '').startsWith('stg_')) {
    console.error(`STOP: the token did not resolve to a staging home (status ${shareRes.status}). Nothing was written.`);
    process.exit(2);
  }
  record('original link loads the staging home as edit', 'edit', rec.access, rec.access === 'edit');
  record('record never carries share_token', 'absent', 'share_token' in rec ? 'present' : 'absent', !('share_token' in rec));
}

if (phase === 'links-absent') {
  const m = await postJson('/api/portal-links', { action: 'create', token: TOKEN, scope: 'read' });
  record('minting before portal_links exists', '503', m.status, m.status === 503);
}

if (phase === 'full') {
  // Links
  const mintRead = await postJson('/api/portal-links', { action: 'create', token: TOKEN, scope: 'read' });
  const read = mintRead.ok ? (await mintRead.json()).token : '';
  record('edit link mints a view-only link', '200', mintRead.status, mintRead.ok && !!read);
  const readRec = read ? await (await api(`/api/share/${read}`)).json() : {};
  record('view-only link loads as read', 'read', readRec.access, readRec.access === 'read');
  const w = await postJson('/api/portal', { token: read, table: 'home_reminders', op: 'insert', body: { title: 'should fail' } });
  record('view-only link cannot write', '404', w.status, w.status === 404);
  const mintRep = await postJson('/api/portal-links', { action: 'create', token: TOKEN, scope: 'repairs' });
  const rep = mintRep.ok ? (await mintRep.json()).token : '';
  const repRec = rep ? await (await api(`/api/share/${rep}`)).json() : {};
  record('repairs link sees only address/date', 'access=repairs, no anomalies', `access=${repRec.access}, anomalies ${'anomalies' in repRec ? 'present' : 'absent'}`,
    repRec.access === 'repairs' && !('anomalies' in repRec));
  const self = await postJson('/api/portal-links', { action: 'create', token: read, scope: 'read' });
  record('view-only link cannot mint', '404', self.status, self.status === 404);

  // Upload, open, overwrite, re-complete
  const bytes = PDF();
  const up = await upload('staging-manual.pdf', bytes);
  record('PDF upload: sign → PUT → complete', '200', `${up.step} ${up.status}${up.putBody ? ' ' + up.putBody : ''}`, up.step === 'complete' && up.status === 200);
  const id = up.body?.id;
  record('upload staged under _incoming/', '<share>/_incoming/…', up.path, /^stg_[^/]+\/_incoming\/\d{13}_[0-9a-f]{12}_staging-manual\.pdf$/.test(up.path ?? ''));
  const open = id ? await api(`/api/docs?t=${TOKEN}&id=${id}`) : null;
  const loc = open?.headers.get('location') ?? '';
  record('document opens via a signed redirect', '302/307 to /object/sign/', `${open?.status} ${loc.includes('/object/sign/') ? 'signed' : loc.slice(0, 40)}`,
    [302, 307].includes(open?.status) && loc.includes('/object/sign/'));
  const got = loc ? await fetch(loc) : null;
  const gotBuf = got?.ok ? await got.arrayBuffer() : new ArrayBuffer(0);
  record('signed URL serves the uploaded bytes', `sha ${await sha(bytes)}`, `${got?.status} sha ${await sha(gotBuf)}`, got?.ok && await sha(gotBuf) === await sha(bytes));
  if (up.uploadUrl) {
    const again = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: PDF(4096) });
    record('re-using the upload URL after completion (observe)', 'any — must not change the filed file', again.status, true);
    const reopen = await api(`/api/docs?t=${TOKEN}&id=${id}`);
    const re = reopen.headers.get('location') ? await fetch(reopen.headers.get('location')) : null;
    const reBuf = re?.ok ? await re.arrayBuffer() : new ArrayBuffer(0);
    record('…filed file unchanged', `sha ${await sha(bytes)}`, `sha ${await sha(reBuf)}`, await sha(reBuf) === await sha(bytes));
    const dup = await postJson('/api/docs', { token: TOKEN, action: 'complete', path: up.path, name: 'staging-manual.pdf', kind: 'document' });
    record('completing the same upload again', '404', dup.status, dup.status === 404);
  }
  const publicUrl = up.uploadUrl ? `${new URL(up.uploadUrl).origin}/storage/v1/object/public/home-documents/${(up.path ?? '').replace('/_incoming/', '/')}` : '';
  const pub = publicUrl ? await fetch(publicUrl) : null;
  record('public object URL is refused (bucket private)', '400/404', pub?.status, pub && [400, 404].includes(pub.status));

  // Storage's own limits (the browser talks to Storage directly)
  const big = await upload('staging-big.pdf', PDF(21 * 1024 * 1024), undefined, 10);
  record('bucket refuses a 21 MB PUT (declared 10 B)', 'put 4xx', `${big.step} ${big.status}`, big.step === 'put' && big.status >= 400 && big.status < 500);
  const html = await upload('staging-html.pdf', new TextEncoder().encode('<html><body>x</body></html>'), 'text/html');
  record('bucket refuses a text/html PUT', 'put 4xx', `${html.step} ${html.status}`, html.step === 'put' && html.status >= 400 && html.status < 500);
  const disguised = await upload('staging-disguised.pdf', new TextEncoder().encode('<html><script>x()</script></html>'));
  record('HTML bytes sent as application/pdf are refused at completion', 'complete 400', `${disguised.step} ${disguised.status}`, disguised.step === 'complete' && disguised.status === 400);
  const decl = await postJson('/api/docs', { token: TOKEN, action: 'upload-url', name: 'x.pdf', size: 21 * 1024 * 1024 });
  record('declared size over 20 MB refused before signing', '400', decl.status, decl.status === 400);

  // Delete
  if (id) {
    const del = await postJson('/api/docs', { token: TOKEN, id }, 'DELETE');
    const after = await api(`/api/docs?t=${TOKEN}&id=${id}`);
    record('delete removes the document', '204 then 404', `${del.status} then ${after.status}`, del.status === 204 && after.status === 404);
  }
}

if (phase === 'revoked') {
  const p = await postJson('/api/portal', { token: TOKEN, table: 'home_reminders', op: 'select' });
  record('revoked: portal data', '404', p.status, p.status === 404);
  const s = await postJson('/api/docs', { token: TOKEN, action: 'upload-url', name: 'x.pdf', size: 10 });
  record('revoked: upload', '404', s.status, s.status === 404);
  const m = await postJson('/api/portal-links', { action: 'create', token: TOKEN, scope: 'read' });
  record('revoked: mint links', '404', m.status, m.status === 404);
  const l = await postJson('/api/portal-links', { action: 'list', token: TOKEN });
  record('revoked: list links', '404', l.status, l.status === 404);
}

const w1 = Math.max(...rows.map(r => r.step.length)), w2 = Math.max(...rows.map(r => r.expected.length));
console.log(`portal staging smoke · phase ${phase} · ${host}\n`);
for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.step.padEnd(w1)}  expected ${r.expected.padEnd(w2)}  got ${r.actual}`);
const failed = rows.filter(r => !r.pass).length;
console.log(`\n${rows.length - failed}/${rows.length} passed`);
process.exit(failed ? 1 : 0);
