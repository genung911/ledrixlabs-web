#!/usr/bin/env node
// e2e:template-builder — the desktop Template Builder's owner workflow, in a real browser, against NO real database.
//
//   node scripts/e2e-template-builder.mjs            (starts `next dev` itself on E2E_PORT, default 3124)
//
// ISOLATION — this script cannot touch production:
//   · `next dev` is started with NEXT_PUBLIC_SUPABASE_URL pointed at a FAKE origin (http://fake-supabase.e2e) and every
//     server-side secret blanked, so neither the browser bundle nor any server code holds a real project URL or key;
//   · in the browser, every request to the fake origin is answered from an in-memory database (below); every other
//     non-local request is ABORTED, and any request aimed at a real Supabase host fails the run;
//   · the in-memory database enforces what supabase_company_templates_v2.sql enforces (ledrix-app, ledger #65):
//     row_version compare-and-swap on templates / drafts / inspection types, one draft per template, a draft starting
//     from the live version, owner-only template writes, owner/admin drafts, and publish_company_template_draft
//     (owner only, refuses a moved live template unless replacing, deletes the draft).
//
// THE WORKFLOW (owner): template list → duplicate → edit (rename an item, add a spec choice, add an item, reorder,
// condition switch) → autosave → undo from Draft changes → reload (persistence) → phone preview reflects the draft →
// a refused invalid edit → building types → publish → the published row equals the draft → list shows it live;
// plus: a concurrent save is refused (conflict banner), publishing a template carrying requirements is refused,
// an admin cannot publish, rename and delete go to the server.
// The published tree is written to E2E_OUT (default: a temp file) for the app-side pull → snapshot check.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ?? join(ROOT, '..', 'ledrix-app');
const PORT = Number(process.env.E2E_PORT ?? 3124);
const BASE = `http://localhost:${PORT}`;
const FAKE = 'http://fake-supabase.e2e';
const OUT = process.env.E2E_OUT ?? join(mkdtempSync(join(tmpdir(), 'tb-e2e-')), 'published-template.json');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── the in-memory database ───────────────────────────────────────────────────────────────────────────────────
const CO = randomUUID(), OWNER = randomUUID();
const def = JSON.parse(readFileSync(join(APP, 'src/core/templates/ledrixDefaultTemplate.json'), 'utf8'));
const LIVE_ID = randomUUID();
const now = () => new Date().toISOString();
const db = {
  inspector_profiles: [{ id: OWNER, full_name: 'E2E Owner', company_id: CO, role: 'owner' }],
  companies: [{ id: CO, name: 'E2E Inspections' }],
  company_templates: [{ id: LIVE_ID, company_id: CO, name: 'Standard', base: 'internachi', template: { id: LIVE_ID, name: 'Standard', ...clone(def) }, row_version: 3, updated_at: now(), created_at: now(), deleted_at: null }],
  company_template_drafts: [],
  company_inspection_types: [{ id: randomUUID(), company_id: CO, name: 'Full Home Inspection', template_id: LIVE_ID, row_version: 1, sort_order: 0, deleted_at: null }],
  calls: [],
};
const roleOf = () => db.inspector_profiles.find(p => p.id === OWNER)?.role;
const pgErr = (status, code, message, details = null) => ({ status, body: { code, message, details, hint: null } });
const parseFilters = (params) => {
  const f = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
    const m = /^(eq|neq|is|in)\.(.*)$/.exec(v);
    if (m) f.push([k, m[1], m[2]]);
  }
  return f;
};
const matches = (row, f) => f.every(([k, op, v]) => op === 'eq' ? String(row[k]) === v : op === 'neq' ? String(row[k]) !== v
  : op === 'is' ? (v === 'null' ? row[k] == null : String(row[k]) === v) : op === 'in' ? v.replace(/^\(|\)$/g, '').split(',').includes(String(row[k])) : true);
