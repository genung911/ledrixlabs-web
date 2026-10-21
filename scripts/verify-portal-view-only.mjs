#!/usr/bin/env node
// ─── Guard: a view-only portal link is not OFFERED changes it cannot make ─────────────────
//
// (Homeowner security pass 4, 2026-10-20.) The server refuses every write from a view-only link
// (scripts/verify-portal-security.mjs proves that against the real routes). This guards the PAGE:
// a view-only visitor should not see project, reminder, repair, log or document controls that
// would only fail, and every write handler must stop on its own even if a control is reached.
//
//   1. RENDER — the real components of app/share/[id]/page.tsx, transpiled with the repo's
//      TypeScript and rendered with react-dom/server for an edit link, a view-only link and a
//      repairs-only link. Collapsed/expanded state is forced on a COPY (useState(false) →
//      useState(__OPEN)), because static rendering cannot click; nothing in the source changes.
//   2. HANDLERS — every write the page makes (supaPost / supaPatch / supaDelete, /api/docs
//      writes) sits in a handler whose first statements include `if (!can('…')) return;`.
//   3. RULES — lib/portalActions.ts: only an edit link may do any of it.
//
// What it cannot prove: browser behaviour after a click (no DOM here); the server-side refusals
// are verify-portal-security's job.
//
//   node scripts/verify-portal-view-only.mjs
import { registerHooks, createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repo, 'package.json'));
const ts = require('typescript');

let checks = 0; const failures = [];
const ok = (label, cond, detail) => { checks++; if (!cond) failures.push(detail ? `${label}\n      ${detail}` : label); };

const pageSrc = readFileSync(join(repo, 'app/share/[id]/page.tsx'), 'utf8');

// ── 3 · Rules ─────────────────────────────────────────────────────────────────────────────
const { portalCan, PORTAL_WRITE_ACTIONS } = await import(pathToFileURL(join(repo, 'lib/portalActions.ts')).href);
ok('RULES every action is allowed for an edit link', PORTAL_WRITE_ACTIONS.every(a => portalCan('edit', a)));
ok('RULES no action is allowed for a view-only link', PORTAL_WRITE_ACTIONS.every(a => !portalCan('read', a)));
ok('RULES no action is allowed for a repairs-only link', PORTAL_WRITE_ACTIONS.every(a => !portalCan('repairs', a)));
ok('RULES an unknown action is never allowed', !portalCan('edit', 'records.drop'));
const usedActions = [...new Set([...pageSrc.matchAll(/\bcan\('([a-z.]+)'\)/g)].map(m => m[1]))];
ok('RULES every action the page checks is a declared action', usedActions.length > 0 && usedActions.every(a => PORTAL_WRITE_ACTIONS.includes(a)),
  usedActions.filter(a => !PORTAL_WRITE_ACTIONS.includes(a)).join(', '));

