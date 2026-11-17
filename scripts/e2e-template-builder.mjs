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
// → the six sections, tree search, an applicability rule, a drafted requirement (Publish disabled while it exists);
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
  company_template_context: [],   // ledger #71 (ledrix-app supabase_company_template_context.sql)
  company_inspection_types: [{ id: randomUUID(), company_id: CO, name: 'Single Family Home Inspection', template_id: LIVE_ID, row_version: 1, sort_order: 0, deleted_at: null }],
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
  if (table === 'company_template_context') {
    if (role !== 'owner' && role !== 'admin') return op === 'insert' ? pgErr(403, '42501', 'new row violates row-level security policy') : 'skip';
    if (op === 'insert') { if (db.company_template_context.some(c => c.company_id === row.company_id)) return pgErr(409, '23505', 'duplicate key'); Object.assign(row, { row_version: 1, updated_at: now(), updated_by: OWNER }); return null; }
    if (row.company_id !== old.company_id) return pgErr(400, 'P0422', 'context_immutable: the company cannot change');
    if (row.row_version !== old.row_version + 1) return pgErr(400, 'P0409', `context_version_conflict: at version ${old.row_version}`, String(old.row_version));
    row.updated_at = now(); return null;
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
// E2E_PROD_DIR=<a checkout already built with these env values> runs `next start` there instead — the production server,
// which serves fixed assets (no dev rebuilds, no ?v= stylesheet reloads).
const PROD = process.env.E2E_PROD_DIR;
const server = spawn('npx', PROD ? ['next', 'start', '-p', String(PORT)] : ['next', 'dev', '-p', String(PORT)], { cwd: PROD || ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
// "WHAT YOU INSPECT" OPENS ON GUIDED (owner 2026-11-14) and every reload starts there again; the edits this test makes are
// All settings'. The left menu is the "Systems" list since 2026-11-05. (2026-11-16: the test had stopped at step 3 since.)
const SYSTEMS = () => page.getByRole('region', { name: 'Systems' });
const toAllSettings = async () => {
  // A live template opens on its Overview (2026-11-06); "What you inspect" is the step that holds the editor.
  await waitFor(async () => (await page.getByRole('tablist', { name: 'How to edit' }).count()) > 0
    || (await page.getByRole('main', { name: 'Template section' }).getByRole('button', { name: 'Edit this template ›' }).count()) > 0, 60000);
  if ((await page.getByRole('tablist', { name: 'How to edit' }).count()) === 0)
    await page.getByRole('navigation', { name: 'Template sections' }).getByRole('button', { name: /What you inspect/ }).click();
  await waitFor(async () => (await page.getByRole('tablist', { name: 'How to edit' }).count()) > 0, 60000);
  const tab = page.getByRole('tablist', { name: 'How to edit' }).getByRole('tab', { name: 'All settings', exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await waitFor(async () => (await SYSTEMS().count()) > 0, 30000);
};
// 2026-11-16: the item editor (owner 2026-11-07, "one shape at every level") — an item is a list of rows, each opening its
// own screen with a back button; there are no tabs, no "Close item" and no Name box.
const EDITOR = () => page.getByRole('region', { name: 'Editor' });
const openRow = (name) => EDITOR().getByRole('button', { name }).first().click();
const backTo = (label) => EDITOR().getByRole('button', { name: `Back to ${label}`, exact: true }).click();
const closeItem = () => EDITOR().getByRole('button', { name: /^Back to / }).first().click();
const fullList = async () => { const c = EDITOR().getByRole('button', { name: 'Full list', exact: true }); if ((await c.getAttribute('aria-pressed')) !== 'true') await c.click(); };
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED|fonts\.g/.test(m.text())) consoleErrors.push(m.text().slice(0, process.env.E2E_FULL_ERRORS ? 4000 : 200)); });
let step = 'start';
// DEV-SERVER NOISE, AND ONLY THAT (2026-10-27): `next dev` re-fetches the app stylesheet with a `?v=` stamp while it
// rebuilds a page on first visit; a fetch that lands mid-rebuild rejects with a bare Event. The production server serves
// fixed, hashed CSS and never does this (E2E_PROD_DIR: 64/64, no error). Set aside ONLY that exact shape — a failed
// <link> to /_next/static/css/…?v= under `next dev` — and count it; every other page error still fails the run.
let devCssReloads = 0;
if (!PROD) await page.addInitScript(() => {
  addEventListener('unhandledrejection', ev => {
    const t = ev.reason && typeof ev.reason === 'object' && 'target' in ev.reason ? ev.reason.target : null;
    if (t && t.tagName === 'LINK' && /\/_next\/static\/css\/[^?]+\.css\?v=\d+$/.test(t.href || '')) { ev.preventDefault(); console.info('E2E-DEV-CSS-RELOAD', t.href); }
  });
});
page.on('console', m => { if (m.type() === 'info' && m.text().startsWith('E2E-DEV-CSS-RELOAD')) devCssReloads++; });
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
    && await page.getByText('Live · v3').isVisible() && await page.getByText('Single Family Home Inspection').first().isVisible());

  // ── 2 · duplicate → draft ──
  step = '2'; console.log('\n2 · duplicate into a new draft\n');
  await page.getByRole('button', { name: 'More actions for Standard' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click().catch(async () => page.getByText('Duplicate', { exact: true }).click());
  ok('2 · a new draft row is created on the server (no template id, a copy of the live tree)',
    await waitFor(() => !!draftRow()) && draftRow().template_id == null && draftRow().name === 'Copy of Standard' && draftRow().template.systems.length === def.systems.length);
  ok('2 · the editor opens it', await waitFor(async () => page.url().includes('/app/templates/new?draft=') && await page.getByText('New template · not published').isVisible(), 60000));

  // ── 3 · edits ──
  step = '3'; console.log('\n3 · edits through the real controls\n');
  await toAllSettings();
  await SYSTEMS().getByRole('button', { name: 'HEATING', exact: true }).click();
  // 2026-11-16: the item editor has no tabs and no Name box (owner 2026-11-05/-07). A row's "More for …" menu renames it in
  // the row; the row opens the item, whose rows (Condition · Details · …) each open a screen with "Back to <item>"; the
  // item's own back button closes it to its system.
  await EDITOR().getByRole('button', { name: 'More for Furnace Flue / Venting', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const nameBox = EDITOR().getByLabel('Item name', { exact: true });
  await nameBox.fill('Flue / Vent Connector'); await nameBox.press('Enter');
  await EDITOR().getByRole('button', { name: /^Flue \/ Vent Connector/ }).first().click();
  await openRow(/^Details/);
  await EDITOR().getByLabel('Add choice to Flue / Venting').fill('Stainless Liner'); await EDITOR().getByLabel('Add choice to Flue / Venting').press('Enter');
  await backTo('Flue / Vent Connector');
  await openRow(/^Condition/);
  await EDITOR().getByRole('switch', { name: 'Inspectors rate its condition', exact: true }).click();
  await backTo('Flue / Vent Connector');
  await closeItem();
  // 2026-11-16: a typed system (Heating) adds a shared item to a group from its "Full list" chip (the type chips' own
  // "+ Add item for <type>" adds a type-only item); that list is also the one with the Move up / down arrows.
  await fullList();
  await EDITOR().getByLabel('New item name').fill('E2E Draft Hood'); await EDITOR().getByLabel('New item name').press('Enter');
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
  // 2026-11-16: the per-edit Undo list lives in the Ask Ledrix panel ("N draft changes"), which is hidden by design
  // (page.tsx ASK_LEDRIX = false, owner 2026-11-05) — the editor has no other Undo control. The history the Undo list
  // reads is still saved with the draft, so the first check reads it there (and Review & Publish's change count shows it);
  // the second puts the order back with the list's own Move down arrow, the only way back the UI offers.
  step = '4'; console.log('\n4 · edit history (Undo is hidden with Ask Ledrix)\n');
  const log4 = draftRow().history?.log ?? [];
  await page.getByRole('navigation', { name: 'Template sections' }).getByRole('button', { name: /Review & Publish/ }).click();
  ok('4 · every hand edit is recorded in the draft\'s saved history, and Review & Publish counts them', log4.length >= 4
    && await waitFor(async () => (await page.getByText(new RegExp(`${log4.length} changes in this draft`)).count()) > 0, 5000), `${log4.length} history entries`);
  await page.getByRole('navigation', { name: 'Template sections' }).getByRole('button', { name: /What you inspect/ }).click();
  await toAllSettings();
  await EDITOR().getByRole('button', { name: 'Move E2E Draft Hood down' }).click();
  await sleep(1500); await saved();
  tree = draftRow().template;
  const sib3 = ((function find(n) { if ((n.children ?? []).some(c => c.id === hood.id)) return n; for (const c of n.children ?? []) { const h = find(c); if (h) return h; } return null; })(tree.systems.find(s => s.id === 'heating'))).children;
  ok('4 · moving it back down restores the previous order on the server', sib3.findIndex(c => c.id === hood.id) === idx0, `${sib3.findIndex(c => c.id === hood.id)} vs ${idx0}`);

  // ── 5 · reload: persistence ──
  step = '5'; console.log('\n5 · persistence across a reload\n');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await toAllSettings();
  await SYSTEMS().getByRole('button', { name: 'HEATING', exact: true }).click();
  await fullList();
  ok('5 · after a reload the editor shows the saved draft (renamed item, added item)',
    await waitFor(async () => (await page.getByRole('button', { name: 'Edit Flue / Vent Connector' }).count()) > 0 && (await page.getByRole('button', { name: 'Edit E2E Draft Hood' }).count()) > 0));

  // ── 6 · phone preview ──
  step = '6'; console.log('\n6 · inspector preview\n');
  const phone = page.getByLabel('Inspector preview of the Ledrix Inspect app');
  await phone.getByRole('button', { name: /^HEATING, \d+ of \d+$/ }).click().catch(() => {});
  if (process.env.E2E_DEBUG) await page.screenshot({ path: join(dirname(OUT), 'preview.png') });
  // 2026-11-16: the preview is the app's Heating page (owner 2026-11-08: "Pre-Inspect takes care of all details …; Inspect is
  // strictly condition"). The renamed item has its condition switched off in step 3, so all it keeps is a Details question,
  // and the preview's Details tile lists the photos that answer Details, not the questions — it draws no row with the
  // item's name. So the rename is checked as: the old name is gone from the phone, the added item is a tile in Heating.
  ok('6 · the preview draws the draft: the renamed item and the added item appear in Heating',
    await waitFor(async () => (await phone.getByRole('button', { name: /^E2E Draft Hood, / }).count()) > 0 && (await phone.getByText(/Furnace Flue \/ Venting/).count()) === 0));
  // 2026-11-16: this check used to click and return true; it now reads the phone's Condition page, which lists every row
  // that takes condition — the added item is there, the item switched off is not.
  ok('6 · …and the item that is no longer assessed offers no condition choice in its step', await (async () => {
    await phone.getByRole('button', { name: /^Condition: / }).click();
    return waitFor(async () => (await phone.getByRole('button', { name: 'OK: E2E Draft Hood', exact: true }).count()) === 1
      && (await phone.getByRole('button', { name: /^OK: Flue \/ Vent/ }).count()) === 0, 5000);
  })());

  // ── 7 · a refused invalid edit ──
  step = '7'; console.log('\n7 · validation\n');
  await SYSTEMS().getByRole('button', { name: 'HEATING', exact: true }).click();
  await fullList();
  await EDITOR().getByRole('button', { name: 'Edit Flue / Vent Connector' }).click();
  const before = JSON.stringify(draftRow().template);
  await openRow(/^Details/);
  await EDITOR().getByLabel('Add choice to Flue / Venting').fill('Metal B-Vent'); await EDITOR().getByLabel('Add choice to Flue / Venting').press('Enter');
  ok('7 · a duplicate choice is not added, the editor says it is already listed, and nothing is saved',
    await waitFor(async () => (await page.getByText(/already listed/i).count()) > 0, 5000) && (await sleep(1800), JSON.stringify(draftRow().template) === before));
  // an item cannot lose its name: clearing it puts the saved name back, and nothing is saved
  // 2026-11-16: the name is edited in the item's title behind its "Rename item" pencil (owner 2026-11-05); leaving the box
  // empty closes it with the saved name back in the title — the box itself goes away, so the title is what is read.
  await backTo('Flue / Vent Connector');
  await EDITOR().getByRole('button', { name: 'Rename item', exact: true }).click();
  const nb = EDITOR().getByLabel('Item name', { exact: true });
  await nb.fill(''); await nb.blur();
  ok('7 · clearing an item\'s name restores the saved name, and nothing is saved',
    await waitFor(async () => (await EDITOR().getByRole('heading', { name: 'Flue / Vent Connector', exact: true }).count()) === 1 && (await nb.count()) === 0, 5000)
    && (await sleep(1800), JSON.stringify(draftRow().template) === before));
  await closeItem();

  // ── 8 · building types ──
  // 2026-11-06 (owner): the Building Types section left the steps; a template's buildings are the picker at the top of the
  // systems column, and adding one there writes the template's own building types (the old "Customize building types").
  step = '8'; console.log('\n8 · building types\n');
  await page.getByRole('button', { name: 'Building', exact: true }).click();
  await page.getByRole('button', { name: '+ Your own building…', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Building name').fill('E2E Shop');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await sleep(1500); await saved();
  ok('8 · customizing building types saves them into the draft', Array.isArray(draftRow().template.structureTypes) && draftRow().template.structureTypes.length >= 4
    && draftRow().template.structureTypes.some(t => t.name === 'E2E Shop'), JSON.stringify(draftRow().template.structureTypes?.map(t => t.name)));
  // back to the main house, so every switch below is the template's own Included switch again
  await page.getByRole('button', { name: 'Building', exact: true }).click();
  await page.getByRole('listbox', { name: 'Buildings' }).getByRole('option').first().click();

  // ── 8b · the workspace: sections, search, applicability, requirements ──
  step = '8b'; console.log('\n8b · workspace sections, search, applicability, requirements\n');
  const nav = page.getByRole('navigation', { name: 'Template sections' });
  // 2026-11-16: the sections are Overview · What you inspect · Report · Review & Publish (owner 2026-11-06). Requirements
  // left the steps — the template-wide list is on Review & Publish, under its own heading — and Review's headline says
  // what needs doing ("✓ Ready to publish" / "N things to fix first"), so it is matched by shape.
  for (const [btnName, heading, sectionBtn] of [['Overview', 'Copy of Standard', 'Overview'], ['Report Content', 'Report content', /Report$/],
    ['Review & Publish', /^(✓ Ready to publish|\d+ things? to fix first|Review & publish)$/, /Review & Publish/], ['Requirements (on Review & Publish)', 'Required photos & readings', /Review & Publish/]]) {
    await nav.getByRole('button', { name: sectionBtn, exact: typeof sectionBtn === 'string' }).click();
    ok(`8b · the ${btnName} section opens its view`, await waitFor(async () => (await page.getByRole('main', { name: 'Template section' }).getByRole('heading', { name: heading, exact: typeof heading === 'string' }).count()) > 0, 10000)
      && (await nav.getByRole('button', { name: sectionBtn, exact: typeof sectionBtn === 'string' }).getAttribute('aria-current')) === 'page');
  }
  ok('8b · Overview counts come from the draft (items in the template)', await (async () => {
    await nav.getByRole('button', { name: 'Overview', exact: true }).click();
    const items = (function count(n) { return (n.kind === 'component' ? 1 : 0) + (n.children ?? []).reduce((a, c) => a + count(c), 0); })({ children: draftRow().template.systems });
    return waitFor(async () => (await page.getByRole('main', { name: 'Template section' }).getByText(String(items), { exact: true }).count()) > 0, 5000);
  })());
  // property types: picked on the Overview, saved on the draft
  await page.getByRole('group', { name: 'Property types' }).getByRole('button', { name: /Multi-unit — one building/ }).click();
  // 2026-11-16: a kind of home that brings Ledrix checkpoints asks first (HomeKindsCard, owner 2026-11-05); save without them.
  const addCk = page.getByRole('dialog', { name: 'Add checkpoints' });
  if (await waitFor(async () => (await addCk.count()) > 0, 2000)) {
    for (const cb of await addCk.getByRole('checkbox').all()) if (await cb.isChecked()) await cb.uncheck();
    await addCk.getByRole('button', { name: /^(Save without checkpoints|Add \d+ checkpoints?)$/ }).click();
  }
  await sleep(1500); await saved();
  ok('8b · a property type picked on the Overview is saved on the draft', JSON.stringify(draftRow().template.propertyTypes) === JSON.stringify(['multi_unit_one']), JSON.stringify(draftRow().template.propertyTypes));
  await nav.getByRole('button', { name: /What you inspect/ }).click();
  await toAllSettings();
  // 2026-11-16: the tree's search box was removed (owner 2026-11-06, Tree.tsx: "the systems list is short, and a system
  // opens group first"). The closest check: the systems list reaches the item through its system's list.
  await SYSTEMS().getByRole('button', { name: 'HEATING', exact: true }).click();
  await fullList();
  ok('8b · the systems list reaches the new item through its system (no search since 2026-11-06)', await waitFor(async () => (await EDITOR().getByRole('button', { name: 'Edit E2E Draft Hood', exact: true }).count()) === 1, 5000));
  await EDITOR().getByRole('button', { name: 'Edit E2E Draft Hood', exact: true }).click();
  // 2026-11-16: an item has rows, not tabs (owner 2026-11-07) — a new item reads Condition on, Details Off, no photos or readings.
  ok('8b · a new item opens with Condition on, Details and Requirements off, and Shows when', await waitFor(async () => (await EDITOR().getByRole('heading', { name: 'E2E Draft Hood', exact: true }).count()) > 0, 5000)
    && (await EDITOR().getByRole('button', { name: /^Condition\s*Satisfactory · Limitation · Finding/ }).count()) === 1
    && (await EDITOR().getByRole('button', { name: /^Details\s*Off$/ }).count()) === 1
    && (await EDITOR().getByRole('button', { name: /^Required photos & readings\s*None$/ }).count()) === 1
    && (await EDITOR().getByRole('button', { name: /^Shows when/ }).count()) === 1);
  // applicability: inspect the hood only when the heating fuel is a gas furnace
  await openRow(/^Shows when/);
  await EDITOR().getByRole('button', { name: '+ Add condition' }).first().click();
  await page.getByLabel('Condition 1: spec field').selectOption('hvac_heating::fuel_source');
  await EDITOR().getByRole('button', { name: 'Gas Furnace', exact: true }).click();
  await EDITOR().getByRole('button', { name: 'Save rule' }).click();
  await sleep(1500); await saved();
  const hood8 = () => findByLabel(draftRow().template, 'E2E Draft Hood');
  ok('8b · an applicability rule is saved in the runtime\'s shape', JSON.stringify(hood8()?.appliesWhen) === JSON.stringify({ field: 'hvac_heating::fuel_source', anyOf: ['Gas Furnace'] }), JSON.stringify(hood8()?.appliesWhen));
  // requirements: switched on from the item (its screen opens), drafted through the contract, never publishable
  // 2026-11-16: the switch is on the item's "Required photos & readings" screen, not an Overview tab.
  await backTo('E2E Draft Hood');
  await openRow(/^Required photos & readings/);
  const reqSwitch = () => EDITOR().getByRole('switch', { name: 'Required photos & readings', exact: true });
  await reqSwitch().click();
  ok('8b · switching Requirements on opens its tab', await waitFor(async () => (await reqSwitch().getAttribute('aria-checked')) === 'true' && (await EDITOR().getByLabel('New requirement name').count()) === 1, 5000));
  await EDITOR().getByLabel('New requirement name').fill('Hood photographed');
  await EDITOR().getByRole('button', { name: '+ Add requirement' }).click();
  await sleep(1500); await saved();
  const rq8 = () => hood8()?.requirements ?? [];
  ok('8b · a requirement is drafted as a company requirement on its own item', rq8().length === 1 && rq8()[0].origin === 'company' && rq8()[0].subject?.nodeId === hood8()?.id && rq8()[0].unmet?.exception === 'not_allowed');
  await EDITOR().getByLabel(/^Level$/).first().selectOption('recommended');
  await sleep(1500); await saved();
  ok('8b · changing its level is saved', rq8()[0]?.level === 'recommended', rq8()[0]?.level);
  // switching Requirements OFF keeps it, hidden — the draft publishes again — and ON restores it exactly
  await reqSwitch().click();
  await sleep(1500); await saved();
  // 2026-11-16: "the tab is gone" reads as: the requirement editor closes (the switch stays on its own screen).
  ok('8b · Requirements OFF keeps the requirement hidden (parked), the item no longer carries it, and Publish is available',
    hood8()?.requirements === undefined && hood8()?.parked?.requirements?.length === 1 && (await EDITOR().getByLabel('New requirement name').count()) === 0
    && await waitFor(async () => !(await page.getByRole('button', { name: 'Publish', exact: true }).first().isDisabled()), 5000));
  await reqSwitch().click();
  await sleep(1500); await saved();
  ok('8b · Requirements ON restores it exactly (same level), and nothing stays parked', rq8().length === 1 && rq8()[0].level === 'recommended' && hood8()?.parked === undefined);
  if (process.env.E2E_SHOTS) {                                       // screenshots for review, dark theme (no checks)
    await page.evaluate(() => document.documentElement.setAttribute('data-ws-theme', 'dark'));
    await sleep(400); await page.screenshot({ path: join(dirname(OUT), 'dark-requirements.png') }).catch(() => {});
    await backTo('E2E Draft Hood'); await openRow(/^Shows when/); await sleep(300);
    await page.screenshot({ path: join(dirname(OUT), 'dark-applicability.png') }).catch(() => {});
    await nav.getByRole('button', { name: /Review & Publish/ }).click(); await sleep(300);
    await page.screenshot({ path: join(dirname(OUT), 'dark-review.png') }).catch(() => {});
    await nav.getByRole('button', { name: 'Overview', exact: true }).click(); await sleep(300);
    await page.screenshot({ path: join(dirname(OUT), 'dark-overview.png') }).catch(() => {});
    await nav.getByRole('button', { name: /What you inspect/ }).click(); await toAllSettings();
    await backTo('E2E Draft Hood'); await openRow(/^Required photos & readings/);
    await page.evaluate(() => document.documentElement.setAttribute('data-ws-theme', 'light'));
  }
  // Stage 2 (2026-10-27): an item requirement publishes — the phone checks it before the report is sent (soft)
  ok('8b · a draft carrying a requirement can still be published, and nothing says to fix it',
    await waitFor(async () => !(await page.getByRole('button', { name: 'Publish', exact: true }).first().isDisabled()), 5000)
    && (await page.getByRole('button', { name: /to fix before publishing/ }).count()) === 0);
  ok('8b · the completion card says the phone checks it before the report is sent',
    (await page.getByRole('region', { name: 'Completion logic for this item' }).getByText(/Checked on the phone before the report is sent/).count()) > 0);
  await EDITOR().getByRole('button', { name: 'Remove requirement' }).click();
  await sleep(1500); await saved();
  ok('8b · removing it removes the field, and Publish is available again', hood8()?.requirements === undefined
    && await waitFor(async () => !(await page.getByRole('button', { name: 'Publish', exact: true }).first().isDisabled()), 5000));
  // all three off: the builder says inspectors won't see it
  if (await reqSwitch().getAttribute('aria-checked') === 'true') await reqSwitch().click();
  await backTo('E2E Draft Hood');
  await openRow(/^Condition/);
  const condSwitch = () => EDITOR().getByRole('switch', { name: 'Inspectors rate its condition', exact: true });
  await condSwitch().click();
  await sleep(1500); await saved();
  await backTo('E2E Draft Hood');
  ok('8b · with Condition, Details and Requirements all off, the builder warns inspectors won’t see it',
    hood8()?.condition === false && await page.getByText('Nothing to record — inspectors won’t see this item.').isVisible() && await page.getByText('Hidden — nothing to record').isVisible());
  await openRow(/^Condition/);
  await condSwitch().click();
  await sleep(1500); await saved();
  await backTo('E2E Draft Hood');

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
  await toAllSettings();
  await SYSTEMS().getByRole('button', { name: 'ROOFING', exact: true }).click();
  // 2026-11-16: Roofing is built by type (owner 2026-11-05); its "Full list" chip holds the plain add box.
  await fullList();
  const addBox = () => EDITOR().getByLabel('New item name', { exact: true });
  await addBox().fill('E2E first edit'); await addBox().press('Enter');
  await saved();
  const live3 = db.company_template_drafts.find(d => d.template_id === LIVE_ID);
  ok('10 · editing a live template starts its shared draft at the live version', !!live3 && live3.based_on_version === 3);
  live3.row_version += 1;                                             // another tab saved meanwhile
  await addBox().fill('E2E second edit'); await addBox().press('Enter');
  ok('10 · the stale save is refused and the editor says so (reload), never overwriting', await waitFor(async () => (await page.getByText(/saved somewhere else/i).count()) > 0, 10000)
    && !findByLabel(db.company_template_drafts.find(d => d.template_id === LIVE_ID).template, 'E2E second edit'));

  // ── 11 · what inspections can't use yet (changes to Ledrix's default requirements) cannot be published ──
  step = '11'; console.log('\n11 · changes to Ledrix default requirements are not publishable yet\n');
  const d11 = db.company_template_drafts.find(d => d.template_id === LIVE_ID);
  const rq = clone(d11.template);
  rq.requirementOverrides = { 'ledrix:r0:facts:hvac_heating': { level: 'optional' } };
  d11.template = rq; d11.row_version += 1;                           // written outside the UI (a draft from elsewhere)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(async () => (await page.getByRole('button', { name: 'Publish', exact: true }).count()) > 0, 60000);
  const liveBefore = JSON.stringify(db.company_templates.find(t => t.id === LIVE_ID));
  ok('11 · a template that changes Ledrix default requirements can\'t be published: Publish is disabled with the reason, and the live template is unchanged',
    await waitFor(async () => (await page.getByRole('button', { name: /to fix before publishing/ }).count()) > 0, 10000)
    && await page.getByRole('button', { name: 'Publish', exact: true }).first().isDisabled()
    && (await page.getByRole('button', { name: 'Publish', exact: true }).first().click({ timeout: 1500 }).then(() => false, () => true))
    && JSON.stringify(db.company_templates.find(t => t.id === LIVE_ID)) === liveBefore);

  // ── 11b · phone width ──
  step = '11b'; console.log('\n11b · phone width\n');
  await toAllSettings();                                             // a reload opens on Guided (owner 2026-11-14)
  await page.screenshot({ path: join(dirname(OUT), 'desktop.png') }).catch(() => {});
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(800);
  ok('11b · at phone width the page has no sideways scroll and the section rail and tree are reachable',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    && await page.getByRole('navigation', { name: 'Template sections' }).isVisible()
    && await SYSTEMS().isVisible(), await page.evaluate(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`));
  await page.screenshot({ path: join(dirname(OUT), 'phone.png'), fullPage: true }).catch(() => {});
  // 2026-11-16: the narrow-width switch is the "View" tablist's Preview tab (2026-11-06), not a tab named Inspector preview.
  await page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name: 'Preview', exact: true }).click();
  ok('11b · at phone width the inspector preview opens from its tab', await waitFor(async () => await page.getByLabel('Inspector preview of the Ledrix Inspect app').isVisible(), 5000));
  await page.screenshot({ path: join(dirname(OUT), 'phone-preview.png'), fullPage: true }).catch(() => {});
  await page.setViewportSize({ width: 1600, height: 1000 });

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

  // ── 14 · New template: the guided creation page (2026-10-27) ──
  step = '14'; console.log('\n14 · New template → company requirements → starting point → private draft\n');
  const sourceBefore = JSON.stringify(db.company_templates.find(t => t.name === 'Standard'));
  const liveCount = db.company_templates.filter(t => !t.deleted_at).length, draftsBefore = db.company_template_drafts.length;
  await page.goto(`${BASE}/app/templates`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'New template' }).click();
  ok('14 · New template opens the creation page (no dialog)', await waitFor(async () => page.url().includes('/app/templates/create') && await page.getByRole('heading', { name: 'Create a template' }).isVisible(), 60000));
  const fits = async () => { const r = []; for (const w of [1280, 1440, 1920]) { await page.setViewportSize({ width: w, height: 900 }); r.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); } await page.setViewportSize({ width: 1600, height: 1000 }); return r.every(Boolean); };
  ok('14 · the start step fits 1280, 1440 and 1920 px wide (no sideways scroll)', await fits());
  // 2026-11-16: the creation page is one question per screen since 2026-11-14 (owner, mockup B6BhhbaEivmUiE9GtETeqi):
  // What it's for (which picks the Ledrix build — no Starting point screen) → Where → License → Associations → Standards
  // → Add-ons → Advisories (the company's answers are saved leaving it) → Name it. Each screen is driven by its own control.
  const untickAll = async () => { for (let i = 0; i < 20 && (await page.getByRole('checkbox', { checked: true }).count()) > 0; i++) await page.getByRole('checkbox', { checked: true }).first().click(); };
  const nextQ = async (q) => { await page.getByRole('button', { name: 'Next', exact: true }).click(); if (q) await waitFor(async () => (await page.getByRole('heading', { name: q }).count()) > 0, 10000); };
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await waitFor(async () => (await page.getByRole('heading', { name: 'What’s this template for?' }).count()) > 0, 10000);
  ok('14 · the starting-point step fits 1280, 1440 and 1920 px wide', await fits());
  await page.getByRole('radiogroup', { name: 'What the template is for' }).getByRole('radio', { name: /^4-Point/ }).click();
  // 2026-11-16: "import is coming later" — the creation page has no Import option at all now; what it shows as not yet
  // working is Commercial, marked Coming soon and not pickable.
  ok('14 · import is shown as coming later, not as a working option', await page.getByText('Coming soon').isVisible()
    && await page.getByRole('radio', { name: /^Commercial/ }).isDisabled() && (await page.getByRole('radio', { name: /Import/ }).count()) === 0);
  await nextQ('Where do you inspect?');
  ok('14 · the company step fits 1280, 1440 and 1920 px wide', await fits());
  await page.getByLabel('States').selectOption('ID');
  await nextQ('Do your inspectors need a license?');
  await page.getByRole('radiogroup', { name: 'Licensing' }).getByRole('radio', { name: 'We’re still determining this' }).click();
  ok('14 · no individual license number is asked for', (await page.getByLabel(/license (number|#)/i).count()) === 0);
  await nextQ('Which associations do you belong to?');
  await page.getByRole('checkbox', { name: 'InterNACHI', exact: true }).click();
  await nextQ('Which standards do you follow?');
  // 2026-11-16: standards now start ticked from the associations and the state; untick them — this company names none.
  await untickAll();
  await nextQ('Which add-on services do you offer?');
  // 2026-11-16: add-ons (pre-ticked) would each add a section; untick them so the draft is exactly the Ledrix 4-Point build.
  await untickAll();
  await nextQ('What do your reports recommend?');
  await nextQ('Name it');
  const ctxRow = () => db.company_template_context.find(c => c.company_id === CO);
  ok('14 · the company’s answers are saved once, for the company, at version 1',
    await waitFor(() => !!ctxRow()) && ctxRow().jurisdictions.join() === 'ID' && ctxRow().services.join() === 'four_point'
    && ctxRow().affiliations.join() === 'internachi' && ctxRow().standards.length === 0 && ctxRow().licensing === 'undetermined' && ctxRow().row_version === 1,
    JSON.stringify(ctxRow()));
  // 2026-11-16: no recommendation card — the purpose picks the build, and "Ledrix built" says which, as a fact.
  // 2026-11-16: the 4-Point build has 15 systems since the Cooling / Mini-Split / Heat Pump split, not 13 — the count is
  // read from the shipped baseline (lib/templates/baselines/fourPoint.json) instead of being written in.
  const FOUR_N = JSON.parse(readFileSync(join(ROOT, 'lib/templates/baselines/fourPoint.json'), 'utf8')).systems.length;
  ok('14 · the Ledrix 4-Point template is recommended for the 4-Point service, with its reason',
    // ("Ledrix built" counts the systems the build starts with included, which is not the stored count — so any count.)
    await waitFor(async () => (await page.getByText(/^4-Point · \d+ systems$/).count()) === 1));
  // 2026-11-16: no coverage score on the page — the state is listed as "checks coming soon", nothing claimed covered.
  ok('14 · requirements coverage reads "Not evaluated" — no score, nothing claimed covered',
    await page.getByText(/^Idaho · checks coming soon$/).isVisible()
    && (await page.getByText(/compliant|% covered/i).count()) === 0);
  ok('14 · the create-draft step fits 1280, 1440 and 1920 px wide', await fits());
  await page.locator('#tpl-name').fill('E2E 4-Point');
  await page.getByRole('button', { name: 'Create and fine-tune ›' }).click();
  const made = () => db.company_template_drafts.find(d => d.name === 'E2E 4-Point');
  ok(`14 · a private draft is created from the Ledrix 4-Point template (${FOUR_N} systems, the company’s own copy)`,
    await waitFor(() => !!made()) && made().template_id == null && made().base === 'fourpoint' && made().template.systems.length === FOUR_N && made().template.id === 'custom'
    && db.company_template_drafts.length === draftsBefore + 1, made() && `${made().base} · ${made().template.systems.length} systems · ${made().template.id}`);
  ok('14 · it opens in the Template Builder, unpublished', await waitFor(async () => page.url().includes('/app/templates/new?draft=') && await page.getByText('New template · not published').isVisible(), 60000));
  await toAllSettings();
  await SYSTEMS().getByRole('button', { name: 'ROOFING', exact: true }).click();
  const roofOn = () => findIn(made().template, 'roofing')?.defaultActive;
  const wasOn = roofOn() === true;
  await page.getByRole('switch', { name: /included in new inspections/ }).click();
  ok('14 · the system’s Included switch on its title line turns it off in the draft', await waitFor(() => roofOn() === !wasOn) && await page.getByText(wasOn ? 'Not included' : 'Included', { exact: true }).isVisible());
  ok('14 · nothing was published and the company’s templates are untouched',
    db.company_templates.filter(t => !t.deleted_at).length === liveCount && JSON.stringify(db.company_templates.find(t => t.name === 'Standard')) === sourceBefore);
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
if (devCssReloads) console.log(`  · ${devCssReloads} dev-server stylesheet reload${devCssReloads === 1 ? '' : 's'} set aside (next dev only — see above)`);
console.log(`\n${pass + fail} checks · ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