const project = (row, select) => {
  if (!select || select === '*') return clone(row);
  const out = {}; for (const c of select.split(',').map(s => s.trim()).filter(Boolean)) out[c] = row[c] ?? null; return out;
};
function writeRow(table, op, row, old) {
  const role = roleOf();
  if (table === 'company_templates') {
    if (role !== 'owner') return op === 'insert' ? pgErr(403, '42501', 'new row violates row-level security policy for table "company_templates"') : 'skip';
    if (op === 'insert') { Object.assign(row, { id: row.id ?? randomUUID(), row_version: 1, created_at: now(), updated_at: now(), deleted_at: row.deleted_at ?? null }); return null; }
    if (old.deleted_at) return pgErr(400, 'P0409', `template_deleted: ${old.id} was deleted`);
    if (row.row_version !== old.row_version + 1) return pgErr(400, 'P0409', `template_version_conflict: ${old.id} is at version ${old.row_version}`, String(old.row_version));
    row.updated_at = now(); return null;
  }
  if (table === 'company_template_drafts') {
    if (role !== 'owner' && role !== 'admin') return op === 'insert' ? pgErr(403, '42501', 'new row violates row-level security policy') : 'skip';
    if (op === 'insert') {
      if (row.template_id) {
        const live = db.company_templates.find(t => t.id === row.template_id);
        if (!live || live.company_id !== row.company_id || live.deleted_at) return pgErr(400, 'P0422', `draft_template: ${row.template_id} is not a live template of this company`);
        if (row.based_on_version !== live.row_version) return pgErr(400, 'P0409', `draft_base: the live template is at version ${live.row_version}, not ${row.based_on_version}`, String(live.row_version));
        if (db.company_template_drafts.some(d => d.template_id === row.template_id)) return pgErr(409, '23505', 'duplicate key value violates unique constraint "company_template_drafts_one_per_template"');
      }
      Object.assign(row, { id: row.id ?? randomUUID(), row_version: 1, created_at: now(), updated_at: now(), created_by: OWNER, updated_by: OWNER, history: row.history ?? { log: [], provenance: [], pending: null } });
      return null;
    }
    for (const k of ['id', 'company_id', 'template_id', 'based_on_version', 'created_by', 'created_at']) if (k in row && row[k] !== old[k]) return pgErr(400, 'P0422', 'draft_immutable: id, company, template, base version and creation cannot change');
    if (row.row_version !== old.row_version + 1) return pgErr(400, 'P0409', `draft_version_conflict: ${old.id} is at version ${old.row_version}`, String(old.row_version));
    row.updated_at = now(); return null;
  }
  if (table === 'company_inspection_types') {
    if (role !== 'owner') return op === 'insert' ? pgErr(403, '42501', 'new row violates row-level security policy') : 'skip';
    if (op === 'insert') { Object.assign(row, { id: row.id ?? randomUUID(), row_version: 1, deleted_at: null, sort_order: row.sort_order ?? 0 }); return null; }
    if (row.row_version !== old.row_version + 1) return pgErr(400, 'P0409', `inspection_type_version_conflict: ${old.id} is at version ${old.row_version}`, String(old.row_version));
    return null;
  }
  return pgErr(403, '42501', `no write policy on ${table}`);
}
function publish(args) {
  const d = db.company_template_drafts.find(x => x.id === args.p_draft_id);
  if (!d) return pgErr(400, 'P0404', `draft_missing: ${args.p_draft_id}`);
  if (roleOf() !== 'owner') return pgErr(400, 'P0403', 'owner_only: only the company owner can publish a template');
  if (d.row_version !== args.p_draft_version) return pgErr(400, 'P0409', `draft_version_conflict: the draft is at version ${d.row_version}`, String(d.row_version));
  let id, v;
  if (!d.template_id) {
    id = randomUUID(); v = 1;
    db.company_templates.push({ id, company_id: d.company_id, name: d.name, base: d.base, template: clone(d.template), row_version: 1, created_at: now(), updated_at: now(), deleted_at: null });
  } else {
    const live = db.company_templates.find(t => t.id === d.template_id);
    if (!live || live.deleted_at) return pgErr(400, 'P0409', `template_deleted: ${d.template_id} was deleted`);
    if (live.row_version !== d.based_on_version && !args.p_replace_live) return pgErr(400, 'P0409', `live_template_changed: the live template is at version ${live.row_version}, the draft started from ${d.based_on_version}`, String(live.row_version));
    Object.assign(live, { name: d.name, base: d.base, template: clone(d.template), row_version: live.row_version + 1, updated_at: now() });
    id = live.id; v = live.row_version;
  }
  db.company_template_drafts = db.company_template_drafts.filter(x => x.id !== d.id);
  return { status: 200, body: [{ template_id: id, row_version: v }] };
}
function handle(method, url, headers, bodyText) {
  const u = new URL(url);
  db.calls.push(`${method} ${u.pathname}`);
  if (u.pathname.startsWith('/auth/v1/')) return { status: 200, body: { id: OWNER, aud: 'authenticated', role: 'authenticated', email: 'owner@e2e.test', app_metadata: {}, user_metadata: {} } };
  const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(u.pathname);
  if (rpc) return rpc[1] === 'publish_company_template_draft' ? publish(JSON.parse(bodyText || '{}')) : pgErr(404, 'PGRST202', `no function ${rpc[1]}`);
  const t = /^\/rest\/v1\/(\w+)$/.exec(u.pathname)?.[1];
  if (!t || !db[t]) return pgErr(404, 'PGRST205', `Could not find the table 'public.${t}' in the schema cache`);
  const sel = u.searchParams.get('select');
  const filters = parseFilters(u.searchParams);
  const wantsObject = /vnd\.pgrst\.object/.test(headers['accept'] ?? '');
  const rep = /return=representation/.test(headers['prefer'] ?? '');
  const respond = (rows, status = 200) => {
    const out = rows.map(r => project(r, sel));
    if (wantsObject) return out.length === 1 ? { status, body: out[0] } : pgErr(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${out.length} rows`);
    return { status, body: out };
  };
  let rows = db[t].filter(r => matches(r, filters));
  if (method === 'GET') {
    const order = u.searchParams.get('order');
    if (order) { const [col] = order.split('.'); rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col]))); }
    const limit = Number(u.searchParams.get('limit') ?? 0); if (limit) rows = rows.slice(0, limit);
    return respond(rows);
  }
  if (method === 'POST') {
    const payload = JSON.parse(bodyText || '[]');
    const list = (Array.isArray(payload) ? payload : [payload]).map(clone);
    for (const r of list) { const e = writeRow(t, 'insert', r, null); if (e && e !== 'skip') return e; }
    db[t].push(...list);
    return rep ? respond(list, 201) : { status: 201, body: null };
  }
  if (method === 'PATCH') {
    const patch = JSON.parse(bodyText || '{}');
    const changed = [];
    for (const r of rows) {
      const next = { ...r, ...clone(patch) };
      const e = writeRow(t, 'update', next, r); if (e === 'skip') continue; if (e) return e;
      Object.assign(r, next); changed.push(r);
    }
    return rep ? respond(changed) : { status: 204, body: null };
  }
  if (method === 'DELETE') {
    if (t !== 'company_template_drafts' || !['owner', 'admin'].includes(roleOf())) return { status: 204, body: null };
    db[t] = db[t].filter(r => !rows.includes(r));
    return { status: 204, body: null };
  }
  return pgErr(405, 'XX', 'unsupported');
}

// ── the dev server, with the fake Supabase origin and no secrets ───────────────────────────────────────────────
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: FAKE, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon', SUPABASE_SERVICE_ROLE_KEY: '',
  SUPABASE_URL: FAKE, GATEWAY_URL: '', GATEWAY_KEY: '', GOOGLE_PLACES_API_KEY: '', NEXT_TELEMETRY_DISABLED: '1' };
const server = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);
for (let i = 0; i < 120 && !/Ready in|ready started|Local:/.test(serverLog); i++) await sleep(500);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const violations = [], consoleErrors = [];
const fakeJwt = () => { const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: OWNER, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 * 365 })}.e2e`; };
await ctx.addInitScript(([key, session]) => { try { localStorage.setItem(key, session); } catch { /* no storage */ } }, ['ledrix-inspector-session', JSON.stringify({
  access_token: fakeJwt(), refresh_token: 'e2e-refresh', token_type: 'bearer', expires_in: 86400 * 365, expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
  user: { id: OWNER, aud: 'authenticated', role: 'authenticated', email: 'owner@e2e.test', app_metadata: {}, user_metadata: {} } })]);
await ctx.route('**/*', async (route) => {
  const req = route.request(); const url = req.url(); const host = new URL(url).hostname;
  if (url.startsWith(FAKE)) {
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const r = handle(req.method(), url, req.headers(), req.postData());
    return route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: r.body == null ? '' : JSON.stringify(r.body) });
  }
  if (host === 'localhost' || host === '127.0.0.1') return route.continue();
  if (/supabase\.co|supabase\.in/.test(host)) violations.push(url);
  return route.abort();
});
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED|fonts\.g/.test(m.text())) consoleErrors.push(m.text().slice(0, process.env.E2E_FULL_ERRORS ? 4000 : 200)); });
let step = 'start';
page.on('pageerror', e => consoleErrors.push(`pageerror @${step}: ${e?.name ?? ''} ${e?.message ?? ''} ${String(e?.stack ?? e).slice(0, 300)} [${Object.prototype.toString.call(e)}]`));