// ── 2 · Handlers ──────────────────────────────────────────────────────────────────────────
// For each write, the nearest preceding `async` (its handler) must be followed by a can() guard
// before the write — or, for the load-time seeding, by the canEdit() gate at its call site.
{
  const writes = [...pageSrc.matchAll(/(?<!function )\bsupa(?:Post|Patch|Delete)\(|fetch\('\/api\/docs', \{ method: '(?:DELETE|POST)'|const post = \(body: object\) => fetch\('\/api\/docs'/g)];
  ok('HANDLERS the page\'s writes are found', writes.length >= 20, `${writes.length} found`);
  const unguarded = [];
  for (const w of writes) {
    const before = pageSrc.slice(0, w.index);
    const start = before.lastIndexOf('async ');
    const body = pageSrc.slice(start, w.index);
    if (!/if \(!can\('[a-z.]+'\)\) return;/.test(body)) {
      const line = before.split('\n').length;
      unguarded.push(`line ${line}: ${pageSrc.slice(w.index, w.index + 50).split('\n')[0]}`);
    }
  }
  ok('HANDLERS every write stops for a link that cannot make it', unguarded.length === 0, unguarded.join('\n      '));
  ok('HANDLERS seeding still runs only for edit links', /if \(!seeded\.current && canEdit\(\)\)/.test(pageSrc)
    && /async function seedIfEmpty\([^)]*\) \{\n  if \(!can\('seed'\)\) return;/.test(pageSrc)
    && /async function seedManualDocs\([^)]*\) \{\n  if \(!can\('seed'\)\) return;/.test(pageSrc));
  ok('HANDLERS a view-only link\'s speech goes to the chat, never the log parser', /if \(can\('log\.add'\)\) try \{\n[^\n]*\n[^\n]*mode: 'logparse'/.test(pageSrc));
}

// ── 1 · Render ────────────────────────────────────────────────────────────────────────────
const out = join(repo, 'node_modules/.cache/verify-portal-view-only');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const forced = pageSrc
  .replace('const [expanded, setExpanded] = useState(false);', 'const [expanded, setExpanded] = useState(__OPEN);')
  .replace('const [showAdd, setShowAdd] = useState(false);', 'const [showAdd, setShowAdd] = useState(__OPEN);')
  .replace('const [open, setOpen]     = useState(false);', 'const [open, setOpen]     = useState(__OPEN);');
ok('RENDER (harness) the three forced states were found in the page', (forced.match(/useState\(__OPEN\)/g) ?? []).length === 3);
const js = ts.transpileModule(forced, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText + `
let __OPEN = false;
export const __test = {
  ProjectCard, ReminderCard, ProjectsTab, RepairsTab, LogServiceForm,
  setScope: (s) => { PORTAL_SCOPE = s; }, setOpen: (v) => { __OPEN = v; },
};
`;
writeFileSync(join(out, 'page.mjs'), js);
const STUB = 'data:text/javascript,' + encodeURIComponent(
  'const C = () => null; export default C; export { C as LedrixDelta, C as ValMark, C as LedrixEye };'
  + 'export const useParams = () => ({});'
  + 'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };');
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'next/navigation' || spec.endsWith('/lib/supabaseClient') || spec.startsWith('@/components/') || spec.endsWith('/components/ValVoiceVisualizer')) {
      return { url: STUB, shortCircuit: true };
    }
    if (spec.startsWith('@/lib/')) return { url: pathToFileURL(join(repo, spec.slice(2) + '.ts')).href, shortCircuit: true };
    return next(spec, ctx);
  },
});
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { __test: T } = await import(pathToFileURL(join(out, 'page.mjs')).href);
const html = (C, props) => renderToStaticMarkup(React.createElement(C, props));
const noop = () => {};

const project = { id: 'p1', share_id: 'insp_A', title: 'Water heater venting', system: 'Water Heater', priority: 'high', status: 'identified', photos: [], seeded: false, created_at: '', updated_at: '' };
const reminder = { id: 'r1', share_id: 'insp_A', title: 'Replace furnace filter', completed: false, seeded: true, created_at: '' };
const anomaly = { id: 'f1', unit: 'Electrical', description: 'Blocked panel cover', severity: 'deficiency' };
const anomaly2 = { id: 'f2', unit: 'Roof', description: 'Lifted shingles', severity: 'maintenance' };
const record = { id: 'h', share_id: 'insp_A', address: '1 Alpha Ln', inspection_date: '2026-10-01', anomalies: [anomaly, anomaly2], specs: [], created_at: '' };

function renderAll(scope) {
  T.setScope(scope);
  const r = {};
  T.setOpen(false);
  r.projectClosed = html(T.ProjectCard, { p: project, onUpdate: noop, shareId: 'insp_A' });
  r.projectsTab = html(T.ProjectsTab, { projects: [project], anomalies: [anomaly], shareId: 'insp_A', onRefresh: noop });
  r.logClosed = html(T.LogServiceForm, { shareId: 'insp_A', onSaved: noop, access: true, onUnlock: noop });
  T.setOpen(true);
  r.projectOpen = html(T.ProjectCard, { p: project, onUpdate: noop, shareId: 'insp_A' });
  r.projectsAdd = html(T.ProjectsTab, { projects: [project], anomalies: [anomaly2], shareId: 'insp_A', onRefresh: noop });
  r.logOpen = html(T.LogServiceForm, { shareId: 'insp_A', onSaved: noop, access: true, onUnlock: noop });
  T.setOpen(false);
  r.reminder = html(T.ReminderCard, { r: reminder, onUpdate: noop, access: true, onUnlock: noop });
  // One row already in the request; the second finding is still available to add.
  r.repairs = html(T.RepairsTab, {
    anomalies: [anomaly, anomaly2], shareId: 'insp_A', record, onRefresh: noop, signedIn: true,
    repairs: [{ id: 'rp1', share_id: 'insp_A', anomaly_ref: 'f1', item: 'Electrical', severity: 'deficiency', status: 'included', generated_text: 'Please clear access to the electrical panel.' }],
  });
  return r;
}

const edit = renderAll('edit');
const read = renderAll('read');
const reps = renderAll('repairs');

// Full access keeps everything it had.
ok('RENDER edit: project actions offered', /MARK /.test(edit.projectOpen) && /ADD PHOTO/.test(edit.projectOpen) && /REPLACE APPLIANCE/.test(edit.projectOpen) && /TAP FOR ACTIONS/.test(edit.projectClosed));
ok('RENDER edit: add a project offered', /\+ Track a repair or project/.test(edit.projectsTab) && /New project…/.test(edit.projectsAdd) && /OR ADD FROM A FINDING/.test(edit.projectsAdd));
ok('RENDER edit: reminder complete and snooze offered', /COMPLETE/.test(edit.reminder) && /SNOOZE 7D/.test(edit.reminder));
ok('RENDER edit: log a service offered', /\+ Log a service or improvement/.test(edit.logClosed) && /<input/.test(edit.logOpen));
ok('RENDER edit: repair request editable and shareable', /SHARE REQUEST LINK/.test(edit.repairs) && /ADD FROM FINDINGS/.test(edit.repairs)
  && /<textarea/.test(edit.repairs) && /title="Remove from request"/.test(edit.repairs));

for (const [name, r] of [['view-only', read], ['repairs-only', reps]]) {
  ok(`RENDER ${name}: no project actions`, !/MARK |ADD PHOTO|REPLACE APPLIANCE/.test(r.projectOpen) && /TAP FOR DETAILS/.test(r.projectClosed) && !/TAP FOR ACTIONS/.test(r.projectClosed));
  ok(`RENDER ${name}: the project itself still shows`, /Water heater venting/i.test(r.projectOpen) || /WATER HEATER/i.test(r.projectOpen));
  ok(`RENDER ${name}: no add-project control`, !/Track a repair or project/.test(r.projectsTab) && !/New project…/.test(r.projectsAdd) && !/OR ADD FROM A FINDING/.test(r.projectsAdd));
  ok(`RENDER ${name}: no reminder actions, reminder still shows`, !/COMPLETE|SNOOZE/.test(r.reminder) && /Replace furnace filter/.test(r.reminder));
  ok(`RENDER ${name}: no log-a-service form`, r.logClosed === '' && r.logOpen === '');
  ok(`RENDER ${name}: repair request is read-only`, !/SHARE REQUEST LINK/.test(r.repairs) && !/ADD FROM FINDINGS/.test(r.repairs)
    && !/<textarea/.test(r.repairs) && !/Remove from request/.test(r.repairs));
  ok(`RENDER ${name}: the request text, copy and print remain`, /Please clear access to the electrical panel\./.test(r.repairs) && /COPY/.test(r.repairs) && /PRINT/.test(r.repairs));
}

if (failures.length) {
  console.error(`verify-portal-view-only: ${failures.length} of ${checks} checks FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-portal-view-only: all ${checks} checks pass`);