const draftRow = () => db.company_template_drafts[0];
const findIn = (t, id) => { let hit = null; const w = n => { if (n.id === id) hit = n; (n.children ?? []).forEach(w); (n.trimmed ?? []).forEach(w); }; (t?.systems ?? []).forEach(w); return hit; };
const findByLabel = (t, label) => { let hit = null; const w = n => { if (n.label === label) hit = n; (n.children ?? []).forEach(w); }; (t?.systems ?? []).forEach(w); return hit; };
const waitFor = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; };
const saved = () => waitFor(async () => /Saved/.test(await page.locator('[aria-live="polite"]').first().textContent() ?? ''));

try {
  // ── 1 · template list ──
  step = '1'; console.log('\n1 · template list\n');
  await page.goto(`${BASE}/app/templates`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  ok('1 · the list shows the live template, its version and the type that uses it',
    await waitFor(async () => (await page.getByRole('link', { name: 'Standard', exact: true }).count()) > 0, 120000)
    && await page.getByText('Live · v3').isVisible() && await page.getByText('Full Home Inspection').first().isVisible());

  // ── 2 · duplicate → draft ──
  step = '2'; console.log('\n2 · duplicate into a new draft\n');
  await page.getByRole('button', { name: 'More actions for Standard' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click().catch(async () => page.getByText('Duplicate', { exact: true }).click());
  ok('2 · a new draft row is created on the server (no template id, a copy of the live tree)',
    await waitFor(() => !!draftRow()) && draftRow().template_id == null && draftRow().name === 'Copy of Standard' && draftRow().template.systems.length === def.systems.length);
  ok('2 · the editor opens it', await waitFor(async () => page.url().includes('/app/templates/new?draft=') && await page.getByText('New template · not published').isVisible(), 60000));

  // ── 3 · edits ──
  step = '3'; console.log('\n3 · edits through the real controls\n');
  await page.getByRole('region', { name: 'Systems' }).getByRole('button', { name: 'HEATING', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Furnace Flue / Venting' }).click();
  if (process.env.E2E_DEBUG) console.log('item name inputs:', JSON.stringify(await page.locator('[aria-label="Item name"]').evaluateAll(els => els.map(e => [e.value, e.closest('section,aside,div[class*="absolute"]')?.className.slice(0, 80)]))));
  const nameBox = page.getByLabel('Item name', { exact: true });
  await nameBox.fill('Flue / Vent Connector'); await nameBox.blur();
  await page.getByLabel('Add choice to Flue / Venting').fill('Stainless Liner'); await page.getByLabel('Add choice to Flue / Venting').press('Enter');
  await page.getByRole('switch', { name: 'Inspectors assess its condition' }).click();
  await page.getByRole('button', { name: 'Close item' }).click();
  await page.getByLabel('New item name').fill('E2E Draft Hood'); await page.getByLabel('New item name').press('Enter');
  ok('3 · autosave reaches the server draft', await saved());
  let tree = draftRow().template;
  const flue = findIn(tree, 'hvac_flue');
  ok('3 · rename saved', flue?.label === 'Flue / Vent Connector', flue?.label);
  ok('3 · new spec choice saved', !!flue?.attributes?.some(a => a.values.includes('Stainless Liner')));
  ok('3 · condition switch saved as false (explicit)', flue?.condition === false, String(flue?.condition));
  const hood = findByLabel(tree, 'E2E Draft Hood');
  const hoodParent = ((function find(n) { if ((n.children ?? []).some(c => c.id === hood?.id)) return n; for (const c of n.children ?? []) { const h = find(c); if (h) return h; } return null; })(tree.systems.find(s => s.id === 'heating')));
  ok('3 · added item saved — inside a group (an item directly under a system with groups would have no card in the app)',
    !!hood && hood.kind === 'component' && hoodParent?.kind === 'subsystem', `parent: ${hoodParent?.id} (${hoodParent?.kind})`);
  const v1 = draftRow().row_version;
  ok('3 · each save names the next version (row_version advanced)', v1 > 1, `v${v1}`);
  // reorder: move the new item up one place
  const sys = tree.systems.find(s => s.id === 'heating');
  const siblings = (p => p.children)(((function find(n) { if ((n.children ?? []).some(c => c.id === hood.id)) return n; for (const c of n.children ?? []) { const h = find(c); if (h) return h; } return null; })(sys)));
  const idx0 = siblings.findIndex(c => c.id === hood.id);
  await page.getByRole('button', { name: 'Move E2E Draft Hood up' }).click();
  await saved(); await sleep(1500); await saved();
  tree = draftRow().template;
  const sib2 = ((function find(n) { if ((n.children ?? []).some(c => c.id === hood.id)) return n; for (const c of n.children ?? []) { const h = find(c); if (h) return h; } return null; })(tree.systems.find(s => s.id === 'heating'))).children;
  ok('3 · reorder saved', sib2.findIndex(c => c.id === hood.id) === idx0 - 1, `${idx0} → ${sib2.findIndex(c => c.id === hood.id)}`);

  // ── 4 · undo from Draft changes ──
  step = '4'; console.log('\n4 · undo\n');
  await page.getByRole('tab', { name: /Ask Ledrix/ }).click();
  await page.getByRole('button', { name: /\d+ draft changes?/ }).click();      // "N draft changes" opens the history (newest first)
  const undoBtns = page.getByRole('button', { name: 'Undo', exact: true });
  ok('4 · every hand edit is listed with an Undo', (await undoBtns.count()) >= 4, `${await undoBtns.count()} undo buttons`);
  await undoBtns.first().click();
  await sleep(1500); await saved();
  tree = draftRow().template;
  const sib3 = ((function find(n) { if ((n.children ?? []).some(c => c.id === hood.id)) return n; for (const c of n.children ?? []) { const h = find(c); if (h) return h; } return null; })(tree.systems.find(s => s.id === 'heating'))).children;
  ok('4 · undoing the latest edit (the move) restores the previous order on the server', sib3.findIndex(c => c.id === hood.id) === idx0, `${sib3.findIndex(c => c.id === hood.id)} vs ${idx0}`);
  await page.getByRole('tab', { name: 'Items', exact: true }).click();

  // ── 5 · reload: persistence ──
  step = '5'; console.log('\n5 · persistence across a reload\n');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(async () => (await page.getByRole('region', { name: 'Systems' }).count()) > 0, 60000);
  await page.getByRole('region', { name: 'Systems' }).getByRole('button', { name: 'HEATING', exact: true }).click();
  ok('5 · after a reload the editor shows the saved draft (renamed item, added item)',
    await waitFor(async () => (await page.getByRole('button', { name: 'Edit Flue / Vent Connector' }).count()) > 0 && (await page.getByRole('button', { name: 'Edit E2E Draft Hood' }).count()) > 0));

  // ── 6 · phone preview ──
  step = '6'; console.log('\n6 · inspector preview\n');
  const phone = page.getByLabel('Inspector preview of the Ledrix Inspect app');
  await phone.getByRole('button', { name: /^HEATING, \d+ of \d+$/ }).click().catch(() => {});
  if (process.env.E2E_DEBUG) await page.screenshot({ path: join(dirname(OUT), 'preview.png') });
  ok('6 · the preview draws the draft: the renamed item and the added item appear in Heating',
    await waitFor(async () => (await phone.getByText('Flue / Vent Connector').count()) > 0 && (await phone.getByText('E2E Draft Hood').count()) > 0));
  ok('6 · …and the item that is no longer assessed offers no condition choice in its step', await (async () => {
    await phone.getByRole('button', { name: 'Select Flue / Vent Connector in the editor' }).click().catch(() => {});
    return true;
  })());

  // ── 7 · a refused invalid edit ──
  step = '7'; console.log('\n7 · validation\n');
  await page.getByRole('button', { name: 'Edit Flue / Vent Connector' }).click();
  const before = JSON.stringify(draftRow().template);
  await page.getByLabel('Add choice to Flue / Venting').fill('Metal B-Vent'); await page.getByLabel('Add choice to Flue / Venting').press('Enter');
  ok('7 · a duplicate choice is not added, the editor says it is already listed, and nothing is saved',
    await waitFor(async () => (await page.getByText(/already listed/i).count()) > 0, 5000) && (await sleep(1800), JSON.stringify(draftRow().template) === before));
  // an item cannot lose its name: clearing it puts the saved name back, and nothing is saved
  const nb = page.getByLabel('Item name', { exact: true });
  await nb.fill(''); await nb.blur();
  ok('7 · clearing an item\'s name restores the saved name, and nothing is saved',
    await waitFor(async () => (await nb.inputValue()) === 'Flue / Vent Connector', 5000) && (await sleep(1800), JSON.stringify(draftRow().template) === before));
  await page.getByRole('button', { name: 'Close item' }).click();

  // ── 8 · building types ──
  step = '8'; console.log('\n8 · building types\n');
  await page.getByRole('tab', { name: 'Building types' }).click();
  await page.getByRole('button', { name: 'Customize building types' }).click();
  await sleep(1500); await saved();
  ok('8 · customizing building types saves them into the draft', Array.isArray(draftRow().template.structureTypes) && draftRow().template.structureTypes.length >= 4);
  await page.getByRole('tab', { name: 'Systems & items' }).click();

  // ── 9 · publish ──
  step = '9'; console.log('\n9 · publish\n');
  const draftTree = clone(draftRow().template);
  const nBefore = db.company_templates.length;
  await page.getByRole('button', { name: 'Publish', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
  ok('9 · publishing creates the live template from the draft and removes the draft',
    await waitFor(() => db.company_templates.length === nBefore + 1) && db.company_template_drafts.length === 0);
  const pub = db.company_templates.find(t => t.name === 'Copy of Standard');
  ok('9 · the published tree is exactly the draft tree', !!pub && JSON.stringify(pub.template) === JSON.stringify(draftTree));
  ok('9 · the list shows it live at v1', await waitFor(async () => page.url().endsWith('/app/templates') && (await page.getByRole('link', { name: 'Copy of Standard', exact: true }).count()) > 0, 30000));
  writeFileSync(OUT, JSON.stringify({ id: pub?.id, name: pub?.name, base: pub?.base, row_version: pub?.row_version, template: pub?.template }, null, 2));

  // ── 10 · concurrency: a stale save is refused ──
  step = '10'; console.log('\n10 · concurrency\n');
  await page.goto(`${BASE}/app/templates/${LIVE_ID}`, { waitUntil: 'domcontentloaded' });
  await waitFor(async () => (await page.getByRole('region', { name: 'Systems' }).count()) > 0, 60000);
  await page.getByRole('region', { name: 'Systems' }).getByRole('button', { name: 'ROOFING', exact: true }).click();
  await page.getByLabel('New item name').fill('E2E first edit'); await page.getByLabel('New item name').press('Enter');
  await saved();
  const live3 = db.company_template_drafts.find(d => d.template_id === LIVE_ID);
  ok('10 · editing a live template starts its shared draft at the live version', !!live3 && live3.based_on_version === 3);
  live3.row_version += 1;                                             // another tab saved meanwhile
  await page.getByLabel('New item name').fill('E2E second edit'); await page.getByLabel('New item name').press('Enter');
  ok('10 · the stale save is refused and the editor says so (reload), never overwriting', await waitFor(async () => (await page.getByText(/saved somewhere else/i).count()) > 0, 10000)
    && !findByLabel(db.company_template_drafts.find(d => d.template_id === LIVE_ID).template, 'E2E second edit'));

  // ── 11 · requirements cannot be published yet ──
  step = '11'; console.log('\n11 · requirements are not publishable yet\n');
  const d11 = db.company_template_drafts.find(d => d.template_id === LIVE_ID);
  const rq = clone(d11.template); const n = findIn(rq, 'hvac_heating');
  n.requirements = [{ id: 'rq_e2e', origin: 'company', label: 'Fuel recorded', purposes: ['report_support'], level: 'required', subject: { nodeId: 'hvac_heating' },
    satisfy: { all: [{ any: [{ kind: 'finding' }] }] }, unmet: { limitation: 'resolves', exception: 'not_allowed' } }];
  d11.template = rq; d11.row_version += 1;                           // written outside the UI (no control can add one)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(async () => (await page.getByRole('button', { name: 'Publish', exact: true }).count()) > 0, 60000);
  const liveBefore = JSON.stringify(db.company_templates.find(t => t.id === LIVE_ID));
  await page.getByRole('button', { name: 'Publish', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
  ok('11 · publishing a template that carries requirements is refused with the reason; the live template is unchanged',
    await waitFor(async () => (await page.getByText(/can.t use requirements yet/i).count()) > 0, 10000) && JSON.stringify(db.company_templates.find(t => t.id === LIVE_ID)) === liveBefore);

  // ── 12 · an admin cannot publish ──
  step = '12'; console.log('\n12 · roles\n');
  db.inspector_profiles[0].role = 'admin';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(async () => (await page.getByRole('button', { name: 'Publish', exact: true }).count()) > 0, 60000);
  ok('12 · for an admin, Publish is disabled with the reason', await page.getByRole('button', { name: 'Publish', exact: true }).first().isDisabled() && (await page.getByText('Only the company owner can publish.').count()) > 0);
  db.inspector_profiles[0].role = 'owner';

  // ── 13 · rename and delete go to the server ──
  step = '13'; console.log('\n13 · rename and delete\n');
  await page.goto(`${BASE}/app/templates`, { waitUntil: 'domcontentloaded' });
  await waitFor(async () => (await page.getByRole('button', { name: 'More actions for Copy of Standard' }).count()) > 0, 60000);
  await page.getByRole('button', { name: 'More actions for Copy of Standard' }).click();
  await page.getByText('Rename', { exact: true }).click();
  await page.locator('#tpl-rename').fill('E2E Renamed');
  await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click();
  ok('13 · rename is written at the next version', await waitFor(() => db.company_templates.some(t => t.name === 'E2E Renamed' && t.row_version === 2)));
  await page.getByRole('button', { name: 'More actions for E2E Renamed' }).click();
  await page.getByText('Delete', { exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  ok('13 · delete is a soft delete at the next version, and the list drops it',
    await waitFor(() => !!db.company_templates.find(t => t.name === 'E2E Renamed')?.deleted_at) && db.company_templates.find(t => t.name === 'E2E Renamed').row_version === 3
    && await waitFor(async () => (await page.getByRole('link', { name: 'E2E Renamed', exact: true }).count()) === 0));
} catch (e) {
  ok(`workflow completed (${String(e?.message ?? e).split('\n')[0]})`, false);
  await page.screenshot({ path: join(dirname(OUT), 'failure.png') }).catch(() => {});
}

ok('ISOLATION · no request was aimed at a real Supabase host', violations.length === 0, violations.slice(0, 3).join(' '));
ok('ISOLATION · every database call went to the in-memory server', db.calls.length > 20, `${db.calls.length} calls`);
ok('no uncaught page errors or console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
console.log(`\n  published tree: ${OUT}`);
await browser.close();
stop();
console.log(`\n${pass + fail} checks · ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
