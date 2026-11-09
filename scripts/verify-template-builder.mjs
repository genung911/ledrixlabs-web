// Guard for the desktop Template Builder (/app/templates, /app/templates/[id], /api/template-assistant,
// lib/templateBuilder, lib/templates, components/templates).
//
//   node scripts/verify-template-builder.mjs     (WEB_SRC=<dir> another checkout, LEDRIX_APP=<dir> the app repo;
//                                                 ALLOW_NO_APP=1 skips the parity section when the app repo is absent)
//
// 1. PARITY with the app — lib/templateBuilder/core/*.ts are byte-identical copies of ledrix-app
//    src/core/templates/*.ts; the types-only InspectionTemplate.ts names exactly the app's TemplateNode /
//    InspectionTemplate fields; the model is the app's TEMPLATE_AUTHORING_MODEL.
// 2. EXECUTED (Node type stripping) — the real session + draft store + core, with an in-memory browser storage and
//    a stub model: a draft is a private COPY (the live template object is never changed), proposals stay proposed
//    until accepted, out-of-scope changes are refused, apply / undo / dismiss / discard, a reviewed proposal is
//    never replaced, an unreadable stored draft is an error and is left in place, blocked storage is an error,
//    and the store writes one key family only.
//    Plus the desktop's own modules: hand edits (lib/templates/editorModel) go through the change-set pipeline and
//    are undoable; Ask Ledrix's prompt (lib/templates/assistant) is scoped, data-fenced, refuses bad requests and
//    proposes for one system only; grades are filtered out; answers keep their source labels.
// 3. STATIC — writes live in lib/templates/api.ts only, are versioned (row_version) and never touch an inspection
//    or a snapshot; the live template is never inserted/upserted/hard-deleted from the browser; publishing is the
//    owner-only RPC; the phone preview writes nothing; no model or service-role key in browser code; the server
//    route's gates (session, owner/admin, own company's template or draft, prompt built server-side, cost cap
//    before the model, grade filter); owner-only actions are owner-only in the UI too.
// 4. MUTATIONS — each static rule and two executed properties are re-run against a broken copy and must FAIL.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = process.env.WEB_SRC ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ?? join(ROOT, '..', 'ledrix-app');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); } };
const read = p => readFileSync(join(ROOT, p), 'utf8');
const walk = dir => {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap(n => {
    const rel = join(dir, n);
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : (/\.(tsx?|mjs)$/.test(n) ? [rel] : []);
  });
};
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const CORE = ['templateOps', 'templateValidate', 'templateChangeSets', 'templateDraft', 'templateAuthoring', 'templateOpSummary', 'templateRules', 'structureTypes', 'requirementsContract', 'equipmentCatalog', 'propertyTypes', 'specialHomes'];
// 2026-10-21 (one rule model): the resolver the phone runs, copied from the app's TAXONOMY folder (not templates).
// 'guidedOrder' since 2026-10-24: the phone preview's item list and Guided Coverage walk run the app's own module.
const TAXONOMY_CORE = ['applicability', 'guidedOrder'];

// ── 1. Parity ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('parity with the app');
if (!existsSync(join(APP, 'src/core/templates'))) {
  if (process.env.ALLOW_NO_APP) console.log(`  · SKIPPED — no ledrix-app at ${APP} (ALLOW_NO_APP set)`);
  else ok(`ledrix-app found at ${APP} (set LEDRIX_APP, or ALLOW_NO_APP=1 to skip parity)`, false);
} else {
  for (const f of CORE) {
    const mine = read(`lib/templateBuilder/core/${f}.ts`);
    const theirs = readFileSync(join(APP, `src/core/templates/${f}.ts`), 'utf8');
    ok(`core/${f}.ts is byte-identical to the app's`, mine === theirs, 'copy it again from ledrix-app src/core/templates');
  }
  for (const f of TAXONOMY_CORE) {
    ok(`core/${f}.ts is byte-identical to the app's taxonomy/${f}.ts (the preview runs the phone's resolver)`,
      read(`lib/templateBuilder/core/${f}.ts`) === readFileSync(join(APP, `src/core/taxonomy/${f}.ts`), 'utf8'), 'copy it again from ledrix-app src/core/taxonomy');
  }
  // The preview names a system exactly as the app's Scope does (2026-10-24).
  ok('components/templates/systemLabel.ts is byte-identical to the app\'s components/systems/systemLabel.ts',
    read('components/templates/systemLabel.ts') === readFileSync(join(APP, 'src/components/systems/systemLabel.ts'), 'utf8'),
    'copy it again from ledrix-app src/components/systems/systemLabel.ts');
  // Ledrix's own rules: exactly the rule fields of the app's bundled pack, node for node.
  {
    const pack = JSON.parse(readFileSync(join(APP, 'src/core/taxonomy/ledrix.core.json'), 'utf8'));
    const want = {};
    for (const sys of pack.systems) for (const n of sys.nodes) if (n.requires || n.dependsOnSpec) want[n.id] = { ...(n.requires ? { requires: n.requires } : {}), ...(n.dependsOnSpec ? { dependsOnSpec: n.dependsOnSpec } : {}) };
    const mine = JSON.parse(read('lib/templateBuilder/core/ledrixRules.json'));
    ok(`core/ledrixRules.json carries exactly the app pack's rule fields (${Object.keys(want).length} nodes, pack ${pack.packVersion})`,
      JSON.stringify(mine.nodes) === JSON.stringify(want) && mine.packVersion === pack.packVersion, 're-export it from ledrix-app src/core/taxonomy/ledrix.core.json');
    const titles = {};
    for (const sys of pack.systems) for (const n of sys.nodes) if (n.typeTitle) titles[n.id] = n.typeTitle;
    ok(`core/ledrixRules.json carries the app pack's type titles (${Object.keys(titles).join(', ') || 'none'})`,
      Object.keys(titles).length > 0 && JSON.stringify(mine.typeTitles ?? {}) === JSON.stringify(titles), 're-export it from ledrix-app src/core/taxonomy/ledrix.core.json');
  }
  const fieldsOf = (src, type) => {
    const a = src.indexOf(`export type ${type} = {`);
    if (a < 0) return null;
    let depth = 0, i = src.indexOf('{', a), out = [];
    const start = i;
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) break; } }
    const body = strip(src.slice(start + 1, i));
    let d = 0;
    for (const line of body.split('\n')) {
      if (d === 0) { const m = /^\s*(\w+)\??\s*:/.exec(line); if (m) out.push(m[1]); }
      for (const ch of line) { if (ch === '{') d++; else if (ch === '}') d--; }
    }
    return out.sort().join(',');
  };
  const appIT = readFileSync(join(APP, 'src/core/templates/InspectionTemplate.ts'), 'utf8');
  const myIT = read('lib/templateBuilder/core/InspectionTemplate.ts');
  for (const t of ['TemplateNode', 'InspectionTemplate']) {
    const a = fieldsOf(appIT, t), m = fieldsOf(myIT, t);
    ok(`InspectionTemplate.ts: ${t} names the app's fields`, !!a && a === m, `app: ${a}\n      here: ${m}`);
  }
  const appModel = /TEMPLATE_AUTHORING_MODEL\s*=\s*'([^']+)'/.exec(readFileSync(join(APP, 'src/core/services/LocalLLMService.ts'), 'utf8'))?.[1];
  const myModel = /TEMPLATE_AUTHORING_MODEL\s*=\s*'([^']+)'/.exec(read('lib/templateBuilder/access.ts'))?.[1];
  ok('the model is the app\'s TEMPLATE_AUTHORING_MODEL', !!appModel && appModel === myModel, `${appModel} vs ${myModel}`);
}

// ── 2. Executed ───────────────────────────────────────────────────────────────────────────────────────────
// The builder modules, copied to a temp dir with explicit .ts import specifiers so Node can strip and load them.
const BUILDER = ['access', 'draftStore', 'session', 'edit'];
const DESKTOP = ['editorModel', 'assistant', 'ruleModel', 'requirementModel', 'catalogModel', 'startingPoints', 'publishFixes', 'advisoryModel', 'reportAdvisories', 'buildingModel'];
function stage(files) {
  const dir = mkdtempSync(join(tmpdir(), 'tb-'));
  mkdirSync(join(dir, 'core'));
  mkdirSync(join(dir, 'scope', 'taxonomy'), { recursive: true });
  const alias = s => s
    .replace(/from '@\/lib\/scope\/core\/taxonomy\/([^']+)'/g, "from './scope/taxonomy/$1'")
    .replace(/from '@\/lib\/templateBuilder\/core\/([^']+)'/g, "from './core/$1'")
    .replace(/from '@\/lib\/(?:templateBuilder|templates)\/([^']+)'/g, "from './$1'");
  const fix = s => alias(s).replace(/from '(\.{1,2}\/[^']+)'/g, (m, p) => (p.endsWith('.ts') ? m : p.endsWith('.json') ? `from '${p}' with { type: 'json' }` : `from '${p}.ts'`));
  for (const [rel, src] of Object.entries(files)) writeFileSync(join(dir, rel), fix(src));
  return dir;
}
const sourceFiles = () => Object.fromEntries([
  ...CORE.map(f => [`core/${f}.ts`, read(`lib/templateBuilder/core/${f}.ts`)]),
  ...TAXONOMY_CORE.map(f => [`core/${f}.ts`, read(`lib/templateBuilder/core/${f}.ts`)]),
  ['core/InspectionTemplate.ts', read('lib/templateBuilder/core/InspectionTemplate.ts')],
  ['core/measurementPoints.json', read('lib/templateBuilder/core/measurementPoints.json')],
  ...BUILDER.map(f => [`${f}.ts`, read(`lib/templateBuilder/${f}.ts`)]),
  ...DESKTOP.map(f => [`${f}.ts`, read(`lib/templates/${f}.ts`)]),
  // BUILT BY TYPE (2026-11-05): the layout, and the preview's own rule capture it reads (one source with the phone).
  ['typeLayout.ts', read('lib/templates/typeLayout.ts')],
  ['materialLayout.ts', read('lib/templates/materialLayout.ts')],
  ['moveModel.ts', read('lib/templates/moveModel.ts')],
  ['phonePreviewModel.ts', read('components/templates/phonePreviewModel.ts')],
  ['core/ledrixRules.json', read('lib/templateBuilder/core/ledrixRules.json')],
  // 2026-11-07: the preview offers and titles through the app's answerShapes.ts (a byte-identical copy).
  ['core/answerShapes.ts', read('lib/templateBuilder/core/answerShapes.ts')],
  // 2026-11-08: the preview's Described-in-Details runs the app's whatsHere.ts (a byte-identical copy) and what it imports.
  ['scope/taxonomy/whatsHere.ts', read('lib/scope/core/taxonomy/whatsHere.ts')],
  ['scope/taxonomy/instances.ts', read('lib/scope/core/taxonomy/instances.ts')],
  ['scope/taxonomy/applicability.ts', read('lib/scope/core/taxonomy/applicability.ts')],
]);

const clone = x => JSON.parse(JSON.stringify(x));
const LIVE = {
  id: 'tpl_1', name: 'Acme Standard', version: 1,
  systems: [
    { id: 'roofing', label: 'Roofing', kind: 'system', children: [
      { id: 'roof_cover', label: 'Roof Covering', kind: 'component', options: ['Asphalt', 'Metal'] },
      { id: 'roof_drain', label: 'Gutters', kind: 'component', condition: true },
    ] },
    { id: 'hvac', label: 'Heating', kind: 'system', children: [{ id: 'hvac_furnace', label: 'Furnace', kind: 'component', condition: true }] },
  ],
};
const REPLY = { summary: 'Adds flashing and guidance.', changes: [
  { op: { op: 'addNode', parentId: 'roofing', node: { id: 'roof_flashing', label: 'Flashing', kind: 'component' } }, why: 'Flashing is commonly reported.' },
  { op: { op: 'setNodeField', nodeId: 'roof_cover', field: 'description', value: 'Note covering type and layers.' }, why: 'Guidance for the inspector.' },
  { op: { op: 'setNodeField', nodeId: 'hvac_furnace', field: 'description', value: 'x' }, why: 'Out of scope.' },
] };

async function runExecuted(files) {
  const dir = stage(files);
  const S = await import(pathToFileURL(join(dir, 'session.ts')).href);
  const DS = await import(pathToFileURL(join(dir, 'draftStore.ts')).href);
  const results = {};
  const r = (k, v) => { results[k] = !!v; };
  const mem = new Map();
  const storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };
  let calls = 0, lastSent = null;
  const call = async (a) => { calls++; lastSent = a; return { ok: true, reply: { parsed: clone(REPLY), model: 'gpt-4o', promptRef: 'ref' } }; };
  const store = DS.createDraftStore(storage);
  const sess = S.createBuilderSession({ companyId: 'co_1', templateId: 'tpl_1', store, call });
  const live = clone(LIVE); const liveBefore = JSON.stringify(live);
  const OWNER = { userId: 'u1', role: 'owner' };
  try {
    const st = sess.startOrResume(live, 1000);
    r('open: a draft is created from the live template and saved', st.draft && mem.size === 1 && !st.liveChanged);
    const openedTree = JSON.stringify(store.loadDraft('co_1', 'tpl_1').tree);
    r('open: the draft is a COPY — mutating it never touches the live template object', (() => { st.draft.tree.systems[0].label = 'X'; return JSON.stringify(live) === liveBefore; })());
    const p = await sess.propose({ systemId: 'roofing', request: 'Add flashing.', author: OWNER, now: 2000 });
    r('propose: the server call carries the draft tree, the system and the words only', calls === 1 && lastSent?.systemId === 'roofing' && lastSent?.request === 'Add flashing.' && Array.isArray(lastSent?.tree?.systems) && Object.keys(lastSent).sort().join() === 'request,systemId,templateId,tree');
    r('propose: in-scope changes become PROPOSED entries; nothing is accepted by itself', p.ok && p.cs.entries.length === 2 && p.cs.entries.every(e => e.status === 'proposed'));
    r('propose: a change to another system is refused, with its reason', p.ok && p.refused.length === 1 && /not part of this system/.test(p.refused[0].error));
    r('propose: the draft tree is unchanged until something is applied', p.ok && JSON.stringify(p.draft.tree) === openedTree && JSON.stringify(store.loadDraft('co_1', 'tpl_1').tree) === openedTree);
    const e1 = p.ok ? p.cs.entries.find(e => e.op.op === 'addNode') : null;
    const d1 = sess.decide(e1.id, 'accepted', 3000);
    r('decide: accepting one entry is saved', d1.ok && d1.draft.pending.entries.find(e => e.id === e1.id).status === 'accepted');
    const again = await sess.propose({ systemId: 'roofing', request: 'More.', author: OWNER, now: 3500 });
    r('propose: never replaces a proposal that holds a decision', !again.ok && calls === 1 && store.loadDraft('co_1', 'tpl_1').pending.entries.some(e => e.status === 'accepted'));
    const e2 = p.cs.entries.find(e => e.op.op === 'setNodeField');
    const ed = sess.edit(e2.id, { op: 'setNodeField', nodeId: 'roof_cover', field: 'description', value: 'Edited guidance.' }, 3600);
    r('edit: an edited entry keeps the proposal and records the edit', ed.ok && ed.draft.pending.entries.find(e => e.id === e2.id).edited?.value === 'Edited guidance.' && ed.draft.pending.entries.find(e => e.id === e2.id).op.value === 'Note covering type and layers.');
    const ap = sess.apply({ now: 4000 });
    const flash = ap.ok && ap.draft.tree.systems[0].children.some(n => n.id === 'roof_flashing');
    const guidance = ap.ok && ap.draft.tree.systems[0].children.find(n => n.id === 'roof_cover').description === 'Edited guidance.';
    r('apply: accepted and edited entries reach the draft', flash && guidance && ap.draft.pending === null);
    r('apply: the live template object is still exactly as loaded', JSON.stringify(live) === liveBefore);
    const csId = ap.ok ? ap.draft.log[ap.draft.log.length - 1].id : '';
    const un = sess.undo(csId, OWNER, 5000);
    r('undo: the applied change set is reverted in the draft', un.ok && !un.draft.tree.systems[0].children.some(n => n.id === 'roof_flashing'));
    await sess.propose({ systemId: 'roofing', request: 'Again.', author: OWNER, now: 6000 });
    const dm = sess.dismiss(7000);
    r('dismiss: drops the pending proposal and applies nothing', dm.ok && dm.draft.pending === null && !dm.draft.tree.systems[0].children.some(n => n.id === 'roof_flashing'));
    r('store: exactly one key, in the draft key family', mem.size === 1 && [...mem.keys()].every(k => k === DS.draftKey('co_1', 'tpl_1') && k.startsWith(DS.DRAFT_KEY_PREFIX)));
    sess.discard();
    r('discard: removes the draft and nothing else', mem.size === 0);
    mem.set(DS.draftKey('co_1', 'tpl_1'), '{not json');
    let threw = false; try { sess.startOrResume(clone(LIVE), 8000); } catch (e) { threw = e?.name === 'DraftStoreError'; }
    r('an unreadable saved draft is an error and is left in place, never silently replaced', threw && mem.get(DS.draftKey('co_1', 'tpl_1')) === '{not json');
    const blocked = DS.createDraftStore({ getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} });
    let b1 = false; try { blocked.loadDraft('co_1', 'tpl_1'); } catch (e) { b1 = e?.name === 'DraftStoreError'; }
    r('blocked browser storage is a readable error, not a crash or a lost draft', b1);
  } catch (e) {
    r(`executed scenario completed (${e?.message})`, false);
  }
  return results;
}

// The desktop's own modules: hand edits and Ask Ledrix.
async function runDesktop(files) {
  const dir = stage(files);
  const E = await import(pathToFileURL(join(dir, 'editorModel.ts')).href);
  const A = await import(pathToFileURL(join(dir, 'assistant.ts')).href);
  const T = await import(pathToFileURL(join(dir, 'core/templateDraft.ts')).href);
  const results = {};
  const r = (k, v) => { results[k] = !!v; };
  const OWNER = { userId: 'u1', role: 'owner' };
  try {
    const live = clone(LIVE); const liveBefore = JSON.stringify(live);
    const probe = T.createDraft({ companyId: 'co_1', templateId: 'tpl_1', live, now: 999 });
    probe.tree.systems[0].label = 'Changed in the draft';
    r('draft: a new draft is a COPY of the live template', JSON.stringify(live) === liveBefore);
    let d = T.createDraft({ companyId: 'co_1', templateId: 'tpl_1', live, now: 1000 });
    const step = (ops, now) => { const x = E.applyManual(d, ops, OWNER, now); if (x.ok) d = x.draft; return x; };

    const rn = step(E.ops.rename('roof_drain', 'Gutters & Downspouts'), 2000);
    r('hand edit: a rename reaches the draft as one MANUAL change set', rn.ok && E.locate(d.tree, 'roof_drain').node.label === 'Gutters & Downspouts' && d.log.length === 1 && d.log[0].source === 'manual');
    r('hand edit: the live template object is never changed', JSON.stringify(live) === liveBefore);
    r('hand edit: an empty name is no change at all', E.ops.rename('roof_drain', '   ').length === 0);
    const add1 = step(E.ops.addItem(d.tree, 'roofing', 'roofing', 'Flashing'), 3000);
    const add2 = step(E.ops.addItem(d.tree, 'roofing', 'roofing', 'Flashing'), 3100);
    const ids = d.tree.systems[0].children.map(n => n.id);
    r('hand edit: new items get unique ids that start with their system', add1.ok && add2.ok && ids.includes('roofing__flashing') && ids.includes('roofing__flashing_2'));
    r('hand edit: a new item is assessed (Satisfactory / Limitation / Finding) by default', E.locate(d.tree, 'roofing__flashing').node.condition === true);
    const node = () => E.locate(d.tree, 'roofing__flashing').node;
    step(E.ops.addField(node(), 'Locations', ['Chimney', 'Valley'], true), 4000);
    const attr = node().attributes?.[0];
    r('hand edit: a spec field is added with its choices and multi-select', attr?.label === 'Locations' && attr.values.join() === 'Chimney,Valley' && attr.multi === true);
    step(E.ops.fieldValues(node().id, attr, ['Chimney', 'Valley', 'Drip edge']), 4100);
    step(E.ops.fieldMulti(node().id, node().attributes[0], false), 4200);
    r('hand edit: choices and single/multiple change in place', node().attributes[0].values.length === 3 && node().attributes[0].multi === false);
    step(E.ops.limitations(node().id, ['Concealed by roof covering']), 4300);
    step(E.ops.findingShortcuts(node(), ['Missing kick-out flashing', 'Rusted flashing'], 4400), 4400);
    const firstId = node().findingShortcuts?.[0]?.id;
    step(E.ops.findingShortcuts(node(), ['Missing kick-out flashing'], 4500), 4500);
    r('hand edit: limitation reasons and finding shortcuts are saved; a kept shortcut keeps its id',
      node().limitations?.[0] === 'Concealed by roof covering' && node().findingShortcuts?.length === 1 && node().findingShortcuts[0].id === firstId);
    // ── ASSESSED, BOTH WAYS (report integrity, 2026-10-24) ── OFF used to write null, which DELETED the field, and the
    // app reads a missing `condition` as ON — the old check here asserted exactly that broken state. Now OFF is an
    // explicit false that the editor, the draft, the published template and the phone all read as off; checked against
    // the APP's own componentAxes, not a model of it.
    const appAxes = (await import(pathToFileURL(join(APP, 'src/core/taxonomy/conditionMatch.ts')).href)).componentAxes;
    step(E.ops.assessed(node().id, false), 4600);
    r('condition: switching assessment OFF stores an explicit false (never a deleted field)', node().condition === false);
    r('condition: …and the editor, and the APP\'s componentAxes, both read it as off',
      E.assessesCondition(node()) === false && appAxes(node()).condition === false);
    step(E.ops.assessed(node().id, true), 4610);
    r('condition: switching it back ON stores true, read as on by the editor and the app',
      node().condition === true && E.assessesCondition(node()) === true && appAxes(node()).condition === true);
    step(E.ops.assessed(node().id, false), 4620);
    const legacy = [
      { id: 'l1', label: 'Typed, condition never stored', kind: 'component', attributes: [{ id: 'm', label: 'Material', values: ['A', 'B'] }] },
      { id: 'l2', label: 'Old shape, spec facet', kind: 'component', facet: 'spec', options: ['A', 'B'] },
      { id: 'l3', label: 'Old shape, both', kind: 'component', options: ['A', 'B'] },
      { id: 'l4', label: 'Bare item', kind: 'component' },
    ];
    r('condition: a legacy item that never stored the field reads exactly as the app reads it (missing = on; spec facet = off)',
      legacy.every(n => E.assessesCondition(n) === appAxes(n).condition) && E.assessesCondition(legacy[0]) === true && E.assessesCondition(legacy[1]) === false);
    step(E.ops.coverByDefault(d.tree, 'hvac', false), 4700);
    const off = d.tree.systems.find(s => s.id === 'hvac').defaultActive === false;
    step(E.ops.coverByDefault(d.tree, 'hvac', true), 4800);
    r('hand edit: a system can be left out of new inspections and put back', off && d.tree.systems.find(s => s.id === 'hvac').defaultActive === true);
    step(E.ops.setAside('roofing__flashing_2'), 4900);
    const aside = !E.locate(d.tree, 'roofing__flashing_2') && (d.tree.systems[0].trimmed ?? []).some(n => n.id === 'roofing__flashing_2');
    step(E.ops.restore('roofing__flashing_2'), 5000);
    r('hand edit: set aside keeps the item restorable, and restore brings it back', aside && !!E.locate(d.tree, 'roofing__flashing_2'));
    const before = d;
    const bad = E.applyManual(d, E.ops.move('nope', 'roofing', 0), OWNER, 5100);
    r('hand edit: a refused edit says why and leaves the draft untouched', !bad.ok && !!bad.error && d === before);
    const lastManual = d.log[d.log.length - 1].id;
    const un = T.undoInDraft(d, lastManual, { id: 'undo_1', author: OWNER, now: 5200 });
    r('hand edit: every edit is undoable', un.ok && !E.locate(un.draft.tree, 'roofing__flashing_2'));
    // ONE SWITCH (owner 2026-11-05): a group or item switched OFF goes to the off pocket (offered on site by the app);
    // ON brings it back where it was; a system's switch stays coverByDefault; a set-aside SYSTEM switched on comes back
    // covered. Executed through the real ops on the draft.
    step(E.includeOps(d.tree, 'roofing__flashing_2', false), 5010);
    const itemOff = !E.locate(d.tree, 'roofing__flashing_2') && !!E.locateOff(d.tree, 'roofing__flashing_2') && E.isIncluded(d.tree, 'roofing__flashing_2') === false;
    step(E.includeOps(d.tree, 'roofing__flashing_2', true), 5020);
    r('switch: an item switched off is kept (off, offered on site) and switching it on brings it back',
      itemOff && !!E.locate(d.tree, 'roofing__flashing_2') && !E.locateOff(d.tree, 'roofing__flashing_2') && E.isIncluded(d.tree, 'roofing__flashing_2'));
    const sysOffOps = E.includeOps(d.tree, 'hvac', false);
    r('switch: a system\'s switch is coverByDefault (it stays in the template, offered on site) — never a set-aside',
      sysOffOps.length > 0 && sysOffOps.every(o => o.op === 'setNodeField' && o.field === 'defaultActive') && sysOffOps.some(o => o.nodeId === 'hvac' && o.value === false));
    step(sysOffOps, 5025);
    step([{ op: 'trimNode', nodeId: 'hvac' }], 5030);
    const parked = !!E.locateOff(d.tree, 'hvac')?.offSystem && E.locateOff(d.tree, 'hvac').node.defaultActive === false;
    step(E.includeOps(d.tree, 'hvac', true), 5040);
    r('switch: a set-aside system switched on comes back COVERED (restore + defaultActive true)',
      parked && !!E.locate(d.tree, 'hvac') && d.tree.systems.find(x => x.id === 'hvac').defaultActive === true && E.isIncluded(d.tree, 'hvac'));
    r('switch: switching an off item off again, or a live item on again, writes nothing',
      E.includeOps(d.tree, 'roofing__flashing_2', true).length === 0 && E.includeOps(d.tree, 'nope', false).length === 0);

    // Ask Ledrix
    const tree = d.tree;
    const company = A.summarizeCompany([{ name: 'Standard', template: tree }, { name: 'Gone', template: null }]);
    const item = A.buildAssistantPrompt({ scope: 'item', action: 'gaps', systemId: 'roofing', nodeId: 'roofing__flashing', tree }, company);
    r('assistant: an item question proposes for its system only', !item.error && item.proposesFor === 'roofing' && /Roofing › Flashing/.test(item.user));
    r('assistant: the instructions forbid invented citations and grades', !item.error && /Never cite or invent code sections/.test(item.system) && /Never propose condition grades/.test(item.system));
    r('assistant: the owner\'s words and the company data are fenced as data', !item.error && /<<<REQUEST_/.test(item.user) && /<<<COMPANY_/.test(item.user) && /Standard/.test(item.user));
    const tpl = A.buildAssistantPrompt({ scope: 'template', action: 'gaps', tree }, company);
    r('assistant: a whole-template question proposes nothing', !tpl.error && tpl.proposesFor === null && /"changes" must be \[\]/.test(tpl.system));
    r('assistant: an item question with no item is refused', !!A.buildAssistantPrompt({ scope: 'item', action: 'gaps', systemId: 'roofing', tree }, company).error);
    r('assistant: a free question must have words', !!A.buildAssistantPrompt({ scope: 'system', action: 'ask', question: '  ', systemId: 'roofing', tree }, company).error);
    r('assistant: an unknown action is refused', !!A.buildAssistantPrompt({ scope: 'system', action: 'publish', systemId: 'roofing', tree }, company).error);
    r('assistant: an over-long question is refused', !!A.buildAssistantPrompt({ scope: 'system', action: 'ask', question: 'x'.repeat(2001), systemId: 'roofing', tree }, company).error);
    const ans = A.normalizeAnswer({ answer: [{ text: 'General.', source: 'general' }, { text: 'Local.', source: 'jurisdiction' }, { text: 'Ours.', source: 'company' }, { text: 'Odd.', source: 'IRC R905' }, { text: 42 }] });
    r('assistant: answers keep their source labels; unknown sources become general; non-text is dropped',
      ans.length === 4 && ans[1].source === 'jurisdiction' && ans[2].source === 'company' && ans[3].source === 'general');
    const grade = { op: { op: 'addAttribute', nodeId: 'x', attribute: { id: 'c', label: 'Condition', values: ['Good', 'Fair', 'Poor'] } }, why: 'x' };
    const hidden = { op: { op: 'setAttributeField', nodeId: 'x', attrId: 'a', field: 'values', value: ['Good', 'Fair', 'Poor'] }, why: 'x' };
    const inNode = { op: { op: 'addNode', parentId: 'roofing', node: { id: 'n', label: 'N', kind: 'component', attributes: [{ id: 'r', label: 'Rating', values: ['1', '2'] }] } }, why: 'x' };
    const fine = { op: { op: 'addAttribute', nodeId: 'x', attribute: { id: 'm', label: 'Material', values: ['Asphalt', 'Metal', 'Tile'] } }, why: 'x' };
    r('assistant: grades are caught wherever they hide', A.isGradeChange(grade) && A.isGradeChange(hidden) && A.isGradeChange(inNode));
    r('assistant: an ordinary spec field is not mistaken for a grade', !A.isGradeChange(fine));
    const flat = A.normalizeChanges([{ op: 'addAttribute', nodeId: 'roof_cover', attribute: { id: 'vent', label: 'Ventilation type', values: ['Ridge', 'Soffit'] }, why: 'Asked for.' },
      { operation: { op: 'setNodeField', nodeId: 'roof_cover', field: 'description', value: 'x' }, reason: 'Clearer.' }, { op: { op: 'trimNode', nodeId: 'a' }, why: 'w' }, 'junk']);
    r('assistant: a flattened or renamed change is re-wrapped, a correct one is untouched, junk stays junk',
      flat[0]?.op?.op === 'addAttribute' && flat[0]?.op?.nodeId === 'roof_cover' && flat[0]?.why === 'Asked for.' && flat[0]?.op?.why === undefined
      && flat[1]?.op?.op === 'setNodeField' && flat[1]?.why === 'Clearer.' && flat[2]?.op?.op === 'trimNode' && flat[3] === 'junk');
    // coverage switches follow the app's rule
    const cov = clone(LIVE);
    r('coverage: a template that switches none on uses Ledrix\'s default list (as the app does)', E.isCovered(cov, cov.systems[0]) === true && E.isCovered({ ...cov, systems: [{ id: 'pools', label: 'P', kind: 'system' }] }, { id: 'pools' }) === false);
    let cd = T.createDraft({ companyId: 'co_1', templateId: 'tpl_1', live: cov, now: 1 });
    const c1 = E.applyManual(cd, E.ops.coverByDefault(cd.tree, 'hvac', false), OWNER, 2); cd = c1.ok ? c1.draft : cd;
    r('coverage: the first switch writes every system explicitly, so turning one off keeps the others on',
      c1.ok && cd.tree.systems.find(s => s.id === 'roofing').defaultActive === true && cd.tree.systems.find(s => s.id === 'hvac').defaultActive === false);
    const c2 = E.applyManual(cd, E.ops.coverByDefault(cd.tree, 'hvac', true), OWNER, 3); cd = c2.ok ? c2.draft : cd;
    let cn = T.createDraft({ companyId: 'co_1', templateId: 'tpl_1', live: clone(LIVE), now: 1 });
    const an = E.applyManual(cn, E.ops.addSystem(cn.tree, 'Pools'), OWNER, 2); cn = an.ok ? an.draft : cn;
    r('coverage: a new system is covered, and adding it keeps the default systems covered',
      an.ok && E.isCovered(cn.tree, cn.tree.systems.find(s => s.label === 'Pools')) && E.isCovered(cn.tree, cn.tree.systems.find(s => s.id === 'roofing')));
    r('coverage: switching a system on makes it covered (defaultActive true, not merely "not false")', c2.ok && cd.tree.systems.find(s => s.id === 'hvac').defaultActive === true && E.isCovered(cd.tree, cd.tree.systems.find(s => s.id === 'hvac')));

    // ── 2026-10-26 workspace: applicability rules and requirements, executed ──────────────────────────────────────
    const RM = await import(pathToFileURL(join(dir, 'ruleModel.ts')).href);
    const QM = await import(pathToFileURL(join(dir, 'requirementModel.ts')).href);
    const TR = await import(pathToFileURL(join(dir, 'core/templateRules.ts')).href);
    const TO = await import(pathToFileURL(join(dir, 'core/templateOps.ts')).href);
    const WS = { id: 'tpl_ws', name: 'Workspace', version: 1, systems: [
      { id: 'hvac', label: 'Heating', kind: 'system', children: [
        { id: 'hvac__plant', label: 'Heating plant', kind: 'subsystem', children: [
          { id: 'hvac_heating', label: 'Heating System', kind: 'component', condition: true, attributes: [{ id: 'fuel', label: 'Fuel Source', values: ['Gas', 'Oil', 'Electric'] }, { id: 'age', label: 'Age', values: ['0-5', '6-15'] }] },
          { id: 'hvac_dataplate', label: 'Data Plate', kind: 'component', condition: false, attributes: [{ id: 'model', label: 'Model number', values: [] }] },
          { id: 'hvac_flue', label: 'Flue', kind: 'component', condition: true },
        ] },
      ] },
    ] };
    let wd = T.createDraft({ companyId: 'co_1', templateId: 'tpl_ws', live: clone(WS), now: 1 });
    const wstep = (o, now) => { const x = E.applyManual(wd, o, OWNER, now); if (x.ok) wd = x.draft; return x; };
    const nodeOf = id => E.locate(wd.tree, id).node;
    // rules: what the editor writes is exactly what inspections run
    const one = RM.writeRule([{ field: 'hvac_heating::fuel', values: ['Gas'], typed: false }]);
    const two = RM.writeRule([{ field: 'hvac_heating::fuel', values: ['Gas', 'Oil'], typed: true }, { field: 'hvac_heating::age', values: ['0-5'], typed: false }]);
    r('rules: every rule the editor writes passes the runtime compiler and the op validator',
      [one, two].every(x => TR.ruleShapeError(x) === null && TO.checkPredicate(x) === null) && RM.writeRule([]) === null
      && RM.writeRule([{ field: 'hvac_heating::fuel', values: [], typed: false }]) === null);
    r('rules: what is written reads back as the same conditions',
      JSON.stringify(RM.readRule(two)) === JSON.stringify({ ok: true, conditions: [{ field: 'hvac_heating::fuel', values: ['Gas', 'Oil'], typed: true }, { field: 'hvac_heating::age', values: ['0-5'], typed: false }] })
      && RM.readRule(undefined).ok && RM.readRule(undefined).conditions.length === 0);
    r('rules: a shape the runtime cannot run is shown as unreadable, never rewritten',
      RM.readRule({ any: [{ field: 'a::b', anyOf: ['x'] }, { field: 'c::d', anyOf: ['y'] }] }).ok === false && RM.readRule({ any: [{ all: [] }] }).ok === false);
    r('rules: an item is never offered its own fields, and set-aside items are not offered',
      RM.ruleFields(wd.tree, 'hvac_heating').every(f => f.nodeId !== 'hvac_heating') && RM.ruleFields(wd.tree).some(f => f.field === 'hvac_heating::fuel'));
    const aw = wstep(E.ops.applicability(nodeOf('hvac_flue'), one, 'hide'), 10);
    r('applicability: a rule and "hide until answered" reach the draft through one manual change set',
      aw.ok && JSON.stringify(nodeOf('hvac_flue').appliesWhen) === JSON.stringify(one) && nodeOf('hvac_flue').whenUnknown === 'hide');
    const awClear = wstep(E.ops.applicability(nodeOf('hvac_flue'), null, 'hide'), 11);
    r('applicability: removing the rule removes "hide until answered" with it', awClear.ok && nodeOf('hvac_flue').appliesWhen === undefined && nodeOf('hvac_flue').whenUnknown === undefined);
    r('applicability: a rule on the item\'s own answer is refused, and the draft is unchanged',
      (() => { const before = JSON.stringify(wd.tree); const x = E.applyManual(wd, E.ops.applicability(nodeOf('hvac_heating'), one, null), OWNER, 12); return !x.ok && JSON.stringify(wd.tree) === before; })());
    // requirements: built over the shared contract, judged by it on every edit
    const q1 = QM.newRequirement(wd.tree, nodeOf('hvac_heating'), 'Fuel recorded');
    const qa = wstep(E.ops.setRequirements('hvac_heating', [q1]), 20);
    r('requirements: a new requirement is a valid COMPANY requirement on its own item, and the draft takes it',
      qa.ok && q1.origin === 'company' && /^rq_[a-z0-9_]+$/.test(q1.id) && q1.subject.nodeId === 'hvac_heating' && q1.unmet.exception === 'not_allowed'
      && QM.requirementsOf(nodeOf('hvac_heating')).length === 1 && QM.requirementIssues(wd.tree).filter(i => i.severity === 'error').length === 0);
    const q2 = QM.newRequirement(wd.tree, nodeOf('hvac_heating'), 'Fuel recorded');
    r('requirements: ids stay unique across the template', q2.id !== q1.id);
    const meth = QM.methodsFor(nodeOf('hvac_heating'));
    const fuel = meth.find(m => m.label === 'Specification — Fuel Source'), photo = meth.find(m => m.clause.kind === 'evidence' && m.clause.media === 'photo');
    const anyS = QM.writeSatisfy('any', [fuel.clause, photo.clause]), allS = QM.writeSatisfy('all', [fuel.clause, photo.clause]);
    r('requirements: ANY is one group of alternatives, ALL is one group per method, and both read back',
      anyS.all.length === 1 && anyS.all[0].any.length === 2 && allS.all.length === 2 && allS.all.every(g => g.any.length === 1)
      && JSON.stringify(QM.readSatisfy({ ...q1, satisfy: anyS }, meth)) === JSON.stringify({ ok: true, mode: 'any', keys: [fuel.key, photo.key] })
      && JSON.stringify(QM.readSatisfy({ ...q1, satisfy: allS }, meth)) === JSON.stringify({ ok: true, mode: 'all', keys: [fuel.key, photo.key] }));
    r('requirements: an item that is not assessed is never offered a condition assessment',
      !QM.methodsFor(nodeOf('hvac_dataplate')).some(m => m.clause.kind === 'assessment') && meth.some(m => m.clause.kind === 'assessment'));
    const refusedIs = (defs) => { const before = JSON.stringify(wd.tree); const x = E.applyManual(wd, E.ops.setRequirements('hvac_heating', defs), OWNER, 30); return !x.ok && JSON.stringify(wd.tree) === before; };
    r('requirements: the contract refuses an exception (not built), and the draft is unchanged', refusedIs([{ ...q1, unmet: { limitation: 'resolves', exception: 'allowed' } }]));
    r('requirements: the contract refuses another item\'s records', refusedIs([{ ...q1, satisfy: { all: [{ any: [{ kind: 'fields', nodeId: 'hvac_dataplate', fields: [{ attr: 'model', key: 'hvac_dataplate::model', label: 'Model' }] }] }] } }]));
    r('requirements: a draft carrying any is flagged for the publish refusal', QM.carriedRequirements(wd.tree).length === 1);
    const qc = wstep(E.ops.setRequirements('hvac_heating', []), 40);
    r('requirements: removing the last one removes the field, so the template publishes as before', qc.ok && nodeOf('hvac_heating').requirements === undefined && QM.carriedRequirements(wd.tree).length === 0);

    {
    // ── an item's three switches: Condition, Details, Requirements (2026-10-27 (second)) ──────────────────────
    {
      const SW = { id: 'sw_1', name: 'Switches', version: 1, systems: [{ id: 'heating', label: 'Heating', kind: 'system', children: [
        { id: 'heating__vent', label: 'Vent', kind: 'component', condition: true, attributes: [{ id: 'material', label: 'Material', values: ['PVC', 'B-vent'], multi: false }] },
        { id: 'heating__locked', label: 'Locked', kind: 'component', condition: true, attributes: [{ id: 'spec', label: 'Type', values: ['A', 'B'], legacyBareKey: true }] },
      ] }] };
      let sd = T.createDraft({ companyId: 'co_1', templateId: 'sw_1', live: clone(SW), now: 7000 });
      const vn = () => E.locate(sd.tree, 'heating__vent').node;
      const apply = (o, t) => { const x = E.applyManual(sd, o, OWNER, t); if (x.ok) sd = x.draft; return x; };
      const attrsBefore = JSON.stringify(vn().attributes);
      const off = apply(E.ops.switchDetails(vn(), false), 7100);
      r('switches: Details OFF removes the fields from the item and keeps them, hidden (parked)', off.ok && !vn().attributes?.length && JSON.stringify(vn().parked?.attributes) === attrsBefore);
      const on = apply(E.ops.switchDetails(vn(), true), 7200);
      r('switches: Details ON restores the same fields exactly and leaves nothing parked', on.ok && JSON.stringify(vn().attributes) === attrsBefore && vn().parked === undefined);
      r('switches: nothing to park or restore is no change at all', E.ops.switchDetails({ id: 'x', label: 'X', kind: 'component' }, true).length === 0 && E.ops.switchDetails({ id: 'x', label: 'X', kind: 'component' }, false).length === 0);
      // AC System Type's case: a field whose answers keep Ledrix's old storage key round-trips through the switch too.
      const lk = () => E.locate(sd.tree, 'heating__locked').node, lkBefore = JSON.stringify(lk().attributes);
      const lkOff = apply(E.ops.switchDetails(lk(), false), 7050);
      const lkOn = lkOff.ok && apply(E.ops.switchDetails(lk(), true), 7060);
      r('switches: a field kept under Ledrix’s own storage key switches off and back on, unchanged (marker kept)',
        lkOff.ok && lkOn && lkOn.ok && JSON.stringify(lk().attributes) === lkBefore && lk().parked === undefined, JSON.stringify([lkOff.ok, lkOn && lkOn.ok, lkOn && lkOn.error]));
      apply(E.ops.assessed('heating__vent', false), 7300); apply(E.ops.switchDetails(vn(), false), 7400);
      r('switches: Condition, Details and Requirements all off → the item records nothing (hidden on the phone) and its summary says so',
        E.recordsNothingHere(vn()) && /hidden from inspectors/.test(E.itemSummary(vn())));
      apply(E.ops.assessed('heating__vent', true), 7500);
      r('switches: any one on → it records something again', !E.recordsNothingHere(vn()));
    }
    // ── "Also show in…" (2026-10-27): one record, linked into other systems ──────────────────────────────────────
    {
      const LT = { id: 'lk_1', name: 'Links', version: 1, systems: [
        { id: 'heating', label: 'Heating', kind: 'system', children: [{ id: 'heating__tstat', label: 'Thermostat', kind: 'component', condition: true }] },
        { id: 'cooling', label: 'Cooling', kind: 'system', children: [{ id: 'cooling__coil', label: 'Coil', kind: 'component', condition: true }] },
      ] };
      let ld = T.createDraft({ companyId: 'co_1', templateId: 'lk_1', live: clone(LT), now: 8000 });
      const app = (o, t) => { const x = E.applyManual(ld, o, OWNER, t); if (x.ok) ld = x.draft; return x; };
      const tstat = () => E.locate(ld.tree, 'heating__tstat').node;
      const on = app(E.ops.showIn(ld.tree, tstat(), 'cooling'), 8100);
      const links = E.linksOf(ld.tree, 'heating__tstat');
      const ptr = links[0] && E.locate(ld.tree, links[0].pointerId);
      r('show in: the item appears in the other system as a link — one record, no copy of its answers',
        on.ok && links.length === 1 && links[0].systemId === 'cooling' && ptr?.system.id === 'cooling'
        && ptr.node.pointsTo?.nodeId === 'heating__tstat' && ptr.node.attributes === undefined && ptr.node.condition === undefined);
      const off = app(E.ops.unlink(links[0].pointerId), 8200);
      r('show in: switching it off removes the link and leaves the item untouched',
        off.ok && E.linksOf(ld.tree, 'heating__tstat').length === 0 && JSON.stringify(ld.tree.systems[0]) === JSON.stringify(LT.systems[0]));
    }
    // ── publish fixes: every blocker opens its exact place (2026-10-27) ──────────────────────────────────────────
    {
      const PF = await import(pathToFileURL(join(dir, 'publishFixes.ts')).href);
      const VT = await import(pathToFileURL(join(dir, 'core', 'templateValidate.ts')).href);
      const REQ = { id: 'rq_1', origin: 'company', level: 'recommended', subject: { nodeId: 'heating__tstat' }, satisfy: { all: [{ any: [{ kind: 'photo' }] }] }, unmet: { exception: 'not_allowed' } };
      const FX = { id: 'fx_1', name: 'Fixes', version: 1, systems: [
        { id: 'heating', label: 'Heating', kind: 'system', children: [
          { id: 'heating__ctl', label: 'Controls', kind: 'subsystem', children: [{ id: 'heating__tstat', label: 'Thermostat', kind: 'component', condition: true, requirements: [REQ] }] },
          { id: 'heating__loose', label: 'Loose', kind: 'component', condition: true },
        ] },
        { id: 'cooling', label: 'Cooling', kind: 'system', children: [{ id: 'cooling__coil', label: 'Coil', kind: 'component', condition: true, appliesWhen: { field: 'nope::x', anyOf: ['A'] } }] },
      ] };
      const fx = PF.publishFixes(FX, VT.validateTemplate(FX), { errors: [], warnings: [] });
      const req = fx.find(f => f.key === 'req:heating__tstat'), rule = fx.find(f => f.go.nodeId === 'cooling__coil'), loose = fx.find(f => f.key === 'u:heating__loose');
      r('publish fixes: an item requirement no longer holds Publish (Stage 2 — the phone checks it, soft)', !req && !fx.some(f => f.key.startsWith('req:heating')));
      r('publish fixes: a broken rule opens its item on the Applicability tab, and blocks', !!rule && rule.blocks && rule.go.systemId === 'cooling' && rule.go.tab === 'applicability');
      r('publish fixes: an item inspectors won’t see opens it, and does not block', !!loose && !loose.blocks && loose.go.nodeId === 'heating__loose');
      r('publish fixes: blockers come first', fx.findIndex(f => !f.blocks) > fx.findLastIndex(f => f.blocks));
      const RM = await import(pathToFileURL(join(dir, 'requirementModel.ts')).href);
      r('publish fixes: a change to Ledrix’s default requirements still holds Publish', RM.unpublishableRequirements({ ...FX, requirementOverrides: { x: { level: 'optional' } } }).length === 1 && RM.unpublishableRequirements(FX).length === 0);
      r('readings: an item can ask for a reading its system takes (Water Heater → Hot Water Temperature)', RM.methodsFor({ id: 'n', label: 'N', kind: 'component' }, 'water_heater').some(m => m.clause.kind === 'measurement' && m.clause.point === 'hot_water_temp')
        && !RM.methodsFor({ id: 'n', label: 'N', kind: 'component' }, 'roofing').some(m => m.clause.kind === 'measurement'));
    }
    // ── property types (2026-10-27): a label and a filter on the template ─────────────────────────────────────
    {
      let pd = T.createDraft({ companyId: 'co_1', templateId: 'pt_1', live: clone(LIVE), now: 9500 });
      const a = E.applyManual(pd, E.ops.propertyTypes(['multi_unit_one', 'single_family']), OWNER, 9600); if (a.ok) pd = a.draft;
      r('property types: a pick is saved on the template', a.ok && JSON.stringify(pd.tree.propertyTypes) === JSON.stringify(['multi_unit_one', 'single_family']));
      const bad = E.applyManual(pd, [{ op: 'setTemplateField', field: 'propertyTypes', value: ['castle'] }], OWNER, 9700);
      r('property types: an unknown property type is refused', !bad.ok);
      const clear = E.applyManual(pd, E.ops.propertyTypes([]), OWNER, 9800);
      r('property types: clearing every pick removes the field', clear.ok && clear.draft.tree.propertyTypes === undefined);
    }
    // ── template creation: starting points (2026-10-27) ──────────────────────────────────────────────────────
    {
      const S = await import(pathToFileURL(join(dir, 'startingPoints.ts')).href);
      const BASE = { id: 'internachi', name: 'Ledrix Default', version: 1, systems: [{ id: 'roofing', label: 'Roofing', kind: 'system', children: [{ id: 'r1', label: 'Covering', kind: 'component' }] }] };
      const FOUR = { id: 'fourpoint', name: '4-Point', version: 1, systems: [{ id: 'roofing', label: 'Roofing', kind: 'system', defaultActive: true, children: [] }, { id: 'attic', label: 'Attic', kind: 'system', defaultActive: false, children: [] }] };
      const MINE = { id: 't1', name: 'Our 4-Point', base: 'fourpoint', updatedAt: null, rowVersion: 2, tree: clone(FOUR) };
      const TYPES = [{ id: 'it1', name: '4-Point', templateId: 't1', rowVersion: 1, stock: false }];
      const ctx = (o = {}) => ({ jurisdictions: [], services: [], affiliations: [], standards: [], licensing: null, notes: '', ...o });
      const pts = (c, extra = {}) => S.startingPoints({ context: c, templates: [MINE], types: TYPES, ledrixDefault: BASE, ledrixFourPoint: FOUR, ...extra });
      const full = ctx({ jurisdictions: ['ID'], services: ['home', 'four_point'], affiliations: ['internachi'], standards: ['internachi_sop', 'state_sop'], licensing: 'varies', notes: 'Sewer scope pre-1980' });
      const all = [...pts(ctx()), ...pts(full), ...pts(ctx({ services: ['home'] }))];
      r('create: requirements coverage is NOT EVALUATED on every starting point, whatever the company declared', all.every(p => p.coverage.state === 'not_evaluated' && /^Not evaluated/.test(p.coverage.text)));
      r('create: no recommendation when Ledrix knows nothing that points to one', !pts(ctx()).some(p => p.recommended) && !pts(ctx({ standards: ['internachi_sop'], jurisdictions: ['ID'] })).some(p => p.recommended));
      const f = pts(full);
      r('create: one recommendation at most — the company’s own template already used for a selected service wins',
        f.filter(p => p.recommended).length === 1 && f.find(p => p.recommended).key === 'company:t1' && f.find(p => p.key === 'company:t1').reasons.some(x => /already uses it for 4-Point/.test(x)));
      r('create: without such a template, the Ledrix template built for the selected service is recommended',
        pts(ctx({ services: ['home'] })).find(p => p.recommended)?.key === 'ledrix_default');
      r('create: reasons cite only services and how the company uses its templates — never standards, licensing or jurisdiction',
        all.flatMap(p => p.reasons).every(x => !/standard|licens|Idaho|\bID\b|InterNACHI|ASHI|complian/i.test(x)));
      r('create: what the company declared becomes things to check itself, never a claim of coverage',
        f[0].review.length === 4 && f[0].review.every(x => !/\bcovered\b|complian|meets|satisf/i.test(x)) && f[0].review.some(x => /haven’t been evaluated/.test(x)));
      r('create: Ledrix templates appear only when they are available', !pts(ctx(), { ledrixDefault: null, ledrixFourPoint: null }).some(p => p.kind.startsWith('ledrix')));
      const src = clone(BASE), before = JSON.stringify(src), fk = S.forkTree(src, 'Acme Home');
      fk.systems[0].label = 'Changed';
      r('create: a starting tree is copied — the source is never changed, and the copy is the company’s own (id custom, its name)',
        JSON.stringify(src) === before && fk.id === 'custom' && fk.name === 'Acme Home');
      // ── the kind of home (owner rulings 2026-11-05) — over the REAL Ledrix Default the page loads ──
      const SH = await import(pathToFileURL(join(dir, 'core/specialHomes.ts')).href);
      const DEF = JSON.parse(readFileSync(join(ROOT, 'lib/templates/baselines/ledrixDefault.json'), 'utf8'));
      const defBytes = JSON.stringify(DEF);
      const realPts = (c) => S.startingPoints({ context: c, templates: [], types: [], ledrixDefault: DEF, ledrixFourPoint: null });
      const ncCard = realPts(ctx({ services: ['new_construction'] })).find(p => p.key === 'ledrix_new_construction');
      const defCard = realPts(ctx()).find(p => p.key === 'ledrix_default');
      r('kind of home: "Ledrix New Construction" is its own card — the base plus 10 — recommended when the company offers new construction',
        !!ncCard && ncCard.recommended && ncCard.componentCount === defCard.componentCount + 10 && !realPts(ctx({ services: ['home'] })).find(p => p.key === 'ledrix_new_construction').recommended && !realPts(ctx()).find(p => p.key === 'ledrix_new_construction').recommended);
      const activeSpecial = (t) => SH.SPECIAL_HOMES.filter(e => SH.specialRows(t, { id: e.system }, DEF).find(x => x.id === e.id)?.inTemplate).map(e => e.id).sort();
      const choice = (o = {}) => ({ ...S.EMPTY_KIND_CHOICE, ...o });
      const p1 = S.kindPlan('ledrix_default', choice({ propertyTypes: ['manufactured'], also: ['older'], unticked: ['hvac_older_steam_boiler', 'foundation_manufactured_marriage_line'] }));
      const b1 = S.buildStarterTree('ledrix_default', S.forkTree(DEF, 'Manufactured'), DEF, choice({ propertyTypes: ['manufactured'], also: ['older'], unticked: ['hvac_older_steam_boiler', 'foundation_manufactured_marriage_line'] }));
      r('kind of home: Manufactured + Older with two unticked → the draft is the base plus exactly the other 20, and the cutoff year is stored',
        p1.kinds.join() === 'manufactured,older' && p1.ticked.length === 20 && b1.ok && JSON.stringify(activeSpecial(b1.tree)) === JSON.stringify([...p1.ticked].sort())
        && b1.tree.olderCutoffYear === 1950 && !b1.tree.associationNotInspected && JSON.stringify(DEF) === defBytes);
      const b2 = S.buildStarterTree('ledrix_new_construction', S.forkTree(DEF, 'NC'), DEF, choice());
      r('kind of home: the New Construction card → the base plus exactly its 10', b2.ok && JSON.stringify(activeSpecial(b2.tree)) === JSON.stringify(SH.starterCheckpoints(['new_construction']).map(e => e.id).sort()));
      const b3 = S.buildStarterTree('ledrix_default', S.forkTree(DEF, 'Condo'), DEF, choice({ propertyTypes: ['condo_townhome'], associationPremark: true }));
      const b4 = S.buildStarterTree('ledrix_default', S.forkTree(DEF, 'Condo'), DEF, choice({ propertyTypes: ['condo_townhome'] }));
      const b5 = S.buildStarterTree('ledrix_default', S.forkTree(DEF, 'House'), DEF, choice({ propertyTypes: ['single_family'], associationPremark: true }));
      r('kind of home: Condo adds no checkpoints; the association pre-mark is stored only when the company ticks it, and only for a condo template',
        b3.ok && activeSpecial(b3.tree).length === 0 && JSON.stringify(b3.tree.associationNotInspected) === JSON.stringify(['roofing', 'foundation', 'exterior'])
        && b4.ok && !b4.tree.associationNotInspected && b5.ok && !b5.tree.associationNotInspected);
      const b6 = S.buildStarterTree('company', S.forkTree(DEF, 'Mine'), DEF, choice({ propertyTypes: ['manufactured'], also: ['older', 'log'] }));
      r('kind of home: a copy of the company’s own template is not asked (nothing added)', b6.ok && activeSpecial(b6.tree).length === 0 && !b6.tree.olderCutoffYear);
      // ── strictly what was picked (owner 2026-11-05, mockup HANP7FdGGVT542cfPt4YaU) ──
      const anySpecial = (t) => { const out = []; const w = (n) => { if (SH.SPECIAL_HOMES.some(e => e.id === n.id)) out.push(n.id); (n.children ?? []).forEach(w); (n.trimmed ?? []).forEach(w); }; t.systems.forEach(w); (t.trimmedSystems ?? []).forEach(w); return out.sort(); };
      const specialGroups = (t) => { let n = 0; const w = (x) => { if (x.kind !== 'component' && /special/i.test(x.label ?? '')) n++; (x.children ?? []).forEach(w); (x.trimmed ?? []).forEach(w); }; t.systems.forEach(w); return n; };
      r('only what you pick: a single-family template holds no special-home checkpoint at all — none active, none switched off, no Special homes group',
        b5.ok && anySpecial(b5.tree).length === 0 && specialGroups(b5.tree) === 0 && SH.templateKinds(b5.tree).length === 0 && b5.tree.alsoKinds === undefined, anySpecial(b5.ok ? b5.tree : DEF).slice(0, 4).join());
      r('only what you pick: Manufactured + Older holds exactly its ticked checkpoints (the unticked are not kept switched off) and remembers Older',
        b1.ok && JSON.stringify(anySpecial(b1.tree)) === JSON.stringify([...p1.ticked].sort()) && JSON.stringify(b1.tree.alsoKinds) === JSON.stringify(['older'])
        && SH.templateKinds({ ...b1.tree, propertyTypes: ['manufactured'] }).join() === 'manufactured,older');   // the page stores propertyTypes on the fork first
      r('only what you pick: the New Construction card remembers new construction; a legacy cutoff year still counts as Older',
        b2.ok && JSON.stringify(b2.tree.alsoKinds) === JSON.stringify(['new_construction']) && SH.templateKinds({ olderCutoffYear: 1950 }).join() === 'older'
        && SH.templateKinds({}).length === 0 && SH.templateKinds({ propertyTypes: ['multi_unit_many'], alsoKinds: ['log'] }).join() === 'multi_unit,log');
      r('only what you pick: switching a kind off names exactly its active checkpoints', b1.ok && SH.activeKindCheckpoints(b1.tree, 'older').length > 0
        && SH.activeKindCheckpoints(b1.tree, 'older').every(id => SH.SPECIAL_HOMES.find(e => e.id === id)?.kind === 'older') && SH.activeKindCheckpoints(b1.tree, 'log').length === 0);
      const p7 = S.kindPlan('ledrix_default', choice({ propertyTypes: ['multi_unit_one'], also: ['log'] }));
      r('kind of home: multi-unit + log → those two kinds, every checkpoint ticked to start', p7.kinds.join() === 'multi_unit,log' && p7.ticked.length === 20);
      r('create: the blank start has no systems; every card reports real counts from its tree',
        pts(ctx()).find(p => p.kind === 'blank').tree.systems.length === 0 && f.find(p => p.key === 'ledrix_fourpoint').systems.join() === 'Roofing' && f.find(p => p.key === 'ledrix_default').componentCount === 1);
    }
    // ── the equipment component catalog (owner rulings 2026-10-26) ──────────────────────────────────────────
    const C = await import(pathToFileURL(join(dir, 'catalogModel.ts')).href);
    const EC = await import(pathToFileURL(join(dir, 'core/equipmentCatalog.ts')).href);
    const FUEL = ['Gas Furnace', 'Electric Heat', 'Heat Pump', 'Ductless Mini-Split', 'Propane', 'Oil Furnace', 'Boiler', 'Radiant Heat'];
    const HEAT = { id: 'cat_1', name: 'Catalog', version: 1, systems: [{ id: 'heating', label: 'Heating', kind: 'system', children: [
      { id: 'heating__plant', label: 'Heating Plant', kind: 'subsystem', children: [
        { id: 'hvac_heating', label: 'Heating System', kind: 'component', condition: false, attributes: [{ id: 'fuel_source', label: 'Fuel Source', values: FUEL }] },
        { id: 'hvac_burner', label: 'Burner / Flame', kind: 'component', condition: true },
      ] },
      { id: 'heating__air', label: 'Air Handling', kind: 'subsystem', children: [{ id: 'hvac_filter', label: 'Filter', kind: 'component', condition: true }] },
    ] }] };
    let cdr = T.createDraft({ companyId: 'co_1', templateId: 'cat_1', live: clone(HEAT), now: 5000 });
    const sysOf = () => cdr.tree.systems[0];
    const rowsOf = (t) => C.catalogRows(sysOf(), t).flatMap(g => g.rows);
    const row = (t, id) => rowsOf(t).find(x => x.component.id === id);
    r('catalog: nothing is picked until the company picks it (catalogOps with no picks adds nothing)', C.catalogOps(cdr.tree, sysOf(), 'gas_furnace', []).length === 0);
    r('catalog: an item the template already has is recognised by name, so it is not added twice',
      row('gas_furnace', 'burner').present === 'Burner / Flame' && row('gas_furnace', 'filter').present === 'Filter' && !row('gas_furnace', 'inducer').present);
    r('catalog: readings and data plates are listed but not addable while the phone cannot collect evidence',
      row('gas_furnace', 'supplytemp').evidenceOnly && row('gas_furnace', 'plate').evidenceOnly && !row('gas_furnace', 'vent').evidenceOnly);
    const picks = [
      { id: 'inducer', condition: true, details: false }, { id: 'vent', condition: true, details: true },
      { id: 'burner', condition: true, details: false },          // already present — skipped
      { id: 'plate', condition: true, details: false },           // evidence — skipped even with Condition on
      { id: 'plenum', condition: false, details: true },          // Details only — added, Condition stored OFF
      { id: 'blower', condition: false, details: false },         // records nothing — skipped
    ];
    const cops = C.catalogOps(cdr.tree, sysOf(), 'gas_furnace', picks);
    const before = cdr.log.length;
    const ca = E.applyManual(cdr, cops, OWNER, 6000); if (ca.ok) cdr = ca.draft;
    const grp = (sysOf().children ?? []).find(n => n.catalogRef === 'gas_furnace');
    const kids = grp?.children ?? [];
    const vent = kids.find(n => n.catalogRef === 'gas_furnace.vent'), ind = kids.find(n => n.catalogRef === 'gas_furnace.inducer'), plen = kids.find(n => n.catalogRef === 'gas_furnace.plenum');
    r('catalog: the picks apply as ONE validated change set (one undo)', ca.ok && cdr.log.length === before + 1);
    r('catalog: on a system with groups they land in one group named for the equipment type', !!grp && grp.kind === 'subsystem' && grp.label === 'Gas furnace' && kids.length === 3);
    r('catalog: only real picks are added — present, evidence and record-nothing picks are skipped', kids.every(n => ['gas_furnace.vent', 'gas_furnace.inducer', 'gas_furnace.plenum'].includes(n.catalogRef)));
    r('catalog: Condition OFF is stored as an explicit false (the app reads a missing value as ON)', plen?.condition === false && plen.attributes?.[0]?.label === 'Material');
    r('catalog: Condition is written explicitly, and Details becomes one choice field with the catalog label',
      ind?.condition === true && !ind.attributes && vent?.condition === true && vent.attributes?.length === 1 && vent.attributes[0].label === 'Material'
      && vent.attributes[0].values.join('|') === EC.catalogComponent('gas_furnace.vent').component.details.join('|') && vent.attributes[0].multi === false);
    r('catalog: each component applies only to its equipment ("Heating System is Gas Furnace or Propane")',
      JSON.stringify(ind?.appliesWhen) === JSON.stringify({ field: 'hvac_heating::fuel_source', anyOf: ['Gas Furnace', 'Propane'] }));
    r('catalog: new ids start with the system and are unique', kids.every(n => n.id.startsWith('heating__')) && new Set(kids.map(n => n.id)).size === kids.length);
    r('catalog: once added, a component reads as already in the template', row('gas_furnace', 'vent').present === 'Vent connector / flue' && C.catalogOps(cdr.tree, sysOf(), 'gas_furnace', [picks[1]]).length === 0);
    const more = E.applyManual(cdr, C.catalogOps(cdr.tree, sysOf(), 'gas_furnace', [{ id: 'gasvalve', condition: true, details: false }]), OWNER, 6100);
    r('catalog: a later pick joins the same equipment group (no second group)', more.ok && (more.draft.tree.systems[0].children ?? []).filter(n => n.catalogRef === 'gas_furnace').length === 1);
    const flat = { id: 'f', name: 'F', version: 1, systems: [{ id: 'heating', label: 'Heating', kind: 'system', children: [{ id: 'heating__furnace', label: 'Furnace', kind: 'component', condition: true }] }] };
    const fops = C.catalogOps(flat, flat.systems[0], 'heat_pump', [{ id: 'compressor', condition: true, details: false }]);
    r('catalog: a system with items but no groups gets items directly (a new group would hide its items)',
      fops.length === 1 && fops[0].parentId === 'heating' && fops[0].node.kind === 'component' && fops[0].node.appliesWhen === undefined);
    r('catalog: no rule is written when the template has no field to tell the equipment apart', fops[0].node.appliesWhen === undefined);
    const COMB = ['combustion', 'gas', 'oil', 'oilburner'];
    const noComb = ['electric_furnace', 'heat_pump', 'electric_boiler', 'mini_split'].every(t => EC.catalogType(t).groups.every(g => !COMB.includes(g.id)));
    const noAir = ['gas_boiler', 'oil_boiler', 'electric_boiler', 'mini_split'].every(t => EC.catalogType(t).groups.every(g => g.id !== 'air' && g.components.every(c => c.id !== 'filter' && c.id !== 'blower')));
    r('catalog content: no combustion or fuel supply on equipment that burns nothing; no air handling on boilers or mini-splits', noComb && noAir);
    r('catalog content: every type has electrical & controls, starts its readings as evidence, and has unique component ids',
      EC.EQUIPMENT_CATALOG.length === 8 && EC.EQUIPMENT_CATALOG.every(t => t.groups.some(g => g.id === 'electrical')
        && t.groups.flatMap(g => g.components).filter(c => c.kind === 'reading').every(c => c.reading?.units?.length && c.caption)
        && new Set(t.groups.flatMap(g => g.components.map(c => c.id))).size === t.groups.flatMap(g => g.components).length));
    // ── suggestions inside each type's list (owner 2026-11-05, mockup DbUgEVKPbCeigN6G8YTaAL) ──
    const FIELD = 'hvac_heating::fuel_source', ids = (ts) => ts.map(t => t.id).join();
    const oldTree = clone(cdr.tree); oldTree.systems[0].children[0].children[0].attributes[0].values = FUEL.filter(v => v !== 'Ductless Mini-Split');
    r('suggest: an answer maps to its equipment (Gas Furnace and Propane → gas furnace; Boiler → the three boilers; Ductless Mini-Split → mini-split, nothing under another field)',
      ids(C.catalogTypesForAnswer(cdr.tree, sysOf(), FIELD, 'Gas Furnace')) === 'gas_furnace' && ids(C.catalogTypesForAnswer(cdr.tree, sysOf(), FIELD, 'Propane')) === 'gas_furnace'
      && ids(C.catalogTypesForAnswer(cdr.tree, sysOf(), FIELD, 'Boiler')) === 'gas_boiler,oil_boiler,electric_boiler'
      && ids(C.catalogTypesForAnswer(cdr.tree, sysOf(), FIELD, 'Ductless Mini-Split')) === 'mini_split' && ids(C.catalogTypesOffField(cdr.tree, sysOf(), FIELD)) === ''
      && ids(C.catalogTypesOffField(oldTree, oldTree.systems[0], FIELD)) === '');
    r('suggest: under the mini-split chip Heating suggests only what Cooling does not check (the outdoor defrost drain)',
      C.suggestionsFor(sysOf(), [EC.catalogType('mini_split')]).map(x => x.component.id).join() === 'odrain');
    const gf = [EC.catalogType('gas_furnace')], sug = () => C.suggestionsFor(sysOf(), gf).map(x => x.component.id);
    r('suggest: only parts the template lacks — nothing already there, no readings or data plates',
      !sug().includes('burner') && !sug().includes('vent') && !sug().includes('plate') && !sug().includes('supplytemp') && sug().includes('condensate') && sug().includes('ignition'));
    const sBefore = cdr.log.length;
    const sa = E.applyManual(cdr, C.suggestOps(cdr.tree, sysOf(), 'gas_furnace', ['ignition', 'condensate']), OWNER, 6200); if (sa.ok) cdr = sa.draft;
    const sg = (sysOf().children ?? []).find(n => n.catalogRef === 'gas_furnace');
    const ign = (sg?.children ?? []).find(n => n.catalogRef === 'gas_furnace.ignition'), cond = (sg?.trimmed ?? []).find(n => n.catalogRef === 'gas_furnace.condensate');
    r('suggest: a Typical part is added switched on, an If-present part switched off (offered on site) — one change set, with the equipment rule',
      sa.ok && cdr.log.length === sBefore + 1 && !!ign && !(sg?.children ?? []).some(n => n.catalogRef === 'gas_furnace.condensate') && !!cond
      && JSON.stringify(cond.appliesWhen) === JSON.stringify({ field: FIELD, anyOf: ['Gas Furnace', 'Propane'] }));
    r('suggest: a switched-off part is still in the template, so it is not suggested again', !sug().includes('condensate') && !sug().includes('ignition'));
    const mt = C.catalogMatches(sysOf(), gf);
    r('suggest: the template\'s own matching items are tagged by how Ledrix lists them (Burner / Flame is Typical)', mt.hvac_burner === 'typical' && mt[ind.id] === 'if_present' && !mt.hvac_heating);
    }
  } catch (e) {
    r(`desktop scenario completed (${e?.message})`, false);
  }
  return results;
}

// ── BUILT BY TYPE (owner 2026-11-05, approved mockup RUWz7xuKn2qPkq22eFEMS9) ─────────────────────────────────────────
// Run on the REAL Ledrix Default. The expected per-type item sets are read straight from the pack's own rules (the
// generated ledrixRules.json), not from the module under test; the phone's verdict is the preview's rulesFor +
// itemApplies (templateRules + applicability, byte copies of the app's).
const DEFAULT_TREE = JSON.parse(read('lib/templates/baselines/ledrixDefault.json'));
const PACK_RULES = JSON.parse(read('lib/templateBuilder/core/ledrixRules.json')).nodes;
async function runTypes(files) {
  const dir = stage(files);
  const E = await import(pathToFileURL(join(dir, 'editorModel.ts')).href);
  const TL = await import(pathToFileURL(join(dir, 'typeLayout.ts')).href);
  const PM = await import(pathToFileURL(join(dir, 'phonePreviewModel.ts')).href);
  const T = await import(pathToFileURL(join(dir, 'core/templateDraft.ts')).href);
  const results = {};
  const r = (k, v) => { results[k] = !!v; };
  const OWNER = { userId: 'u1', role: 'owner' };
  const KEY = 'hvac_cooling::spec';
  try {
    let d = T.createDraft({ companyId: 'co_1', templateId: 'tpl_1', live: clone(DEFAULT_TREE), now: 1000 });
    const step = (ops, now) => { const x = E.applyManual(d, ops, OWNER, now); if (x.ok) d = x.draft; return x; };
    const sys = id => d.tree.systems.find(s => s.id === id);
    const layout = id => TL.typeLayoutOf(d.tree, sys(id), PM.rulesFor(d.tree));
    // the phone's verdict for one item with ONLY the type answered
    const phoneShows = (tree, id, v) => PM.itemApplies(PM.rulesFor(tree), id, k => (k === KEY || k === 'hvac_cooling' ? v : undefined));
    const expand = (L, ns) => ns.flatMap(n => TL.copyGroupOf(L, n.id)?.items ?? [n]).map(n => n.id).sort();

    const L = layout('cooling');
    r('types: Cooling is laid out by its type question, AC System Type, with its six values',
      L && L.question.field === KEY && L.question.label === 'AC System Type'
      && L.question.values.join('|') === 'Split System|Package Unit|Ductless Mini-Split|Window / Wall AC|Heat Pump AC|Evaporative Cooler');
    const coolingItems = E.flatItems(sys('cooling')).map(x => x.node).filter(n => n.kind === 'component' && n.id !== 'hvac_cooling');
    const packFor = (id, v) => (PACK_RULES[id]?.requires ?? []).filter(p => p.specNodeId === KEY).every(p => p.includes.includes(v))
      && (PACK_RULES[id]?.requires ?? []).some(p => p.specNodeId === KEY);
    r('types: each Cooling type shows EXACTLY the items the pack gives it (copies expanded)', L && L.question.values.every(v =>
      JSON.stringify(expand(L, TL.itemsForType(L, v))) === JSON.stringify(coolingItems.filter(n => packFor(n.id, v)).map(n => n.id).sort())));
    r('types: items with no type rule are "Every cooling system"; Heat Pump and Backup Heat follow the heating answer in their own section',
      L && L.every.map(n => n.label).join('|') === 'AC Age|Thermostat'
      && L.other.map(o => `${o.node.label}<${o.question.label}`).join('|') === 'Heat Pump<Heating System Type|Backup Heat<Heating System Type');
    const H = layout('heating'), WH = layout('water_heater');
    r('types: Heating, Water Heater and Fireplace are laid out by type; a material list (Plumbing) and a system with no type question (Attic) keep the plain list',
      H?.question.label === 'Heating System Type' && WH?.question.label === 'Type & Fuel' && layout('fireplace')?.question.label === 'Fireplace Type'
      && layout('plumbing') === null && layout('attic') === null);
    const g = L && L.copies[0];
    r('types: Indoor Head 1–8 are ONE row (one per head, 1–8), listed under Ductless Mini-Split only',
      L && L.copies.length === 1 && g.items.length === 8 && g.items.every((n, i) => n.id === `hvac_ms_head_${i + 1}`) && /one per head \(1–8\)/.test(g.label)
      && TL.itemsForType(L, 'Ductless Mini-Split').filter(n => TL.copyGroupOf(L, n.id)).length === 1
      && L.question.values.filter(v => v !== 'Ductless Mini-Split').every(v => !TL.itemsForType(L, v).some(n => TL.copyGroupOf(L, n.id))));
    const nLog = d.log.length;
    const cp = step(TL.copiesOps(g, n => E.ops.describe(n.id, "Note the head's location and drain.")), 2000);
    r('types: editing the copies row changes every copy at once, as ONE change set (one undo)',
      cp.ok && d.log.length === nLog + 1 && Array.from({ length: 8 }, (_, i) => E.locate(d.tree, `hvac_ms_head_${i + 1}`).node.description).every(x => x === "Note the head's location and drain."));

    // a grid untick: Condenser no longer for Package Unit
    const t1 = TL.typeRuleOps(d.tree, layout('cooling'), ['hvac_condenser'], ['Split System', 'Ductless Mini-Split', 'Heat Pump AC']);
    const n1 = d.log.length; const a1 = t1.ok && step(t1.ops, 3000);
    const cond = E.locate(d.tree, 'hvac_condenser').node;
    r("types: a grid untick writes the item's appliesWhen through the validated op — one change set",
      a1 && a1.ok && d.log.length === n1 + 1 && JSON.stringify(cond.appliesWhen) === JSON.stringify({ field: KEY, anyOf: ['Split System', 'Ductless Mini-Split', 'Heat Pump AC'] }));
    const L2 = layout('cooling');
    r("types: after the untick the phone's resolver and the grid agree for EVERY type",
      L2.question.values.every(v => phoneShows(d.tree, 'hvac_condenser', v) === ['Split System', 'Ductless Mini-Split', 'Heat Pump AC'].includes(v))
      && L2.question.values.every(v => (L2.shows.hvac_condenser ?? []).includes(v) === phoneShows(d.tree, 'hvac_condenser', v)));
    // a rule on another field is kept beside the type clause
    const hp = 'cooling__link_hvac_heating';
    const t0 = TL.typeRuleOps(d.tree, L2, [hp], L2.question.values.filter(v => v !== 'Evaporative Cooler'));
    step(t0.ok ? t0.ops : [], 3050);
    const hpRule = E.locate(d.tree, hp).node.appliesWhen;
    r('types: a grid untick keeps the item\'s other rule (Heat Pump still follows the heating answer)',
      t0.ok && Array.isArray(hpRule?.all) && hpRule.all.some(c => c.field === 'hvac_heating::fuel_source') && hpRule.all.some(c => c.field === KEY));
    // an item with no Ledrix type rule becomes typed by a grid untick
    const t2 = TL.typeRuleOps(d.tree, L2, ['hvac_cooling_age'], L2.question.values.filter(v => v !== 'Evaporative Cooler'));
    step(t2.ok ? t2.ops : [], 3100);
    r('types: unticking a type for an every-type item narrows it for that type only (the phone agrees)',
      t2.ok && !phoneShows(d.tree, 'hvac_cooling_age', 'Evaporative Cooler') && phoneShows(d.tree, 'hvac_cooling_age', 'Split System')
      && layout('cooling').typed.some(n => n.id === 'hvac_cooling_age'));
    // ticking back every type Ledrix allows removes the company clause
    const t3 = TL.typeRuleOps(d.tree, layout('cooling'), ['hvac_condenser'], ['Split System', 'Package Unit', 'Ductless Mini-Split', 'Heat Pump AC']);
    step(t3.ok ? t3.ops : [], 3200);
    r('types: ticking back every type Ledrix allows removes the type rule again (no company rule left)',
      t3.ok && t3.ops.length > 0 && E.locate(d.tree, 'hvac_condenser').node.appliesWhen === undefined && phoneShows(d.tree, 'hvac_condenser', 'Package Unit'));
    // widening past Ledrix's own rule is refused
    const t4 = TL.typeRuleOps(d.tree, layout('cooling'), ['hvac_evaporator_coil'], ['Split System', 'Package Unit', 'Heat Pump AC', 'Ductless Mini-Split']);
    const t5 = TL.typeRuleOps(d.tree, layout('cooling'), ['hvac_condenser'], []);
    r("types: a type Ledrix's rule excludes cannot be ticked, and no item can be left with no type (refused, nothing written)",
      !t4.ok && /only for/.test(t4.reason) && !t5.ok);
    // + Add item for a type
    const add = TL.addForTypeOps(d.tree, sys('cooling'), layout('cooling'), 'Window / Wall AC', 'Window Seal');
    const na = d.log.length; const aa = step(add, 4000);
    const newId = add[0]?.node?.id;
    r('types: "+ Add item for <type>" adds ONE item that shows only for that type, hidden until the type is answered',
      aa.ok && d.log.length === na + 1 && !!newId
      && layout('cooling').question.values.every(v => phoneShows(d.tree, newId, v) === (v === 'Window / Wall AC'))
      && !PM.itemApplies(PM.rulesFor(d.tree), newId, () => undefined)
      && TL.itemsForType(layout('cooling'), 'Window / Wall AC').some(n => n.id === newId));
    // the preview follows the chosen type
    const ans = TL.previewAnswer(layout('cooling'), 'Ductless Mini-Split');
    const idx = PM.buildIndex(d.tree);
    const sv = PM.previewSpecValue(idx, { [ans.key]: [ans.value] }, {});
    const defs = PM.rulesFor(d.tree);
    const shown = PM.leavesOf(PM.tilesOf(sys('cooling'))[0], id => PM.itemApplies(defs, id, sv)).map(n => n.id);
    r("types: the preview, answered with the chosen type, shows that type's items and none of another type's",
      ans.key === KEY && ['hvac_condenser', 'hvac_ms_heads'].every(id => shown.includes(id))
      && ['hvac_evaporator_coil', 'hvac_win_operation', 'hvac_evap_pads'].every(id => !shown.includes(id)));

    // ── SECOND PASS (owner 2026-11-05, photo of Heating): "Every" means every; the tree shows sections only ──────────
    const fresh = clone(DEFAULT_TREE);
    const fdefs = PM.rulesFor(fresh);
    const ruleFree = id => { const x = fdefs.nodes[String(id).replace(/~i\d+$/, '')]; return !x || (!(x.requires ?? []).length && !x.dependsOnSpec); };
    const typedSystems = fresh.systems.map(s => [s, TL.typeLayoutOf(fresh, s, fdefs)]).filter(([, L]) => L);
    // ── MATERIALS FIRST (owner 2026-11-05, mockup VPAuQHWYGoQghmimznXpgf, "Approved use recommendations") ──
    {
      const ML = await import(pathToFileURL(join(dir, 'materialLayout.ts')).href);
      const fsys = id => fresh.systems.find(s => s.id === id);
      const mat = id => ML.materialLayoutOf(fresh, fsys(id), fdefs);
      const grp = (L, label) => L.find(g => g.node.label === label);
      const P = mat('plumbing'), sup = grp(P, 'Supply'), drn = grp(P, 'Drain · Waste · Vent');
      const q = sup?.questions[0];
      const pairs = q ? q.rows.map(x => `${x.value}>${x.card?.label ?? '-'}`).join('|') : '';
      globalThis.__matDebug = { pairs, typed: q?.typed?.label, every: sup?.every.map(n => n.label).join('|'), drain: drn?.questions[0]?.rows.length };
      r('materials: Plumbing Supply is its materials question, each answer with the ONE card the phone shows for it, the typed answer\'s card, then what every home gets',
        !TL.typeLayoutOf(fresh, fsys('plumbing'), fdefs) && sup?.questions.length === 1 && q.rows.length === 6
        && q.rows.every(x => x.card && PM.itemApplies(fdefs, x.card.id, k => (k === q.field || k === q.node.id ? x.value : undefined)))
        && q.typed?.label === 'Other Supply Piping' && sup.every.map(n => n.label).join('|') === 'Main Shutoff Location|Functional Flow|Water Pressure'
        && drn?.questions.length === 1 && drn.questions[0].cards.length === 8);
      const I = mat('interior'), surf = grp(I, 'Walls, Ceilings & Floors');
      const A = mat('attic'), ins = grp(A, 'Insulation');
      r('materials: Interior floors, walls and countertops are materials questions, one card per answer (2026-11-07); a group with none lists its items that record a choice first (Attic insulation)',
        !!surf && surf.questions.map(x => `${x.node.label}:${x.rows.length}:${x.rows[x.rows.length - 1].value}>${x.rows[x.rows.length - 1].card?.label}`).join('|') === 'Floors:10:Other>Other Flooring|Walls / Ceilings:6:Other>Other Walls'
        && surf.questions.every(x => x.rows.every(r => r.card)) && surf.materials.length === 0
        && !surf.every.some(n => (n.attributes ?? []).length) && !!ins && ins.materials.some(n => n.label === 'Insulation'));
      // Interior (owner 2026-11-06, mockup SqNS9bXgLH8HwppCXtwBPY, "approved with recommendations"): one card per surface
      // (Wall Material merged into Walls / Ceilings), the kitchen pieces in their own group, the answer lists fixed.
      {
        const lab = l => (l ?? []).map(n => n.label).join('|');
        const kc = grp(I, 'Countertops & Cabinets'), vent = grp(I, 'Ventilation');
        let wm = false; const any = n => { if (n.id === 'int_wall_material') wm = true; (n.children ?? []).forEach(any); (n.trimmed ?? []).forEach(any); }; any(fsys('interior'));
        globalThis.__intDebug = { groups: I.map(g => g.node.label), surf: lab(surf?.every), kc: [lab(kc?.materials), lab(kc?.every)], vent: lab(vent?.every) };
        r('interior: Walls, Ceilings & Floors (Floors, Walls / Ceilings; Trim moved to Doors & Windows), Countertops & Cabinets (Countertops, then Backsplash and Cabinets), Doors & Windows, Stairs & Railings, Ventilation; no Wall Material card',
          I.map(g => g.node.label).join('|') === 'Walls, Ceilings & Floors|Countertops & Cabinets|Doors & Windows|Stairs & Railings|Ventilation'
          && !!surf && surf.every.length === 0 &&   /* Trim moved to Doors & Windows (2026-11-07) */ kc?.questions.map(x => x.node.label).join() === 'Countertops' && kc.questions[0].rows.length === 9 && kc.questions[0].rows.every(r => r.card) && lab(kc?.every) === 'Backsplash|Cabinets'
          && !!vent && vent.every.length === 0 && !wm);
        // The answer lists themselves are the app's verify:interior-surfaces (pack, Ledrix Default, 4-Point; byte copies here).
      }
      // Fireplace "we operate it" (owner 2026-11-06, mockup AVMufpdYL6BrMPw2MXZsY2, "all is approved"): the switch shows on an
      // item offering "Not Operated"; Off/On and the sentence are each one setNodeField of startsLimited.
      {
        const fop = (() => { let f = null; const w = n => { if (n.id === 'fp_operation') f = n; (n.children ?? []).forEach(w); }; w(fsys('fireplace')); return f; })();
        const fbx = (() => { let f = null; const w = n => { if (n.id === 'fp_firebox') f = n; (n.children ?? []).forEach(w); }; w(fsys('fireplace')); return f; })();
        const FLD = 'fp_type::spec';
        const off = fop ? E.ops.operates(fop, FLD, 'Gas Insert', false) : [];
        const on = fop ? E.ops.operates(fop, FLD, 'Wood Burning — Masonry', true) : [];
        const v = o => (o.length === 1 && o[0].op === 'setNodeField' && o[0].field === 'startsLimited' ? o[0].value : null);
        r('fireplace: Operation shows a "We operate it" switch per type — Off adds that answer\'s entry (reason Not Operated, a sentence), On removes it, one op each; the sentence edit refuses blank',
          !!fop && E.canStartLimited(fop) && !!fbx && !E.canStartLimited(fbx)
          && (v(off) ?? []).length === 4 && (v(off) ?? []).some(e => e.value === 'Gas Insert' && e.reason === 'Not Operated' && e.field === FLD && e.sentence.trim())
          && (v(on) ?? []).length === 2 && !(v(on) ?? []).some(e => e.value === 'Wood Burning — Masonry')
          && E.ops.operates(fop, FLD, 'Pellet Stove', false).length === 0 && E.ops.operates(fop, FLD, 'Electric', true).length === 0
          && E.ops.startsSentence(fop, FLD, 'Pellet Stove', '  ').length === 0
          && (v(E.ops.startsSentence(fop, FLD, 'Pellet Stove', 'We do not run pellet stoves.')) ?? []).find(e => e.value === 'Pellet Stove')?.sentence === 'We do not run pellet stoves.');
      }
      // Water Heater (owner 2026-11-06, mockup 5uiien4txXFBSuMSxsD47X, "all is approved"): TPR shows for every type, so it has
      // one switch for all of them ('*'), not one per chip.
      {
        const whL = TL.typeLayoutOf(fresh, fsys('water_heater'), fdefs);
        const tpr = whL?.every.find(n => n.id === 'plumb_wh_tpr');
        const FLD = 'plumb_wh_type::type';
        const on = tpr ? E.ops.operates(tpr, FLD, '*', true) : [];
        const tpr2 = tpr ? { ...tpr, startsLimited: [] } : null;
        const off = tpr2 ? E.ops.operates(tpr2, FLD, '*', false) : [];
        r('water heater: TPR has ONE "We operate the TPR valve" switch for every type (value *), Ledrix starts it Off; switching it On removes the entry, Off writes a sentence naming the item',
          !!tpr && E.canStartLimited(tpr) && (tpr.startsLimited ?? []).length === 1 && tpr.startsLimited[0].value === '*'
          && on.length === 1 && on[0].value.length === 0
          && off.length === 1 && off[0].value.length === 1 && off[0].value[0].value === '*' && /tpr valve & discharge was not operated/i.test(off[0].value[0].sentence)
          && !whL.typed.concat(whL.every).some(n => n.id !== 'plumb_wh_tpr' && (n.startsLimited ?? []).some(e => e.value === '*')));
      }
      // Report advisories (owner 2026-11-06, mockup NH8eoefNScGrsemCdofANd, "looks great"): picked with a rule and a mode.
      {
        const AM = await import(pathToFileURL(join(dir, 'advisoryModel.ts')).href);
        const RA = await import(pathToFileURL(join(dir, 'reportAdvisories.ts')).href);
        const pre = AM.presetAdvisories();
        const sewer = pre.find(a => a.id === 'sewer');
        const rt = r0 => JSON.stringify(AM.ruleOf(AM.withRule(sewer, r0))) === JSON.stringify(r0);
        const between = AM.withRule(sewer, { kind: 'between', a: 1965, b: 1973 });
        const own = AM.newAdvisory(pre, 'Sewer', 'recommendation', 'Scope it.', { kind: 'from', a: 2005 }, 'always');
        const list = [...AM.pick(pre, RA.LEDRIX_ADVISORIES.find(a => a.id === 'mold'), true), own];
        const ok = step(AM.advisoryOps(list), 9100);
        const badList = [...list, { ...own, id: '-bad' }];
        const before = JSON.stringify(d.tree?.advisories ?? null);
        const refused = step(AM.advisoryOps(badList), 9101);
        r('advisories: the create preset (in Ledrix\'s order) is radon + sewer Always add and well, septic, asbestos, lead paint Suggest; rules round-trip (before, between, in or after, every, utility, never); your own gets a fresh id; the list is ONE setTemplateField that the builder accepts, and a bad one is refused',
          pre.map(a => `${a.id}:${a.mode}`).join('|') === 'radon:always|sewer:always|well_water:suggest|septic:suggest|asbestos:suggest|lead_paint:suggest'
          && [{ kind: 'before', a: 1980 }, { kind: 'between', a: 1965, b: 1973 }, { kind: 'from', a: 2005 }, { kind: 'every' }, { kind: 'water' }, { kind: 'sewer' }, { kind: 'gas' }, { kind: 'never' }].every(rt)
          && between.suggestWhen.yearFrom === 1965 && between.suggestWhen.yearThrough === 1973 && between.suggestWhen.yearBefore === undefined
          && AM.withRule(sewer, { kind: 'before', a: 1980 }).suggestWhy === RA.LEDRIX_ADVISORIES.find(a => a.id === 'sewer').suggestWhy
          && !!own && own.id !== 'sewer' && !RA.LEDRIX_ADVISORIES.some(a => a.id === own.id) && AM.newAdvisory(pre, 'X', 'limitation', '  ', { kind: 'every' }, 'suggest') === null
          && AM.editorRows(list).length === RA.LEDRIX_ADVISORIES.length + 1 && AM.pick(list, own, false).length === list.length - 1
          && JSON.stringify(AM.advisoryOps([])) === JSON.stringify([{ op: 'setTemplateField', field: 'advisories', value: null }])
          && ok.ok && JSON.stringify((d.tree?.advisories ?? []).map(a => a.id)) === JSON.stringify(list.map(a => a.id))
          && !refused.ok && JSON.stringify(d.tree?.advisories ?? null) === before);
        // "Should Ledrix suggest advisories from the home's details?" (owner 2026-11-06, mockup A5vbGSBfvHNfPL4F2Fm5fu):
        // one yes/no on the template; the rules read as sentences; every preset starts on Ledrix's own rule (Radon: every home).
        const no = step(AM.suggestOps(false), 9102), noVal = d.tree?.suggestAdvisories;
        const yes = step(AM.suggestOps(true), 9103), yesGone = d.tree?.suggestAdvisories === undefined;
        r('advisories: one yes/no ("suggest from the home\'s details?") is stored as suggestAdvisories false, Yes removes it; each rule reads as a sentence; every preset starts on Ledrix\'s own rule (Radon: every home)',
          no.ok && noVal === false && yes.ok && yesGone
          && AM.ruleSentence({ kind: 'before', a: 1980 }) === 'Homes built before 1980' && AM.ruleSentence({ kind: 'between', a: 1965, b: 1973 }) === 'Homes built 1965–1973'
          && AM.ruleSentence({ kind: 'every' }) === 'Every home' && AM.ruleSentence({ kind: 'from', a: 2005 }) === 'Homes built in 2005 or later'
          && pre.every(a => JSON.stringify(AM.ruleOf(a)) === JSON.stringify(AM.ruleOf(RA.LEDRIX_ADVISORIES.find(x => x.id === a.id))))
          && AM.ruleOf(pre.find(a => a.id === 'radon')).kind === 'every');
      }
      // Buildings across the top (owner 2026-11-06, mockup HHfBh3wvLanc1CG4UcNxaU): parts switched per building.
      {
        const BM = await import(pathToFileURL(join(dir, 'buildingModel.ts')).href);
        const t0 = clone(DEFAULT_TREE);
        const shop = BM.buildingsOf(t0).find(b => b.kind === 'shop');
        const plumb = t0.systems.find(x => x.id === 'plumbing');
        const fixtures = plumb?.children.find(g => g.label === 'Fixtures');
        const hose = fixtures?.children.find(c => c.label === 'Hose Bibs'), toilets = fixtures?.children.find(c => c.label === 'Toilets');
        const supply = plumb?.children.find(g => g.label === 'Supply');
        const on1 = shop && hose ? BM.partOps(t0, shop.id, hose.id, true) : [];
        const after = on1.length === 1 ? on1[0].value.find(b => b.id === shop.id) : null;
        const t1 = { ...t0, structureTypes: on1[0]?.value };
        const pm = BM.parentMap(t1);
        const offSupply = shop ? BM.partOps(t1, shop.id, supply.id, true) : [];
        const t2 = { ...t1, structureTypes: offSupply[0]?.value };
        const grpOff = BM.partOps(t2, shop.id, fixtures.id, false), t3 = { ...t2, structureTypes: grpOff[0]?.value };
        const sysOff = BM.partOps(t3, shop.id, 'plumbing', false), t4 = { ...t3, structureTypes: sysOff[0]?.value };
        const okStep = step(on1, 9200);
        r('buildings: switching parts per building — a Shop gets Hose Bibs alone from Plumbing (its other groups and fixtures start off), a group off takes its items, a system off leaves the list; each is ONE op the builder accepts',
          !!shop && !shop.systems.includes('plumbing') && on1.length === 1 && on1[0].op === 'setTemplateField' && on1[0].field === 'structureTypes'
          && after.systems.includes('plumbing') && BM.inBuilding(after, t1, hose.id, pm) && !BM.inBuilding(after, t1, toilets.id, pm) && !BM.inBuilding(after, t1, supply.id, pm)
          && BM.offPartsIn(after, t1, 'plumbing').some(x => x.node.id === supply.id) && BM.offPartsIn(after, t1, 'plumbing').some(x => x.node.id === toilets.id)
          && BM.inBuilding(offSupply[0].value.find(b => b.id === shop.id), t2, supply.id)
          && !BM.inBuilding(grpOff[0].value.find(b => b.id === shop.id), t3, hose.id) && (grpOff[0].value.find(b => b.id === shop.id).off ?? []).includes(fixtures.id)
          && !(grpOff[0].value.find(b => b.id === shop.id).off ?? []).includes(toilets.id)
          && !sysOff[0].value.find(b => b.id === shop.id).systems.includes('plumbing')
          && BM.partOps(t1, shop.id, hose.id, true).length === 0
          && okStep.ok && (d.tree?.structureTypes ?? []).some(b => b.id === shop.id && b.systems.includes('plumbing')));
      }
      // Electrical, group by group (owner 2026-11-06, mockup NC6nHJ1mUGuv2ikCUfU3Cc, "approved mock up"): Service Entrance
      // decides 3 of its items, under a third, so no chips; each group is Recorded → Brought by → every home.
      const ids = (l) => (l ?? []).map(n => n.id).join('|');
      const EG = mat('electrical'), svc = grp(EG, 'Service'), pnl = grp(EG, 'Panel'), bw = grp(EG, 'Branch Wiring'), dev = grp(EG, 'Devices & Protection');
      const typedIds = fresh.systems.filter(x => TL.typeLayoutOf(fresh, x, fdefs)).map(x => x.id).sort().join('|');
      r('electrical: no type chips (Service Entrance decides 3 of 27 items); Heating, Cooling, Water Heater, Fireplace and Foundation keep theirs',
        !TL.typeLayoutOf(fresh, fsys('electrical'), fdefs) && typedIds === 'cooling|fireplace|foundation|heating|water_heater');
      const row = (b, v) => ids(b?.rows.find(x => x.value === v)?.cards);
      const se = svc?.brought.find(b => b.label === 'Service Entrance');
      r('electrical: Service records Size, Entrance and Main Disconnect; Service Entrance brings the drop and mast for Overhead and Service Mast, the lateral for Underground; Meter Base is every home',
        ids(svc?.materials) === 'elec_service|elec_entrance|elec_main' && svc?.brought.length === 1
        && row(se, 'Overhead') === 'elec_svc_drop|elec_svc_mast' && row(se, 'Service Mast') === 'elec_svc_drop|elec_svc_mast' && row(se, 'Underground (Lateral)') === 'elec_svc_lateral'
        && ids(svc?.every) === 'elec_meter');
      const oc = pnl?.brought.find(b => b.label === 'Panel › Overcurrent Protection');
      r('electrical: Fuses / Fuse Holders is brought by the fuse answers of Overcurrent Protection — never "every home"; breakers bring nothing extra',
        !!oc && row(oc, 'Circuit Breakers') === '' && row(oc, 'Fuses — Edison / Type S') === 'elec_fuses' && row(oc, 'Cartridge Fuses') === 'elec_fuses'
        && !pnl.every.some(n => n.id === 'elec_fuses') && ids(pnl.every) === 'elec_deadfront|elec_breakers' && ids(pnl.materials) === 'elec_panel|elec_bonding|gar_subpanel');
      const wq = bw?.questions[0];
      r('electrical: Branch Wiring is its wiring-type materials rows (one card each, Other for typed) then every home; Devices records GFCI / AFCI',
        !!wq && wq.field === 'elec_wiring::type' && wq.rows.length === 6 && wq.rows.every(x => x.card) && wq.typed?.id === 'elec_wir_other'
        && ids(bw.every) === 'kit_circuits|laundry_dryer' && !bw.brought.length
        && ids(dev?.materials) === 'elec_grounding' && ids(dev?.every) === 'elec_receptacles|int_lighting|elec_ext_lighting');
      // A list where one material question decides most of the system is still not a type (several(k)): Plumbing's Supply alone.
      const sup1 = clone(fresh); const plS = sup1.systems.find(x => x.id === 'plumbing'); plS.children = plS.children.filter(c => c.label === 'Supply');
      r('types: a material question that decides most of a system is still a material list, not type chips (Plumbing Supply on its own)',
        !TL.typeLayoutOf(sup1, plS, PM.rulesFor(sup1)) && grp(ML.materialLayoutOf(sup1, plS, PM.rulesFor(sup1)), 'Supply')?.questions.length === 1);
      const E2 = mat('exterior');
      r('materials: Exterior siding is laid out the same way (found from its own rules, not a list of systems)', E2.some(g => g.questions.some(x => x.rows.length >= 8 && x.rows.every(y => y.card))));
      // + Add material / remove — on a draft, through the editor's own change sets.
      let dm = T.createDraft({ companyId: 'co_1', templateId: 'tpl_m', live: clone(DEFAULT_TREE), now: 3000 });
      const msys = () => dm.tree.systems.find(s => s.id === 'plumbing');
      const mq = () => grp(ML.materialLayoutOf(dm.tree, msys(), PM.rulesFor(dm.tree)), 'Supply').questions[0];
      const n0 = dm.log.length;
      const add = E.applyManual(dm, ML.addMaterialOps(dm.tree, msys(), mq(), 'Brass'), OWNER, 3100); if (add.ok) dm = add.draft;
      const brass = mq()?.rows.find(x => x.value === 'Brass');
      const shows = (defs, id, v) => PM.itemApplies(defs, id, k => (k === mq().field || k === mq().node.id ? v : undefined));   // the answer under both keys, as the phone stores it
      const dd = PM.rulesFor(dm.tree);
      r('materials: "+ Add material" adds the answer and its card ("Brass Supply Piping"), shown only when Brass is ticked, and "Other" stays for typed answers only — one change set',
        add.ok && dm.log.length === n0 + 1 && brass?.card?.label === 'Brass Supply Piping'
        && shows(dd, brass.card.id, 'Brass') && !shows(dd, brass.card.id, 'Copper') && ML.addMaterialOps(dm.tree, msys(), mq(), 'brass').length === 0
        && !shows(dd, mq().typed.id, 'Brass') && shows(dd, mq().typed.id, 'Bamboo'));
      const pvcCard = mq()?.rows.find(x => x.value === 'PVC')?.card;
      const rm = E.applyManual(dm, ML.removeMaterialOps(mq(), 'PVC'), OWNER, 3200); if (rm.ok) dm = rm.draft;
      const live = []; const w = (n) => { live.push(n.id); (n.children ?? []).forEach(w); }; msys().children.forEach(w);
      r('materials: removing a material takes the answer out and switches its card off (restorable) — one change set',
        rm.ok && !!pvcCard && !mq().attr.values.includes('PVC') && !live.includes(pvcCard.id)
        && JSON.stringify(msys()).includes(`"id":"${pvcCard.id}"`));
      // Owner 2026-11-06 (mockup LZNLt31XvGjAnMrhhmWL2t, "mock up approved"): an Off material stays listed, and comes back.
      r('materials: a switched-off material stays listed as Off with its card (Ledrix\'s PVC), and nothing on is listed Off',
        mq().off.length === 1 && mq().off[0].value === 'PVC' && mq().off[0].card.id === pvcCard?.id && !mq().rows.some(x => x.value === 'PVC'));
      const nOn = dm.log.length;
      const on = E.applyManual(dm, ML.switchMaterialOnOps(mq(), mq().off[0]), OWNER, 3300); if (on.ok) dm = on.draft;
      const live2 = []; const w2 = (n) => { live2.push(n.id); (n.children ?? []).forEach(w2); }; msys().children.forEach(w2);
      r('materials: switching it on puts the answer back (at the end) and its card back on — one change set — and it leaves the Off list',
        on.ok && dm.log.length === nOn + 1 && mq().attr.values[mq().attr.values.length - 1] === 'PVC' && live2.includes(pvcCard?.id) && mq().off.length === 0
        && mq().rows.find(x => x.value === 'PVC')?.card?.id === pvcCard?.id);
      const bo = E.applyManual(dm, ML.removeMaterialOps(mq(), 'Brass'), OWNER, 3400); if (bo.ok) dm = bo.draft;
      const brassOff = mq().off.find(x => x.value === 'Brass');
      const again = ML.addMaterialOps(dm.tree, msys(), mq(), 'brass');
      r('materials: a company material (Brass) switched off is listed Off too, and adding "brass" again switches that one on — no second card',
        bo.ok && brassOff?.card.label === 'Brass Supply Piping' && JSON.stringify(again) === JSON.stringify(ML.switchMaterialOnOps(mq(), brassOff))
        && !again.some(o => o.op === 'addNode'));
    // ── MOVE TO… (owner 2026-11-05, mockup XtoreixMRS7sZ4YyKMTUqp, "Yes on all 3. Approved") ──
    {
      const MV = await import(pathToFileURL(join(dir, 'moveModel.ts')).href);
      const PACKJ = JSON.parse(read('lib/scope/core/taxonomy/ledrix.core.json'));
      const UNITS = new Set(PACKJ.systems.flatMap(x => x.nodes.filter(n => n.establishesAs).map(n => n.id)));
      const isUnit = id => UNITS.has(String(id).replace(/~i\d+.*$/, ''));
      let dv = T.createDraft({ companyId: 'co_1', templateId: 'tpl_mv', live: clone(DEFAULT_TREE), now: 4000 });
      const copyItem = (t) => (id) => { const w = MV.whereIs(t, id); const L = w ? TL.typeLayoutOf(t, w.system, PM.rulesFor(t)) : null; return !!L && !!TL.copyGroupOf(L, id); };
      const FAN = 'primary_bathroom_exhaust_fan';
      const fanBefore = JSON.stringify(MV.whereIs(dv.tree, FAN)?.node);
      const n0 = dv.log.length;
      const mo = MV.moveOps(dv.tree, FAN, 'attic__ventilation', 'attic_fan_term');
      const mv = E.applyManual(dv, mo, OWNER, 4100); if (mv.ok) dv = mv.draft;
      const at = MV.whereIs(dv.tree, FAN), kids = (at?.parent.children ?? []).map(c => c.id);
      r('move: the fan moves into Attic › Ventilation right after the fan termination, as ONE change, carrying everything it had',
        mo.length === 1 && mv.ok && dv.log.length === n0 + 1 && at?.system.id === 'attic' && at.parent.id === 'attic__ventilation'
        && kids[kids.indexOf('attic_fan_term') + 1] === FAN && JSON.stringify(at.node) === fanBefore);
      const iv = MV.whereIs(dv.tree, 'interior__ventilation');
      r('move: the group it left stays, empty, for the company to switch off, rename or fill', !!iv && (iv.node.children ?? []).length === 0);
      const top = MV.moveOps(dv.tree, 'attic_powered', 'attic__ventilation', null);
      r('move: "at the top" is the first place; moving to where it already is changes nothing',
        top.length === 1 && top[0].index === 0 && MV.moveOps(dv.tree, FAN, 'attic__ventilation', 'attic_fan_term').length === 0);
      const gm = MV.moveOps(dv.tree, 'interior__stairs_railings', 'attic', 'attic__ventilation');
      const gv = E.applyManual(dv, gm, OWNER, 4200); if (gv.ok) dv = gv.draft;
      r('move: a group moves into another system as one change', gv.ok && MV.whereIs(dv.tree, 'interior__stairs_railings')?.system.id === 'attic');
      const blk = (id) => MV.moveBlock(dv.tree, id, isUnit, copyItem(dv.tree));
      r('move: units, a group holding one, a link and a count copy cannot move — and say why; an ordinary item can',
        /Units stay/.test(blk('hvac_furnace') ?? '') && /holds .* a unit/.test(blk('heating__heating_plant') ?? '') && /link/.test(blk('cooling__link_hvac_thermostat') ?? '')
        && /count/.test(blk('hvac_ms_head_2') ?? '') && blk('attic_moisture') === null && blk(FAN) === null);
      const cp = clone(dv.tree); const pl = clone(cp.systems.find(x => x.id === 'plumbing')); pl.id = 'plumbing~2'; pl.label = 'Plumbing 2'; pl.children[0].children[0].id = 'plumb_copy_item~2'; cp.systems.push(pl);
      const tg = MV.moveTargets(cp, 'attic_moisture');
      r('move: a copied system is never a destination, a system with groups takes items only inside a group, and items in a copy stay',
        !tg.some(x => x.system.id === 'plumbing~2') && tg.find(x => x.system.id === 'attic').homes.every(h => h.kind === 'subsystem')
        && /copied system/.test(MV.moveBlock(cp, 'plumb_copy_item~2', isUnit, () => false) ?? ''));
      // "+ New group" (owner 2026-11-06, mockup LZNLt31XvGjAnMrhhmWL2t): Safety has only groups, so Gas Supply needs one.
      const GAS = 'attic_moisture';
      const ng = MV.moveIntoNewGroupOps(dv.tree, GAS, 'safety', 'Gas');
      const nN = dv.log.length;
      const nv = E.applyManual(dv, ng, OWNER, 4300); if (nv.ok) dv = nv.draft;
      const safety = dv.tree.systems.find(x => x.id === 'safety'), last = safety?.children?.[safety.children.length - 1];
      r('move: "+ New group" adds the group at the end of the system with the item as its first — ONE change set',
        nv.ok && ng.length === 2 && dv.log.length === nN + 1 && last?.kind === 'subsystem' && last.label === 'Gas'
        && last.children?.[0]?.id === GAS && MV.whereIs(dv.tree, GAS)?.parent.id === last.id);
      const det = safety?.children?.find(c => c.kind === 'subsystem' && c.id !== last?.id);
      r('move: a name the system already has as a group is that group (no duplicate); a group, a copied system or a blank name makes nothing',
        !!det && MV.newGroupClash(dv.tree, 'safety', ` ${det.label.toUpperCase()} `)?.id === det.id && MV.moveIntoNewGroupOps(dv.tree, FAN, 'safety', det.label).length === 0
        && MV.moveIntoNewGroupOps(dv.tree, 'interior__stairs_railings', 'safety', 'Stairs').length === 0
        && MV.moveIntoNewGroupOps(cp, 'attic_moisture', 'plumbing~2', 'X').length === 0 && MV.moveIntoNewGroupOps(dv.tree, FAN, 'safety', '  ').length === 0);
    }
    }
    r('types: "Every <system>" holds ONLY items with no rule at all, in every typed system of the Ledrix Default (Heating\'s included)',
      typedSystems.length >= 5 && typedSystems.every(([, L]) => L.every.length > 0 && L.every.every(n => ruleFree(n.id)))
      && typedSystems.find(([s]) => s.id === 'heating')[1].every.map(n => n.id).join('|') === 'hvac_heating_age|hvac_dataplate|hvac_distribution|hvac_thermostat');
    // Owner 2026-11-05 ("Make that change"): Furnace and Cabinet / Access are forced-air only — Ledrix's own rule, in the
    // pack. The builder files them under the forced-air types, and the preview (the phone's resolver) agrees per type.
    {
      const HL = typedSystems.find(([s]) => s.id === 'heating')?.[1];
      const FORCED = ['Gas Furnace', 'Electric Furnace', 'Heat Pump', 'Propane', 'Oil Furnace'];
      const OTHERS = ['Electric Baseboard', 'Electric Wall Heater', 'Boiler', 'Radiant Heat'];
      const heatShows = (id, v) => PM.itemApplies(fdefs, id, k => (k === 'hvac_heating::fuel_source' ? v : undefined));
      r('types: Heating\'s Furnace and Cabinet / Access are filed under exactly the forced-air types, and the preview shows them for each forced-air type and for no other',
        !!HL && ['hvac_furnace', 'hvac_cabinet'].every(id => (HL.shows[id] ?? []).slice().sort().join('|') === FORCED.slice().sort().join('|')
          && HL.typed.some(n => String(n.id).replace(/~i\d+$/, '') === id))
        && HL.question.field === 'hvac_heating::fuel_source'
        && ['hvac_furnace', 'hvac_cabinet'].every(id => FORCED.every(v => heatShows(id, v)) && OTHERS.every(v => !heatShows(id, v))));
    }
    const FP = typedSystems.find(([s]) => s.id === 'fireplace')?.[1];
    r('types: an item another question in the system decides gets its own "Shown by …" section, not "Every" (Fireplace: by Chimney)',
      !!FP && FP.gated.some(g => g.key.startsWith('fp_chimney') && g.nodes.length > 0 && g.nodes.every(n => !FP.every.includes(n))));
    // a special-home checkpoint added to Heating lands in "Special homes", not "Every"
    let d2 = T.createDraft({ companyId: 'co_1', templateId: 'tpl_2', live: clone(DEFAULT_TREE), now: 5000 });
    const SH = await import(pathToFileURL(join(dir, 'core/specialHomes.ts')).href);
    const sp = SH.specialHomeOps(d2.tree, 'heating', ['hvac_manufactured_furnace'], clone(DEFAULT_TREE));
    const sx = sp.ok ? E.applyManual(d2, sp.ops, OWNER, 5100) : { ok: false };
    if (sx.ok) d2 = sx.draft;
    const HL = sx.ok ? TL.typeLayoutOf(d2.tree, d2.tree.systems.find(s => s.id === 'heating'), PM.rulesFor(d2.tree)) : null;
    r('types: a special-home checkpoint (Manufactured-Home Listed Furnace) is in its own "Special homes" section, never "Every"',
      !!HL && HL.special.map(n => n.id).join('|') === 'hvac_manufactured_furnace' && !HL.every.some(n => n.id === 'hvac_manufactured_furnace'));
    // The Furnace is titled by its picked forced-air type, as Scope titles it (ledrix-app ScopeRowList rowTitle).
    const furnace = { id: 'hvac_furnace', label: 'Furnace', kind: 'component' };
    const titleFor = vs => PM.previewRowTitle(furnace, vs ? { 'hvac_heating::fuel_source': vs } : {});
    r('types: the preview titles the Furnace by its picked type, as Scope does ("Gas Furnace", "Heat Pump", "Propane" → "Propane Furnace"; none or two picked → "Furnace"); other rows keep their names',
      titleFor(['Gas Furnace']) === 'Gas Furnace' && titleFor(['Heat Pump']) === 'Heat Pump' && titleFor(['Propane']) === 'Propane Furnace'
      && titleFor(null) === 'Furnace' && titleFor(['Gas Furnace', 'Heat Pump']) === 'Furnace'
      && PM.previewRowTitle({ id: 'hvac_cabinet', label: 'Cabinet / Access', kind: 'component' }, { 'hvac_heating::fuel_source': ['Gas Furnace'] }) === 'Cabinet / Access');
    // DESCRIBED IN DETAILS (ledrix-app 2026-11-08, owner: "Inspect should be strictly condition checks"): on the real
    // Ledrix Default, the preview's Details fields are the phone's — the checklist's own questions, every other spec with
    // choices (the furnace flue, the water heater's capacity, the panel's brand), never a look-to-answer item.
    const dk = PM.previewDetailsKeys(clone(DEFAULT_TREE), PM.rulesFor(clone(DEFAULT_TREE)));
    const askIn = JSON.parse(read('lib/templateBuilder/core/ledrixRules.json')).askIn ?? [];
    r('details: the preview asks what the phone’s Details asks — the checklist answers and every spec with choices, never the nine look-to-answer items',
      ['hvac_heating|fuel_source', 'hvac_flue|spec', 'plumb_wh_type|capacity', 'elec_panel|brand', 'int_flooring|spec'].every(k => dk.has(k))
      && askIn.length === 9 && ![...dk].some(k => askIn.includes(k.split('|')[0])));
  } catch (e) {
    r(`types scenario completed (${e?.message})`, false);
  }
  return results;
}

console.log('executed');
const real = await runExecuted(sourceFiles());
for (const [k, v] of Object.entries(real)) ok(k, v);
const desk = await runDesktop(sourceFiles());
for (const [k, v] of Object.entries(desk)) ok(k, v);
const typesRes = await runTypes(sourceFiles());
for (const [k, v] of Object.entries(typesRes)) ok(k, v);

// ── 3. Static ─────────────────────────────────────────────────────────────────────────────────────────────
const BUILDER_DIRS = ['lib/templateBuilder', 'lib/templates', 'components/templates', 'app/app/templates', 'app/api/template-assistant'];
const loadAll = () => Object.fromEntries(BUILDER_DIRS.flatMap(walk).map(f => [f, read(f)]));
const ROUTE = 'app/api/template-assistant/route.ts';
const API = 'lib/templates/api.ts';
const LIST = 'app/app/templates/page.tsx', EDIT = 'app/app/templates/[id]/page.tsx';
const browserFiles = all => Object.entries(all).filter(([f]) => !f.startsWith('app/api/'));
const WRITE = /\.(insert|update|upsert|delete)\s*\(\s*[{\[]|\.delete\(\)|\.rpc\s*\(/;

const RULES = {
  // DESCRIBED IN DETAILS (ledrix-app 2026-11-08, mockup 1JBGc6WjSZSztpkMm3pynL → approved).
  'details: the preview runs the app’s whatsHere.ts on the rules a new inspection captures, and the pack’s askIn / type rows': all => {
    const m = strip(all['components/templates/phonePreviewModel.ts'] ?? '');
    return /return new Set\(whatsHereQuestions\(\{ \.\.\.tree, ruleDefinitions: rules \} as never, PACK_FACTS as never\)\.map\(questionKey\)\);/.test(m)
      && /k = previewDetailsKeys\(tree, rulesFor\(tree\)\);/.test(m) && /ASK_IN\.has\(id\) \? \{ askIn: 'inspect' \} : \{\}/.test(m)
      && /TYPE_ROWS\.has\(id\) \? \{ typeRow: true \} : \{\}/.test(m) ? [] : ['components/templates/phonePreviewModel.ts'];
  },
  'details: on the preview a Details field is one line, not a grid (Change opens it); a described item leaves the walk and folds into one line on its page': all => {
    const p = strip(all['components/templates/PhonePreview.tsx'] ?? '');
    return /const moved = ax\.attributes\.filter\(a => detailsKeys\.has\(/.test(p) && /const gridAttrs = ax\.attributes\.filter\(a => specOpen \|\| !moved\.includes\(a\)\);/.test(p)
      && /\{gridAttrs\.map\(\(a, i\) => \(/.test(p) && /const steps = useMemo\(\(\) => allSteps\.filter\(st => !describedStep\(st\)\)/.test(p)
      && /const mine = allSteps\.filter\(st => st\.systemId === sysId\);/.test(p) && /active\.items\.filter\(st => !isDescribed\(st\)\)\.map\(/.test(p)
      && /DESCRIBED IN DETAILS · /.test(p) && !/ALREADY KNOWN/.test(p) ? [] : ['components/templates/PhonePreview.tsx'];
  },
  'details: every item row says where it is asked — Details (a spec Pre-Inspect asks) and/or Condition (judged in Inspect)': all => {
    const r = strip(all['components/templates/ItemRow.tsx'] ?? '');
    return /const inDetails = \(node\.attributes \?\? \[\]\)\.some\(a => detailsKeysFor\(tree\)\.has\(/.test(r) && /const inInspect = !node\.pointsTo && assessesCondition\(node\);/.test(r)
      && /\{inDetails \? <span[^>]*>Details<\/span> : null\}/.test(r) && /\{inInspect \? <span[^>]*>Condition<\/span> : null\}/.test(r) ? [] : ['components/templates/ItemRow.tsx'];
  },
  'writes: only lib/templates/api.ts writes to the database': all => Object.entries(all).filter(([f, s]) => f !== API && f !== ROUTE && WRITE.test(strip(s))).map(([f]) => f),
  'writes: only the three template tables, the company template context and the publish RPC': all => {
    const s = strip(all[API] ?? '');
    const tables = [...s.matchAll(/from\(\s*'([\w]+)'\s*\)/g)].map(m => m[1]);
    const rpcs = [...s.matchAll(/\.rpc\(\s*'([\w]+)'/g)].map(m => m[1]);
    return tables.every(t => ['company_templates', 'company_template_drafts', 'company_inspection_types', 'company_template_context'].includes(t)) && rpcs.every(x => x === 'publish_company_template_draft') && rpcs.length === 1 ? [] : [API];
  },
  'writes: every update names the next version (row_version)': all => {
    const s = strip(all[API] ?? '');
    const ups = [...s.matchAll(/\.update\(\s*\{([^}]*)\}/g)];
    return ups.length >= 5 && ups.every(m => /row_version:/.test(m[1])) ? [] : [API];
  },
  'writes: the live template is never inserted, upserted or hard-deleted from the browser': all =>
    /from\('company_templates'\)\s*\.(insert|upsert|delete)\(/.test(strip(all[API] ?? '')) ? [API] : [],
  'isolation: no inspection, finding or snapshot table is touched': all => Object.entries(all).filter(([, s]) => /from\(\s*'(inspections|anomalies|technical_specs|inspection_templates?)'\s*\)/.test(strip(s))).map(([f]) => f),
  'isolation: browser storage is written only by draftStore': all => browserFiles(all).filter(([f, s]) => f !== 'lib/templateBuilder/draftStore.ts' && f !== 'lib/templates/lastPlace.ts' && /localStorage|sessionStorage|indexedDB/.test(strip(s))).map(([f]) => f),
  // owner 2026-11-05: reopening a template returns to where you left off — remembered in this browser, place only.
  'where you left off: lastPlace keeps only the place (selection, section, tab, type chips, labels), never template content, and the editor restores it before the draft loads': all => {
    const lp = strip(all['lib/templates/lastPlace.ts'] ?? ''), e = strip(all[EDIT] ?? ''), list = strip(all['app/app/templates/page.tsx'] ?? '');
    const place = (lp.match(/export type Place = \{([\s\S]*?)\n\};/) ?? [])[1] ?? '';
    const fields = [...place.matchAll(/^\s*(\w+):/gm)].map(m => m[1]).sort().join(',');
    return (fields === 'at,ctab,href,section,sel,title,typePick,where' && !/tree|core|ops/.test(place)
      && /const p = readPlace\(companyId, pk\);\s*if \(p\) \{ setSel\(p\.sel\); setSection/.test(e) && /if \(!placeReady \|\| !tree \|\| !m \|\| !sel\.systemId\) return;/.test(e)
      && /forgetPlace\(companyId, pk\)/.test(e) && /readLastPlace\(access\.companyId\)/.test(list) && /const lastLive = last && data &&/.test(list)) ? [] : ['lib/templates/lastPlace.ts', EDIT, 'app/app/templates/page.tsx'];
  },
  'preview: each item row is titled as Scope titles it (previewRowTitle — the Furnace by its picked type)': all =>
    /<span className="pv-ct">\{previewRowTitle\(n, picks\)\}/.test(strip(all['components/templates/PhonePreview.tsx'] ?? '')) ? [] : ['components/templates/PhonePreview.tsx'],
  'isolation: the phone preview reads the draft and writes nothing': all => ['components/templates/PhonePreview.tsx', 'components/templates/phonePreviewModel.ts']
    .filter(f => /workspace|fetch\(|\.from\(|supabase/i.test(strip(all[f] ?? 'missing'))),
  'no model key or service-role key in browser code': all => browserFiles(all).filter(([, s]) => /SERVICE_ROLE|GATEWAY_KEY|x-ledrix-key|OPENAI/i.test(s)).map(([f]) => f),
  'route: requires a signed-in user': all => (/admin\.auth\.getUser\(token\)/.test(all[ROUTE] ?? '') && /if \(!token\) return fail\(401/.test(all[ROUTE] ?? '')) ? [] : [ROUTE],
  'route: owner/admin, working on their own company\'s template or draft': all => {
    const s = all[ROUTE] ?? '';
    return (/canAuthorTemplates\(profile\.role\)/.test(s)
      && /from\('company_template_drafts'\)\.select\('id'\)\.eq\('id', draftId\)\.eq\('company_id', profile\.company_id\)/.test(s)
      && /from\('company_templates'\)\.select\('id'\)\.eq\('id', templateId as string\)\.eq\('company_id', profile\.company_id\)/.test(s)) ? [] : [ROUTE];
  },
  // 2026-10-24: the editor's condition switch shows what the APP will do (assessesCondition), never the raw field.
  'editor: the condition switch shows the app rule, not the raw field': all => {
    // 2026-11-07: the switch is on the item's Condition screen (one shape at every level).
    const s = strip(all['components/templates/EditorParts.tsx'] ?? ''), w = strip(all['components/templates/Workspace.tsx'] ?? '');
    return (/sw\('Inspectors rate its condition', 'Satisfactory · Limitation · Finding', assessesCondition\(node\), v => onOps\(ops\.assessed\(node\.id, v\)\)\)/.test(w)
      && ![s, w].some(x => /node\.condition (===|&&)/.test(x))) ? [] : ['components/templates/Workspace.tsx'];
  },
  'route: the prompt is built on the server': all => {
    const s = all[ROUTE] ?? '';
    return (/buildAssistantPrompt\(\{/.test(s) && /askModel\(prompt\.system, prompt\.user\)/.test(s) && !/body\.(system|messages|prompt)\b/.test(s)) ? [] : [ROUTE];
  },
  'route: the cost cap is counted before the model is called': all => {
    const s = strip(all[ROUTE] ?? '');
    const cap = s.indexOf('bumpUsage(admin, user.id)'), model = s.indexOf('await askModel(');
    return cap > 0 && model > cap && /used > DAILY_CAP/.test(s) ? [] : [ROUTE];
  },
  'route: the reply shape is normalized before grades are filtered and the browser checks it': all => /normalizeChanges\(\(parsed as \{ changes: unknown\[\] \}\)\.changes\)/.test(strip(all[ROUTE] ?? '')) ? [] : [ROUTE],
  'route: grades are filtered out before the owner sees them': all => /\.filter\(c => !isGradeChange\(c\)\)/.test(strip(all[ROUTE] ?? '')) ? [] : [ROUTE],
  'pages: editing is for owners and admins only': all => {
    const list = all[LIST] ?? '', edit = all[EDIT] ?? '';
    return (/const author = canAuthorTemplates\(access\.role\)/.test(list) && /if \(!access\.companyId \|\| !author\)/.test(edit)) ? [] : [LIST];
  },
  'pages: publish, rename, delete and type assignment are owner-only in the UI': all => {
    const list = all[LIST] ?? '', edit = all[EDIT] ?? '';
    return (/!owner \? 'Only the company owner can publish\.'/.test(edit) && /!owner && 'Only the company owner can rename/.test(list)
      && /!owner && 'Only the company owner can delete/.test(list) && /disabled=\{!owner \|\| busy\}/.test(list)) ? [] : [LIST, EDIT];
  },
  'pages: publishing always asks first and says inspections are not changed': all =>
    /Inspections already started or finished keep the copy they started with/.test(all[EDIT] ?? '') && /dialog === 'publish'/.test(all[EDIT] ?? '') ? [] : [EDIT],
  // 2026-10-24 — building types: edited ONLY as one template op (draft, undo, validation), and never published with an error.
  'editor: a system’s Included switch sits on its title line and writes through coverByDefault (the app’s rule)': all => {
    const ws = strip(all['components/templates/Workspace.tsx'] ?? ''), parts = strip(all['components/templates/EditorParts.tsx'] ?? ''), em = strip(all['lib/templates/editorModel.ts'] ?? '');
    // 2026-11-05: the system switch goes through includeOps, which for a live system IS coverByDefault (checked here and
    // executed in "switch: …" above).
    // 2026-11-06: with a building selected in the strip, the same switch says whether the system is in THAT building.
    return /action=\{<IncludedSwitch on=\{lens \? lens\.isIn\(system\.id\) : isCovered\(tree, system\)\} label=\{system\.label\} disabled=\{disabled\} onChange=\{v => onOps\(lens \? lens\.set\(system\.id, v\) : includeOps\(tree, system\.id, v\)\)\} \/>\}/.test(ws)
      && /return loc\.depth === 0 \? ops\.coverByDefault\(tree, id, false\)/.test(em)
      && !/coverByDefault/.test(parts) ? [] : ['components/templates/Workspace.tsx'];
  },
  'switch: systems, groups and items have the SAME title-line switch (includeOps); no "Set … aside" button, menu entry or list remains': all => {
    const ws = strip(all['components/templates/Workspace.tsx'] ?? ''), parts = strip(all['components/templates/EditorParts.tsx'] ?? ''), tree = strip(all['components/templates/Tree.tsx'] ?? '');
    const bad = [];
    const sw = [...ws.matchAll(/action=\{<IncludedSwitch [^>]*onChange=\{[^}]*includeOps\(tree, (system|node|off\.node)\.id, (v|true|false)\)/g)].map(m => m[1]);
    if (!(sw.includes('system') && sw.filter(x => x === 'node').length === 2 && sw.includes('off.node'))) bad.push(`Workspace switches: ${JSON.stringify(sw)}`);
    const ui = Object.entries(all).filter(([f]) => /^components\/templates\/[^/]+\.tsx$/.test(f)).map(([f, t]) => [f, strip(t)]);
    for (const [f, t] of ui) if (/Set this (system|group|item) aside|label: 'Set aside'|ops\.setAside\(|ops\.restore\(|>Restore</.test(t)) bad.push(f);
    // owner 2026-11-05 (systems-only menu): off SYSTEMS stay in the menu; off groups/items are the panel's "Switched off"
    // section. (The menu's search was removed 2026-11-06, owner: "I don't think it is needed".)
    if (!/offSystems\.map\(/.test(tree) || !/id=\{SECTION_ID\.off\}/.test(parts)) bad.push('off groups/items/systems not shown');
    if (!/offRows\.map\(/.test(parts)) bad.push('Items panel: off rows not shown');
    return bad;
  },
  'item: no tabs — its rows (Condition · Details · Requirements · Applies when) each open their own screen with back to the item; selecting opens the rows': all => {
    const ws = strip(all['components/templates/Workspace.tsx'] ?? ''), page = strip(all[EDIT] ?? '');
    // Owner 2026-11-07 (mockup CgiHJ5LqFQb4hAFSrAr3ox): one screen shape at every level. Before: one Item tab (2026-11-06).
    // 2026-11-07 (mockup D55cNLEk1gM9B4cHbTtD1q): the item's limitations moved inside Condition; Condition is its first row.
    const at = ws.indexOf('<AboutRows>\n          <FacetRow title="Condition"');
    const rows = at < 0 ? '' : ws.slice(at, ws.indexOf('</AboutRows>', at));
    return at >= 0 && ['Condition', 'Details', 'Requirements', 'Applies when'].every((t, i, a) => rows.indexOf(`<FacetRow title="${t}"`) > (i ? rows.indexOf(`<FacetRow title="${a[i - 1]}"`) : -1))
      && ['condition', 'details', 'requirements', 'applicability'].every(t => new RegExp(`if \\(tab === '${t}'\\) return facet\\('${t}',`).test(ws))
      && /if \(tab === 'limitations'\) return facet\('limitations', <ItemLimitations /.test(ws)
      && /onBack=\{back === 'overview' \? \{ label: node\.label, go: \(\) => setTab\('overview'\) \}/.test(ws)
      && /ops\.switchDetails\(node, on\)/.test(ws) && /ops\.switchRequirements\(node, on\)/.test(ws)
      && /Nothing to record — inspectors won’t see this item\./.test(ws) && !/ReportTab|const visible: ComponentTab/.test(ws)
      && /const select = useCallback\(\(s: Sel\) => \{ setSel\(s\); setMode\('edit'\); setCtab\('overview'\); \}, \[\]\);/.test(page) ? [] : ['components/templates/Workspace.tsx'];
  },
  'property types: picked on the Overview and when creating; shown and filtered on the Templates page': all => {
    const ov = strip(all['components/templates/Sections.tsx'] ?? ''), cr = strip(all['app/app/templates/create/page.tsx'] ?? ''), ls = strip(all['app/app/templates/page.tsx'] ?? '');
    const hk = strip(all['components/templates/HomeKinds.tsx'] ?? '');
    return /<HomeKindsCard tree=\{tree\} onOps=\{onOps\} disabled=\{disabled\} \/>/.test(ov) && /<PropertyTypePicker value=\{pts\}[^>]*onChange=\{v => propose\(v, also\)\}/.test(hk) && /fields\.push\(\.\.\.ops\.propertyTypes\(nextPts\)\)/.test(hk)
      && /forked\.propertyTypes = picked/.test(cr) && /propertyTypesOf\(t\.tree\)\.includes\(ptFilter\)/.test(ls) ? [] : ['components/templates/Sections.tsx'];
  },
  // 2026-11-05 (owner rulings): the kind of home is asked under a Ledrix starting point and the draft is built by
  // buildStarterTree (one validated change set); the Overview edits the pre-mark and the cutoff year only through ops.
  'create: the kind of home is asked under a Ledrix card and the draft is built by buildStarterTree; the Overview edits both fields through ops': all => {
    const cr = strip(all['app/app/templates/create/page.tsx'] ?? ''), ov = strip(all['components/templates/Sections.tsx'] ?? '');
    const out = [];
    if (!/chosen && asksKindOfHome\(chosen\.kind\) && d\.ledrixDefault && \(\s*<KindOfHome /.test(cr)) out.push('KindOfHome is not mounted under a Ledrix starting point');
    if (!/buildStarterTree\(chosen\.kind, forked, d\.ledrixDefault, \{ \.\.\.kindChoice, propertyTypes: picked \}\)/.test(cr) || !/const tree = built\.tree;/.test(cr)) out.push('the draft is not built by buildStarterTree');
    if (!/onOps\(ops\.associationNotInspected\(/.test(ov) || !/onOps\(ops\.olderCutoffYear\(/.test(ov)) out.push('the Overview does not edit the pre-mark / cutoff year through ops');
    return out;
  },
  'create: New template opens the creation page, which only starts a private draft and opens it in the builder': all => {
    const list = strip(all[LIST] ?? ''), page = strip(all['app/app/templates/create/page.tsx'] ?? '');
    return /<Link className=\{btn\.primary\} href="\/app\/templates\/create">/.test(list) && !/NewDialog/.test(list)
      && /await startNewTemplateDraft\(access\.companyId!, \{ name: name\.trim\(\), base: chosen\.base, tree \}\)/.test(page)
      && /router\.push\(`\/app\/templates\/new\?draft=\$\{encodeURIComponent\(draft\.id\)\}`\)/.test(page)
      && !/publishDraft|publish_company_template_draft|\.publish\(/.test(page) ? [] : ['app/app/templates/create/page.tsx'];
  },
  'create: no individual license is collected, import is not offered as working, and no compliance is claimed': all => {
    const page = strip(all['app/app/templates/create/page.tsx'] ?? ''), sp = strip(all['lib/templates/startingPoints.ts'] ?? '');
    const imp = page.slice(page.indexOf('Import a template'), page.indexOf('contact support', page.indexOf('Import a template')));   // the import card only
    return !/license_number|licenseNumber|License #|license number"/i.test(page) && /Coming later/.test(imp) && !/onClick|role="radio"/.test(imp)
      && !/compliant|compliance score|%\s*covered/i.test(page + sp) ? [] : ['app/app/templates/create/page.tsx'];
  },
  'suggest: Ledrix\'s parts are offered inside each type\'s list (and at the end of an untyped system\'s list), added only through suggestOps; no separate catalog box': all => {
    const panel = strip(all['components/templates/CatalogPanel.tsx'] ?? ''), parts = strip(all['components/templates/EditorParts.tsx'] ?? ''), tb = strip(all['components/templates/TypeBuilder.tsx'] ?? '');
    return /\{catTypes\.length > 0 && <li className="px-3 py-2"><LedrixSuggestions tree=\{tree\} system=\{system\} types=\{catTypes\}/.test(tb) && /catalogTypesForAnswer\(tree, system, layout\.question\.field, pick\)/.test(tb)
      && /\{!typeView && catalogTypesForSystem\(system\)\.length > 0 && <LedrixSuggestions /.test(parts) && !/<CatalogPanel/.test(parts)
      && /onOps\(suggestOps\(tree, system, type\.id, ids\)\)/.test(panel) && !/op: '/.test(panel) && !/catalogOps|evidenceOnly|Toggle/.test(panel)
      && /'\+ Add' : '\+ Add as optional'/.test(panel) ? [] : ['components/templates/CatalogPanel.tsx'];
  },
  'types: a type\'s list tags only Ledrix\'s Typical — no "Also:", "Only", or "All types" text — and the chips carry no suggestion count': all => {
    const tb = strip(all['components/templates/TypeBuilder.tsx'] ?? '');
    return !/Also: \{|<Pill>Only |<Pill>All types<\/Pill>/.test(tb) && /matches\[n\.id\] === 'typical' \? <Pill tone="ok">Typical<\/Pill>/.test(tb)
      && /\{v\} <span className="font-normal opacity-70">\{rowsForType\(layout, v\)\.length\}<\/span><\/>/.test(tb) && !/suggestionsFor/.test(tb) ? [] : ['components/templates/TypeBuilder.tsx'];
  },
  'ask ledrix: hidden — no Editor / Ask Ledrix tabs and no assistant panel mounted while ASK_LEDRIX is false (owner 2026-11-05)': all => {
    const e = strip(all[EDIT] ?? '');
    return /const ASK_LEDRIX = false;/.test(e) && /\{ASK_LEDRIX && <div role="tablist" aria-label="Editor mode"/.test(e) && /\{ASK_LEDRIX && <div className=\{`min-h-0 flex-1 \$\{mode === 'ledrix'[\s\S]{0,80}<LedrixPanel/.test(e)
      && (e.match(/<LedrixPanel/g) ?? []).length === 1 ? [] : [EDIT];
  },
  'only what you pick: the special-homes card offers only this template\'s kinds and hides when there are none': all => {
    const p = strip(all['components/templates/SpecialHomesPanel.tsx'] ?? '');
    return /const own = useMemo\(\(\) => new Set\(templateKinds\(tree\)\), \[tree\]\);/.test(p) && /specialRows\(tree, system, source\)\.filter\(r => own\.has\(r\.kind\)\)/.test(p)
      && /if \(isCopiedSystem\(system\) \|\| !source \|\| !rows\.length \|\| rows\.every\(r => r\.inTemplate\)\) return null;/.test(p) ? [] : ['components/templates/SpecialHomesPanel.tsx'];
  },
  'only what you pick: changing a kind on the Overview adds its checkpoints only after review (starterOps) and switches them off only on request (trimNode)': all => {
    const h = strip(all['components/templates/HomeKinds.tsx'] ?? '');
    return /if \(!added\.length && !removedActive\.length\) \{ onOps\(fields\); setPending\(null\); return; \}/.test(h) && /const r = starterOps\(tree, ids, source\);/.test(h)
      && /onOps\(\[\.\.\.pending\.fields, \.\.\.r\.ops\]\)/.test(h) && /\.\.\.\(off \? switchOff\.map\(id => \(\{ op: 'trimNode', nodeId: id \}\)/.test(h) && !/op: 'addNode'/.test(h) ? [] : ['components/templates/HomeKinds.tsx'];
  },
  'group first: a system without type chips lists its groups (no Materials first / Full list switch), a group opens its own screen with everything set in it; typed systems keep their chips and draw a materials section as rows': all => {
    const ep = strip(all['components/templates/EditorParts.tsx'] ?? ''), tb = strip(all['components/templates/TypeBuilder.tsx'] ?? '');
    const ws = strip(all['components/templates/Workspace.tsx'] ?? ''), gl = strip(all['components/templates/GroupList.tsx'] ?? '');
    return /const byGroups = !typeView;/.test(ep) && /\{byGroups && <GroupList tree=\{tree\} system=\{system\}/.test(ep) && /<div className=\{laidOut \? 'hidden' : ''\}>/.test(ep)
      && !/Materials first|setFullList/.test(ep) && /<GroupItems tree=\{tree\} system=\{system\} groupId=\{node\.id\}/.test(ep)
      && /<GroupDetails tree=\{tree\} system=\{system\} node=\{node\}/.test(ws) && /onClick=\{onOpen\}/.test(gl) && /onOpenGroup=\{id => onSelect\(\{ systemId: system\.id, nodeId: id \}\)\}/.test(ep)
      && /const mq = materialQs\.find\(q => q\.field === g\.key\);\s*if \(mq\) return section\(/.test(tb) ? [] : ['components/templates/EditorParts.tsx'];
  },
  'materials: the materials view adds, removes and opens only through materialLayout ops and the editor\'s addItem': all => {
    const mb = strip(all['components/templates/MaterialsBuilder.tsx'] ?? '');
    // Owner 2026-11-06 (mockup LZNLt31XvGjAnMrhhmWL2t): Remove is an On/Off switch, and an Off material stays listed.
    return /if \(!v\) onOps\(removeMaterialOps\(q, r\.value\)\)/.test(mb) && /if \(v\) onOps\(switchMaterialOnOps\(q, o\)\)/.test(mb) && /\{q\.off\.length > 0 && \(<>/.test(mb)
      && /const o = addMaterialOps\(tree, system, q, name\);/.test(mb) && /onOps\(ops\.addItem\(tree, system\.id, groupId, name\)\)/.test(mb)
      && !/op: '/.test(mb) ? [] : ['components/templates/MaterialsBuilder.tsx'];
  },
  'group screen: a group lists its items, one kind of row for all — a materials question\'s cards are not rows there; its answers, cards and switches open inside that question\'s own item, under Details': all => {
    // Owner 2026-11-06 (Cladding screenshot): "This should not show the list of options till we tap into siding. Then it's all
    // the same whether it's siding, trim, or any other component." ("Checked in every home" stays gone too.)
    const mb = strip(all['components/templates/MaterialsBuilder.tsx'] ?? ''), ws = strip(all['components/templates/Workspace.tsx'] ?? '');
    return !/Checked in every home/i.test(mb)
      && /const cards = new Set\(\(layout\.find\(g => g\.node\.id === groupId\)\?\.questions \?\? \[\]\)\.flatMap\(q => \[\.\.\.q\.rows\.map\(r => r\.card\?\.id\), q\.typed\?\.id\]\)/.test(mb)
      && /const rows = \(group\?\.children \?\? \[\]\)\.filter\(c => !cards\.has\(c\.id\) && \(!lens \|\| lens\.isIn\(c\.id\)\)\);/.test(mb)
      && /\.filter\(q => q\.node\.id === node\.id\)/.test(mb) && /<MaterialQuestionRows q=\{q\} tree=\{tree\} system=\{system\}/.test(mb)
      && /\{detailsOn && <><MaterialAnswers tree=\{tree\} system=\{system\} node=\{node\}/.test(ws) ? [] : ['components/templates/MaterialsBuilder.tsx'];
  },
  'rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on': all => {
    // Owner 2026-11-06: "should all of these rows have the 3 dot menu…" → "build it, no mock up, yes switch off not delete".
    const ir = strip(all['components/templates/ItemRow.tsx'] ?? ''), mb = strip(all['components/templates/MaterialsBuilder.tsx'] ?? '');
    const tb = strip(all['components/templates/TypeBuilder.tsx'] ?? ''), ep = strip(all['components/templates/EditorParts.tsx'] ?? '');
    return /<button className="min-w-0 flex-1 py-1 text-left" onClick=\{\(\) => onOpen\(node\.id\)\}>/.test(ir)
      && /\{ label: 'Rename', disabled: disabled && LOCKED, onSelect: \(\) => \{ setV\(node\.label\); cancelled\.current = false; setRenaming\(true\); \} \}/.test(ir)
      && /if \(t && t !== node\.label\) onOps\(ops\.rename\(node\.id, t\)\);/.test(ir) && /if \(e\.key === 'Escape'\) \{ cancelled\.current = true;/.test(ir)
      && /\{ label: 'Move to…', disabled: \(disabled && LOCKED\) \|\| moveBlockFor\(tree, node\.id\) \|\| false, onSelect: \(\) => setMoving\(true\) \}/.test(ir)
      && /<MoveToDialog tree=\{tree\} nodeId=\{node\.id\} onOps=\{onOps\}/.test(ir)
      && /\{ label: 'Switch off', disabled: disabled && LOCKED, onSelect: \(\) => \{ onOps\(lens \? lens\.set\(node\.id, false\) : includeOps\(tree, node\.id, false\)\); \} \}/.test(ir)
      && !/label: 'Delete'|removeNode|op: '/.test(ir)
      && /rows\.map\(n => <ItemRow key=\{n\.id\} tree=\{tree\} node=\{n\} onOps=\{onOps\}/.test(mb)
      && /return <ItemRow key=\{n\.id\} tree=\{tree\} node=\{n\} onOps=\{apply\}/.test(tb)
      && /\{ label: 'Switch on', disabled: disabled && [^,]+, onSelect: \(\) => \{ onOps\(building && lens \? lens\.set\(t\.id, true\) : includeOps\(tree, t\.id, true\)\); \} \}/.test(ep)
      ? [] : ['components/templates/ItemRow.tsx'];
  },
  'fireplace: each type chip draws its We operate it switch from canStartLimited, writing only through ops.operates and ops.startsSentence': all => {
    const tb = strip(all['components/templates/TypeBuilder.tsx'] ?? '');
    // Water Heater (2026-11-06): an item every type shows (TPR) gets ONE switch for every type ('*'), INSIDE its own item
    // screen (owner: "should be inside the details of the TPR valve section not at the beginning of water heater"); a type's
    // own item, one per chip.
    const ws = strip(all['components/templates/Workspace.tsx'] ?? '');
    return !/layout\.every\.filter\(canStartLimited\)/.test(tb)
      && /if \(!layout \|\| !canStartLimited\(node\) \|\| !layout\.every\.some\(n => n\.id === node\.id\)\) return null;/.test(tb)
      && /<OperatesSwitch node=\{node\} field=\{layout\.question\.field\} value="\*"/.test(tb)
      && /if \(tab === 'limitations'\) return facet\('limitations', <ItemLimitations tree=\{tree\} part=\{node\}[^\n]*\n\s*policy=\{<EveryTypeOperates tree=\{tree\} system=\{system\} node=\{node\}/.test(ws)
      && /\{own\.filter\(canStartLimited\)\.map\(n => \(\s*<OperatesSwitch key=\{n\.id\} node=\{n\} field=\{layout\.question\.field\} value=\{pick\}/.test(tb)
      && /onChange=\{v => \{ onOps\(ops\.operates\(node, f, value, v\)\); \}\}/.test(tb)
      && /onBlur=\{\(\) => \{ if \(!text\.trim\(\)\) \{ setText\(entry\.sentence\); return; \} onOps\(ops\.startsSentence\(node, f, value, text\)\); \}\}/.test(tb)
      && /const on = !entry;/.test(tb) && !/'startsLimited'/.test(tb) ? [] : ['components/templates/TypeBuilder.tsx'];
  },
  'advisories: Create a template shows the picker and puts the picked list on the new draft; the Template Builder\'s Report section edits it through advisoryOps': all => {
    const cp = strip(all['app/app/templates/create/page.tsx'] ?? ''), se = strip(all['components/templates/Sections.tsx'] ?? ''), pg = strip(all['app/app/templates/[id]/page.tsx'] ?? '');
    return /<AdvisoriesEditor value=\{advisories\} onChange=\{setAdvisories\} suggest=\{suggestAdv\} onSuggest=\{setSuggestAdv\} \/>/.test(cp)
      && /if \(suggestAdv\) delete tree\.suggestAdvisories; else tree\.suggestAdvisories = false;/.test(cp) && /useState<Advisory\[\]>\(\(\) => presetAdvisories\(\)\)/.test(cp)
      && /if \(advisories\.length\) tree\.advisories = JSON\.parse\(JSON\.stringify\(advisories\)\); else delete tree\.advisories;/.test(cp)
      && /<AdvisoriesEditor value=\{advisories\} onChange=\{l => \{ onOps\(advisoryOps\(l\)\); \}\} suggest=\{tree\.suggestAdvisories !== false\}\s*onSuggest=\{on => \{ onOps\(suggestOps\(on\)\); \}\} disabled=\{disabled\} \/>/.test(se)
      && !/They are set by Ledrix and can’t be edited here/.test(se) && /<ReportSection tree=\{tree\} onGo=\{go\} onOps=\{onOps\} disabled=\{!!readOnly\} \/>/.test(pg)
      ? [] : ['components/templates/AdvisoriesEditor.tsx'];
  },
  'advisories: with No, the picker hides each rule and Suggest / Always add; with Yes a rule shows as its sentence and the picker opens only on Change; the rule controls are not full width': all => {
    const ae = strip(all['components/templates/AdvisoriesEditor.tsx'] ?? '');
    return /\{suggest && <>\{ruleSentence\(r\)\} · <button/.test(ae) && /\{suggest && isOpen\(a\.id, 'rule'\) && \(/.test(ae)
      && /\{suggest && picked && r\.kind !== 'never' && \(\s*<ModeToggle/.test(ae) && /<Toggle on=\{suggest\} label="Suggest advisories from the home’s details"/.test(ae)
      && /const inline = field\.replace\(\/\\bw-full\\b\\s\*\/, ''\);/.test(ae) && !/className=\{`\$\{field\}[^`]*text-xs`\}/.test(ae) ? [] : ['components/templates/AdvisoriesEditor.tsx'];
  },
  'group first: each group row\'s ⋯ renames it in the row, moves it up / down or to another system, or switches it off; the add box adds a group (or an item when there are none) — all through the editor\'s ops': all => {
    const gl = strip(all['components/templates/GroupList.tsx'] ?? '');
    return /if \(t && t !== g\.label\) onOps\(ops\.rename\(g\.id, t\)\);/.test(gl) && /onSelect: \(\) => \{ onOps\(ops\.move\(g\.id, system\.id, idx - 1\)\); \}/.test(gl)
      && /onSelect: \(\) => \{ onOps\(ops\.move\(g\.id, system\.id, idx \+ 1\)\); \}/.test(gl) && /\{ label: 'Move to…', disabled: \(disabled && LOCKED\) \|\| moveBlockFor\(tree, g\.id\) \|\| false/.test(gl)
      && /\{ label: 'Switch off', disabled: disabled && LOCKED, onSelect: \(\) => \{ onOps\(lens \? lens\.set\(g\.id, false\) : includeOps\(tree, g\.id, false\)\); \} \}/.test(gl)
      && /onOps\(ops\.addItem\(tree, system\.id, system\.id, name, groups\.length \? 'subsystem' : 'component'\)\)/.test(gl) && !/op: '/.test(gl) ? [] : ['components/templates/GroupList.tsx'];
  },
  'back: every panel has a back arrow at the top left, beside its icon, going up ONE level (item → its group → the system; a type-chip system\'s item → the system); no X to close': all => {
    // Owner 2026-11-06: "Can we also get a back button in the top left corner … next to the home icon … You can remove the x".
    const ws = strip(all['components/templates/Workspace.tsx'] ?? '');
    return /const up = !typeView && loc\.parent && loc\.parent\.id !== system\.id && loc\.parent\.kind !== 'component' \? loc\.parent : null;/.test(ws)
      && /const close = \{ label: up \? up\.label : system\.label, go: \(\) => onSelect\(\{ systemId: system\.id, nodeId: up \? up\.id : null \}\) \};/.test(ws)
      && (ws.match(/onBack=\{close\}/g) ?? []).length === 3
      && /<header className="flex items-start gap-3 px-4 pt-3">\s*\{onBack && <button type="button" aria-label=\{`Back to \$\{onBack\.label\}`\}[^>]*onClick=\{onBack\.go\}/.test(ws)
      && !/Close item|onClose=\{close\}|M6 6l12 12M18 6L6 18/.test(ws) ? [] : ['components/templates/Workspace.tsx'];
  },
  'buildings: a building picker atop the systems column (the home, then each building; ‹ › step); with a building selected every list, Off list and switch in Systems reads it; the Building Types tab is gone; Create a template asks which other buildings come with the home': all => {
    // Owner 2026-11-06 (mockup HHfBh3wvLanc1CG4UcNxaU): "the template builder should be like the phone. We should have building
    // types at the top and they can tap left/right to change building in the system they are in" → "Approved. Build and push".
    const pg = strip(all[EDIT] ?? ''), bl = strip(all['components/templates/BuildingLens.tsx'] ?? ''), ws = strip(all['components/templates/Workspace.tsx'] ?? '');
    const gl = strip(all['components/templates/GroupList.tsx'] ?? ''), ep = strip(all['components/templates/EditorParts.tsx'] ?? ''), tr = strip(all['components/templates/Tree.tsx'] ?? '');
    const mb = strip(all['components/templates/MaterialsBuilder.tsx'] ?? ''), tb = strip(all['components/templates/TypeBuilder.tsx'] ?? ''), cp = strip(all['app/app/templates/create/page.tsx'] ?? '');
    // 2026-11-06 (mockup 28zjLMm9yntyJYgbKHcPbZ): the strip became a dropdown at the top of the systems column.
    return /<BuildingPicker tree=\{tree\} value=\{building\} onChange=\{setBuilding\}/.test(pg) && /<BuildingLensProvider tree=\{tree\} buildingId=\{building\}>/.test(pg)
      && !/\{ id: 'buildings', label:/.test(pg) && !/BuildingTypesPanel/.test(pg)
      && /const ids: Array<string \| null> = \[null, \.\.\.buildings\.map\(b => b\.id\)\];/.test(bl) && /const step = \(d: number\) => onChange\(ids\[/.test(bl)
      && /return \{ building: b, isIn: id => inBuilding\(b, tree, id, pm\), set: \(id, on\) => partOps\(tree, b\.id, id, on\), offIn: sys => offPartsIn\(b, tree, sys\) \};/.test(bl)
      && /on=\{lens \? lens\.isIn\(node\.id\) : true\}/.test(ws) && /const kids = \(system\.children \?\? \[\]\)\.filter\(c => !lens \|\| lens\.isIn\(c\.id\)\);/.test(gl)
      && /lens\.offIn\(system\.id\)/.test(ep) && /const covered = lens \? lens\.isIn\(s\.id\) : isCovered\(tree, s\);/.test(tr)
      && /\(!lens \|\| lens\.isIn\(c\.id\)\)/.test(mb) && /if \(lens && !lens\.isIn\(n\.id\)\) return null;/.test(tb)
      && /What other buildings do you include with a/.test(cp) && /tree\.structureTypes = \[\.\.\.seeded, \.\.\.own\];/.test(cp)
      ? [] : ['components/templates/BuildingLens.tsx'];
  },
  'limitations: a Limitations row opens each part’s own — when the inspector records it, what the checklist does, what the report says; a tap edits it there': all => {
    // Owner 2026-11-06: "Should this be called limitations?" · "even here the what happens seems vague or confusing".
    // Owner 2026-11-07 (mockup FSTfPJUMmjGDVFqiqneD6o): in each system, under its groups. Deeper: verify-limitations.mjs.
    const gp = strip(all['components/templates/GatesPanel.tsx'] ?? '');
    // Owner 2026-11-07 (mockup CgiHJ5LqFQb4hAFSrAr3ox): a Limitations row first in every system, group and item.
    return /export function LimitationsRow\(/.test(gp) && /export function PartLimitations\(/.test(gp) && /When the inspector records/.test(gp) && /On the checklist/.test(gp) && /In the report/.test(gp)
      && /onClick=\{\(\) => setOpen\(isOpen \? null : g\.id\)\}/.test(gp) && /\{isOpen && <GateEditor /.test(gp) ? [] : ['components/templates/GatesPanel.tsx'];
  },
  'move: the ⋯ menu on a group and an item offers Move to…, disabled with the reason when it cannot move; the dialog moves only through moveOps': all => {
    const w = strip(all['components/templates/Workspace.tsx'] ?? ''), d = strip(all['components/templates/MoveTo.tsx'] ?? '');
    return (w.match(/menu=\{moveMenu\(node\.id\)\}/g) ?? []).length === 2 && (w.match(/\{moveDialog\}/g) ?? []).length === 2
      && /disabled: \(disabled && 'The draft can’t change right now\.'\) \|\| moveBlockFor\(tree, id\) \|\| false/.test(w)
      && /const o = fresh \? moveIntoNewGroupOps\(tree, nodeId, t!\.system\.id, newGroup!\) : home \? moveOps\(tree, nodeId, home\.id, after\) : \[\];/.test(d)
      && /onSubmit=\{e => \{ e\.preventDefault\(\); addGroup\(\); \}\}/.test(d) && /onClick=\{\(\) => \{ if \(onOps\(o\)\)/.test(d) && !/op: '/.test(d) ? [] : ['components/templates/Workspace.tsx'];
  },
  'buildings: the strip and its model write building types only as ONE setTemplateField structureTypes — no other op, no other store': all => {
    const m = strip(all['lib/templates/buildingModel.ts'] ?? ''), l = strip(all['components/templates/BuildingLens.tsx'] ?? '');
    const opsUsed = [...(m + l).matchAll(/op: '(\w+)'/g)].map(x => x[1]);
    return opsUsed.length > 0 && opsUsed.every(o => o === 'setTemplateField') && (m.match(/field: 'structureTypes'/g) ?? []).length >= 3
      && !/fetch\(|supabase/i.test(m + l) ? [] : ['lib/templates/buildingModel.ts'];
  },
  // Phase A (2026-10-25) — templates may CARRY requirements, but no company may publish ones the app can't enforce yet,
  // and no desktop control can author them yet (owner decisions 2 and 4).
  // 2026-10-25 (owner-workflow e2e): an item added directly under a system that has groups gets no card in the app
  // (ScopeScreen tileNodesOf) — the editor only offers groups as an item's home there, and flags any such item.
  'editor: an item is never added where inspectors cannot see it': all => {
    const s = strip(all['components/templates/EditorParts.tsx'] ?? '');
    return (/const homes = kind === 'component' && hasGroups \? groups\.filter\(g => g\.id !== system\.id\) : groups;/.test(s)
      && /\{homes\.map\(g => <option/.test(s) && /const unseen = !group && parentId === system\.id && hasGroups;/.test(s)) ? [] : ['components/templates/EditorParts.tsx'];
  },
  'editor: a duplicate choice is reported, not silently dropped': all =>
    /if \(dup\) \{ setNote\(/.test(strip(all['components/templates/ui.tsx'] ?? '')) ? [] : ['components/templates/ui.tsx'],
  // Stage 2 (2026-10-27): item requirements PUBLISH (the phone checks them before the report is sent, soft). Only what
  // inspections still can't use — changes to Ledrix's own default rules — holds Publish.
  'requirements: publishing refuses what inspections can’t use yet — in the hook, before the RPC': all => {
    const hook = strip(all['lib/templates/useDraft.ts'] ?? ''), rm = strip(all['lib/templates/requirementModel.ts'] ?? '');
    if (!/carriedRequirements\(tree\)\.filter\(x => !x\.startsWith\('requirements on '\)\)/.test(rm)) return ['lib/templates/requirementModel.ts'];
    const gate = hook.indexOf('const reqs = unpublishableRequirements(m0.core.tree);'), rpc = hook.indexOf('return publishDraft(');
    return (gate > 0 && rpc > gate && /if \(reqs\.length\) throw new TemplateApiError\('invalid', 'requirements_unsupported'/.test(hook)) ? [] : ['lib/templates/useDraft.ts'];
  },
  // 2026-10-26 (owner authorization): requirements may be DRAFTED on items in the website — through one writer,
  // editorModel ops.setRequirements, over the shared contract — and still never published (rule above). Nothing in
  // the website writes the Ledrix default-set pin or its overrides.
  'requirements: only editorModel.setRequirements writes them; nothing writes the default-set pin or overrides': all => {
    const bad = Object.entries(all).filter(([f, s]) => /^(components|app)\//.test(f) && /field: '(requirements|requirementDefaults|requirementOverrides)'|requirementOverrides|requirementDefaults|\.requirements\b/.test(strip(s))).map(([f]) => f);
    for (const [f, s] of Object.entries(all).filter(([f]) => f.startsWith('lib/templates/'))) {
      const x = strip(s);
      if (/field: '(requirementDefaults|requirementOverrides)'|'requirement(Defaults|Overrides)'\s*,\s*value/.test(x)) bad.push(f);
      // publishFixes names the Requirements section and tab ('requirements') and reads the lists; it writes nothing itself.
      if (f === 'lib/templates/publishFixes.ts') { if (/setNodeField|setField\(|op: '/.test(x)) bad.push(f); continue; }
      const writes = (x.match(/'requirements'/g) ?? []).length;
      if (f === 'lib/templates/editorModel.ts' ? !(writes === 1 && /setRequirements: \(nodeId: string, defs: readonly unknown\[\]\): TemplateOp\[\] => \[setField\(nodeId, 'requirements', /.test(x)) : writes > 0) bad.push(f);
    }
    return bad;
  },
  'requirements: the Publish button is disabled with the reason while the draft carries what inspections can’t use': all => {
    const e = strip(all[EDIT] ?? '');
    return (/const reqs = unpublishableRequirements\(tree\);/.test(e) && /: reqs\.length \? `Not publishable yet — inspections can’t use/.test(e)
      && /const canPublish = !publishBlock && /.test(e) && /disabled=\{!canPublish\} title=\{publishBlock \?\? 'Changes the live template — for new inspections only\.'\}/.test(e)) ? [] : [EDIT];
  },
  // 2026-10-26: the six sections each render a real view of the draft (no dead navigation), and the inspector preview
  // renders the draft tree itself.
  'workspace: every section in the rail renders its view': all => {
    const e = strip(all[EDIT] ?? '');
    // 2026-11-06 (owner, guided builder): steps in the rail; Overview is the summary (reachable, rendered, not a step).
    // 2026-11-07 (owner): three — Limitations moved into each system.
    const ids = ['systems', 'report', 'review'];
    return ids.every(id => new RegExp(`\\{ id: '${id}', label: `).test(e) && new RegExp(`section === '${id}' \\? 'flex'|section === '${id}' && `).test(e))
      && /section === 'overview' && \(/.test(e) && /<RequirementsSection tree=\{tree\} onGo=\{go\} \/>/.test(e) && !/CountsPanel/.test(e) ? [] : [EDIT];
  },
  'workspace: the inspector preview renders the draft tree': all => /<PhonePreview tree=\{tree\} selection=\{sel\}/.test(strip(all[EDIT] ?? '')) ? [] : [EDIT],
  'applicability: rules are written only in the runtime\'s shape (ruleModel.writeRule)': all => {
    const r = strip(all['components/templates/RuleEditor.tsx'] ?? '');
    return /const next = writeRule\(conds\);/.test(r) && /onSave\(next\)/.test(r) && !/appliesWhen/.test(r) ? [] : ['components/templates/RuleEditor.tsx'];
  },
  'types: a typed system shows the by-type layout in its panel (never in the menu), and the preview answers with the chosen type': all => {
    const page = strip(all[EDIT] ?? ''), parts = strip(all['components/templates/EditorParts.tsx'] ?? ''), tree = strip(all['components/templates/Tree.tsx'] ?? ''), pv = strip(all['components/templates/PhonePreview.tsx'] ?? '');
    return (/typeLayoutOf\(tree, s, defs\)/.test(page) && /const defs = rulesFor\(tree\)/.test(page) && /<PhonePreview tree=\{tree\} selection=\{sel\} onSelect=\{s => select\(s\)\} answer=\{answer\}/.test(page)
      && /typeView=\{selView\}/.test(page)
      && /<TypeBuilder tree=\{tree\} system=\{system\} layout=\{typeView\.layout\}/.test(parts) && !/typeViewFor|typedRows/.test(tree)
      && /if \(answer\) next\[answer\.key\] = \[answer\.value\];/.test(pv)) ? [] : [EDIT, 'components/templates/EditorParts.tsx', 'components/templates/Tree.tsx', 'components/templates/PhonePreview.tsx'];
  },
  'types: the grid writes rules only through typeRuleOps (the validated appliesWhen op), never a rule field of its own': all => {
    const s = strip(all['components/templates/TypeBuilder.tsx'] ?? '');
    return (/typeRuleOps\(tree, layout,/.test(s) && !/field:\s*'(appliesWhen|requires|dependsOnSpec)'/.test(s) && !/op:\s*'setNodeField'/.test(s)) ? [] : ['components/templates/TypeBuilder.tsx'];
  },
  // SECOND PASS (owner 2026-11-05: "I don't think we need the breakdown on the left menu … Having it in both is confusing
  // and the screen jumps around").
  // owner 2026-11-05 (fourth pass): "I almost feel like the left menu should be systems only. Components are in the working
  // area of the page." The type sections, special homes and switched-off parts are sections in the panel.
  'menu: the left menu is systems only (count, reorder, off), with no search box — items, groups and type sections live in the work area; the add button adds a system; the save / publish note is a hover note': all => {
    const t = strip(all['components/templates/Tree.tsx'] ?? ''), b = strip(all['components/templates/TypeBuilder.tsx'] ?? '');
    const a = t.indexOf('{shown.map((s, i) => {'), sysRow = a < 0 ? '' : t.slice(a, t.indexOf('{offSystems.map(', a));
    const e = strip(all[EDIT] ?? '');
    return (!/\.children \?\? \[\]\)\.map\(c => /.test(t) && !/typedRows|sectionRow|offRow\(|AddToTemplate/.test(t)
      && /onClick=\{\(\) => onSelect\(\{ systemId: s\.id, nodeId: null \}\)\}/.test(sysRow) && /\{itemCount\(s\)\}/.test(sysRow) && /ops\.move\(s\.id, null, i - 1\)/.test(sysRow)
      && !/<input[^>]*Search systems|findIn\(|setQ\(/.test(t) && /const shown = tree\.systems;/.test(t)
      && !/Save draft keeps changes private/.test(e) && /title=\{`Keeps changes private\$\{server \? ' and shared with your owner and admins' : ' in this browser'\}\. The live template doesn’t change\.`\}>Save draft</.test(e)
      && /const o = ops\.addSystem\(tree, v\);/.test(t) && />\+ Add system</.test(t) && !/Add system \/ component/.test(t)
      // the panel's type lists keep the shared items (third pass): no "Every" section anywhere
      && !/Every \$\{(s|system)\.label/.test(t + b) && !/SECTION_ID\.every|tb-sec-every/.test(t + b)
      && /rowsForType\(layout, v\)\.length/.test(b)
      && /section\(SECTION_ID\.type, pick, rowsForType\(layout, pick\)\.length, <>\s*\{row\(layout\.questionNode, <Pill tone="accent">The type question<\/Pill>\)\}[\s\S]{0,160}?\{layout\.every\.map\(n => row\(n, tagOf\(n\)\)\)\}\s*\{own\.map\(n => row\(n, tagOf\(n\)\)\)\}/.test(b)) ? [] : ['components/templates/Tree.tsx', 'components/templates/TypeBuilder.tsx'];
  },
  // owner 2026-11-05: "merge those two by putting a pencil next to the system name to edit it" — systems, groups and items.
  'names: a system, group or item is renamed by the pencil beside its title, with no separate Name box': all => {
    const w = strip(all['components/templates/Workspace.tsx'] ?? ''), e = strip(all['components/templates/EditorParts.tsx'] ?? '');
    return (/kind="System" title=\{system\.label\} onRename=\{v => onOps\(ops\.rename\(system\.id, v\)\)\}/.test(w)
      && /kind="Group" title=\{node\.label\}[^>]*onRename=\{v => onOps\(ops\.rename\(node\.id, v\)\)\}/.test(w)
      && /kind="Component" title=\{node\.label\}[^>]*onRename=\{node\.pointsTo \? undefined : v => onOps\(ops\.rename\(node\.id, v\)\)\}/.test(w)
      && /<TitleName title=\{title\} kind=\{kind\} onRename=\{onRename\}/.test(w) && /aria-label=\{`Rename \$\{name\}`\}/.test(w)
      && !/ariaLabel="(System|Group|Item) name"/.test(e)) ? [] : ['components/templates/Workspace.tsx', 'components/templates/EditorParts.tsx'];
  },
  // owner 2026-11-05: "called tips … Yes to all 3" — the box is Tips, and the preview shows the ⓘ the phone shows.
  'tips: the description box is called Tips, and the phone preview marks company Tips with the ⓘ, never a line under the name': all => {
    // owner 2026-11-05: "move tips up beside the pencil and system title like the phone uses" — an ⓘ in the panel title
    // (blue when written) opens the Tips box; no Tips/Guidance box in the panel bodies.
    const e = strip(all['components/templates/EditorParts.tsx'] ?? ''), pv = strip(all['components/templates/PhonePreview.tsx'] ?? ''), w = strip(all['components/templates/Workspace.tsx'] ?? '');
    return (!/>Guidance</.test(e) && !/>Tips</.test(e) && !/ops\.describe\(/.test(e)
      && /\{tips && <TipsButton has=\{!!tips\.value\.trim\(\)\} open=\{tipsOpen\}/.test(w) && /\{tips && tipsOpen && <TipsBox /.test(w)
      && /has \? 'border-accent bg-accent text-white' : 'border-muted text-muted'/.test(w)
      && /kind="System"[\s\S]{0,240}?tips=\{\{ value: system\.description \?\? '', what: 'system', onCommit: v => onOps\(ops\.describe\(system\.id, v\)\) \}\}/.test(w)
      && /kind="Group"[\s\S]{0,240}?tips=\{\{ value: node\.description \?\? '', what: 'group',/.test(w)
      && /kind="Component"[\s\S]{0,240}?tips=\{\{ value: node\.description \?\? '', what: 'item',/.test(w)
      && /blue ⓘ beside the item on the phone/.test(w)
      && /className="pv-tips"/.test(pv) && !/<span className="pv-guide">\{n\.description\}<\/span>/.test(pv)) ? [] : ['components/templates/EditorParts.tsx', 'components/templates/PhonePreview.tsx', 'components/templates/Workspace.tsx'];
  },
  'types: the type chips wrap (never a sideways-scrolling row with the chosen chip out of sight)': all => {
    const b = strip(all['components/templates/TypeBuilder.tsx'] ?? '');
    const m = b.match(/<div className="([^"]*)" role="group" aria-label=\{`\$\{systemLabel\} types`\}>/);
    return m && /\bflex-wrap\b/.test(m[1]) && !/overflow-x/.test(m[1]) ? [] : ['components/templates/TypeBuilder.tsx'];
  },
  'types: no jumping — a new selection opens its panel at the top, a section row scrolls only the editor box, nothing calls scrollIntoView': all => {
    const w = strip(all['components/templates/Workspace.tsx'] ?? ''), t = strip(all['components/templates/Tree.tsx'] ?? ''), b = strip(all['components/templates/TypeBuilder.tsx'] ?? '');
    return (/useLayoutEffect\(\(\) => \{ if \(box\.current\) box\.current\.scrollTop = 0; \}, \[scrollKey\]\);/.test(w)
      && /b\.scrollTop = Math\.max\(0, el\.getBoundingClientRect\(\)\.top - b\.getBoundingClientRect\(\)\.top \+ b\.scrollTop - 8\);/.test(w)
      && (w.match(/<Shell scrollKey=\{sk\} reveal=\{reveal\} kind=/g) ?? []).length === 5 && !/<Shell kind=/.test(w)
      && ![w, t, b].some(x => /scrollIntoView/.test(x))) ? [] : ['components/templates/Workspace.tsx', 'components/templates/Tree.tsx'];
  },
  'building types: publishing refuses an error — in the hook, before the RPC, and on the button': all => {
    const hook = strip(all['lib/templates/useDraft.ts'] ?? ''), edit = strip(all[EDIT] ?? '');
    const gate = hook.indexOf("validateStructureTypes(m0.core.tree).find(i => i.severity === 'error')"), rpc = hook.indexOf('return publishDraft(');
    return (gate > 0 && rpc > gate && /if \(bad\) throw new TemplateApiError\('invalid', 'structure_types'/.test(hook)
      && /: bIssues\.errors\.length \? `Fix the building types first:/.test(edit) && /disabled=\{busy \|\| !!publishBlock\} title=\{publishBlock \?\? undefined\} onClick=\{\(\) => doPublish\(false\)\}/.test(edit)) ? [] : ['lib/templates/useDraft.ts', EDIT];
  },
};

console.log('static');
const all = loadAll();
ok('the builder files exist', [ROUTE, API, LIST, EDIT, 'lib/templateBuilder/session.ts', 'components/templates/PhonePreview.tsx'].every(f => !!all[f]));
ok('the retired single-purpose route is gone', !existsSync(join(ROOT, 'app/api/template-authoring')));
for (const [name, rule] of Object.entries(RULES)) { const bad = rule(all); ok(name, bad.length === 0, bad.join(', ')); }

// ── 4. Mutations ──────────────────────────────────────────────────────────────────────────────────────────
console.log('mutations');
const add = (f, x) => s => ({ ...s, [f]: (s[f] ?? '') + x });
const rep = (f, a, b) => s => ({ ...s, [f]: (s[f] ?? '').replace(a, () => b) });
const MUT = {
  'details: the preview runs the app’s whatsHere.ts on the rules a new inspection captures, and the pack’s askIn / type rows': rep('components/templates/phonePreviewModel.ts', "...(ASK_IN.has(id) ? { askIn: 'inspect' } : {})", ''),
  'details: on the preview a Details field is one line, not a grid (Change opens it); a described item leaves the walk and folds into one line on its page': rep('components/templates/PhonePreview.tsx', '{gridAttrs.map((a, i) => (', '{ax.attributes.map((a, i) => ('),
  'details: every item row says where it is asked — Details (a spec Pre-Inspect asks) and/or Condition (judged in Inspect)': rep('components/templates/ItemRow.tsx', 'const inInspect = !node.pointsTo && assessesCondition(node);', 'const inInspect = false;'),
  'preview: each item row is titled as Scope titles it (previewRowTitle — the Furnace by its picked type)': rep('components/templates/PhonePreview.tsx', '<span className="pv-ct">{previewRowTitle(n, picks)}', '<span className="pv-ct">{n.label}'),
  'writes: only lib/templates/api.ts writes to the database': add('components/templates/LedrixPanel.tsx', "\nworkspace.from('company_templates').update({ name: 'x' });"),
  'writes: only the three template tables, the company template context and the publish RPC': add(API, "\nworkspace.from('anomalies').select('id');"),
  'writes: every update names the next version (row_version)': rep(API, "update({ name: name.trim(), row_version: t.rowVersion + 1 })", "update({ name: name.trim() })"),
  'writes: the live template is never inserted, upserted or hard-deleted from the browser': add(API, "\nworkspace.from('company_templates').delete().eq('id', x);"),
  'isolation: no inspection, finding or snapshot table is touched': add('lib/templates/useDraft.ts', "\nworkspace.from('inspection_templates').select('*');"),
  'isolation: browser storage is written only by draftStore': add(EDIT, "\nlocalStorage.setItem('x', '1');"),
  'where you left off: lastPlace keeps only the place (selection, section, tab, type chips, labels), never template content, and the editor restores it before the draft loads': rep('lib/templates/lastPlace.ts', '  typePick: Record<string, string>;', '  typePick: Record<string, string>;\n  tree: unknown;'),
  'isolation: the phone preview reads the draft and writes nothing': add('components/templates/PhonePreview.tsx', "\nfetch('/api/x');"),
  'no model key or service-role key in browser code': add('components/templates/LedrixPanel.tsx', "\nconst k = process.env.GATEWAY_KEY;"),
  'route: requires a signed-in user': rep(ROUTE, 'admin.auth.getUser(token)', 'admin.auth.getUser()'),
  "route: owner/admin, working on their own company's template or draft": rep(ROUTE, ".eq('id', templateId as string).eq('company_id', profile.company_id)", ".eq('id', templateId as string)"),
  'editor: the condition switch shows the app rule, not the raw field': rep('components/templates/Workspace.tsx', "'Satisfactory · Limitation · Finding', assessesCondition(node),", "'Satisfactory · Limitation · Finding', node.condition === true,"),
  'route: the prompt is built on the server': rep(ROUTE, 'askModel(prompt.system, prompt.user)', 'askModel(String((body as any).system), prompt.user)'),
  'route: the cost cap is counted before the model is called': rep(ROUTE, 'const used = await bumpUsage(admin, user.id);', 'const used = 0;'),
  'route: the reply shape is normalized before grades are filtered and the browser checks it': all => /normalizeChanges\(\(parsed as \{ changes: unknown\[\] \}\)\.changes\)/.test(strip(all[ROUTE] ?? '')) ? [] : [ROUTE],
  'route: the reply shape is normalized before grades are filtered and the browser checks it': rep(ROUTE, 'normalizeChanges((parsed as { changes: unknown[] }).changes)', '(parsed as { changes: unknown[] }).changes'),
  'route: grades are filtered out before the owner sees them': rep(ROUTE, '.filter(c => !isGradeChange(c))', '.filter(Boolean)'),
  'pages: editing is for owners and admins only': rep(EDIT, 'if (!access.companyId || !author)', 'if (!access.companyId)'),
  'pages: publish, rename, delete and type assignment are owner-only in the UI': rep(LIST, 'disabled={!owner || busy}', 'disabled={busy}'),
  'pages: publishing always asks first and says inspections are not changed': rep(EDIT, 'Inspections already started or finished keep the copy they started with', 'Done'),
  'editor: an item is never added where inspectors cannot see it': rep('components/templates/EditorParts.tsx', "const homes = kind === 'component' && hasGroups ? groups.filter(g => g.id !== system.id) : groups;", 'const homes = groups;'),
  'editor: a duplicate choice is reported, not silently dropped': rep('components/templates/ui.tsx', 'if (dup) { setNote(', 'if (dup) { void ('),
  'requirements: publishing refuses what inspections can’t use yet — in the hook, before the RPC': rep('lib/templates/useDraft.ts', "if (reqs.length) throw new TemplateApiError('invalid', 'requirements_unsupported'", "if (false) throw new TemplateApiError('invalid', 'requirements_unsupported'"),
  'requirements: only editorModel.setRequirements writes them; nothing writes the default-set pin or overrides': add('components/templates/EditorParts.tsx', "\nconst x = { op: 'setNodeField', nodeId: 'a', field: 'requirements', value: [] };"),
  'requirements: the Publish button is disabled with the reason while the draft carries what inspections can’t use': rep(EDIT, ': reqs.length ? `Not publishable yet', ': false ? `Not publishable yet'),
  'workspace: every section in the rail renders its view': rep(EDIT, "section === 'report' && ", "section === 'nothing' && "),
  'workspace: the inspector preview renders the draft tree': rep(EDIT, '<PhonePreview tree={tree} selection={sel}', '<PhonePreview tree={m.live?.tree ?? tree} selection={sel}'),
  'applicability: rules are written only in the runtime\'s shape (ruleModel.writeRule)': rep('components/templates/RuleEditor.tsx', 'onSave(next)', 'onSave({ any: conds })'),
  'editor: a system’s Included switch sits on its title line and writes through coverByDefault (the app’s rule)': rep('components/templates/Workspace.tsx', 'onChange={v => onOps(lens ? lens.set(system.id, v) : includeOps(tree, system.id, v))} />}', 'onChange={() => undefined} />}'),
  'switch: systems, groups and items have the SAME title-line switch (includeOps); no "Set … aside" button, menu entry or list remains': add('components/templates/EditorParts.tsx', "\nconst x = <button onClick={() => onOps(ops.setAside(node.id))}>Set this group aside</button>;"),
  'item: no tabs — its rows (Condition · Details · Requirements · Applies when) each open their own screen with back to the item; selecting opens the rows': rep('components/templates/Workspace.tsx', "if (tab === 'details') return facet('details',", "if (tab === 'nope') return facet('details',"),
  'create: New template opens the creation page, which only starts a private draft and opens it in the builder': rep('app/app/templates/create/page.tsx', "router.push(`/app/templates/new?draft=${encodeURIComponent(draft.id)}`)", "router.push('/app/templates')"),
  'create: no individual license is collected, import is not offered as working, and no compliance is claimed': rep('app/app/templates/create/page.tsx', 'Coming later</Pill>', 'Beta</Pill>'),
  'create: the kind of home is asked under a Ledrix card and the draft is built by buildStarterTree; the Overview edits both fields through ops': rep('app/app/templates/create/page.tsx', 'const tree = built.tree;', 'const tree = forked;'),
  'suggest: Ledrix\'s parts are offered inside each type\'s list (and at the end of an untyped system\'s list), added only through suggestOps; no separate catalog box': rep('components/templates/EditorParts.tsx', '{!typeView && catalogTypesForSystem(system).length > 0 && <LedrixSuggestions', '<CatalogPanel /> {!typeView && catalogTypesForSystem(system).length > 0 && <LedrixSuggestions'),
  'types: a type\'s list tags only Ledrix\'s Typical — no "Also:", "Only", or "All types" text — and the chips carry no suggestion count': rep('components/templates/TypeBuilder.tsx', 'return g ? <Pill tone="warn">×1–{g.items.length}</Pill> : typical(n);', 'return g ? <Pill tone="warn">×1–{g.items.length}</Pill> : <>{typical(n)}<span>Also: {(layout.shows[n.id] ?? []).join(", ")}</span></>;'),
  'types: a typed system shows the by-type layout in its panel (never in the menu), and the preview answers with the chosen type': rep(EDIT, ' answer={answer} />', ' />'),
  'types: the grid writes rules only through typeRuleOps (the validated appliesWhen op), never a rule field of its own': add('components/templates/TypeBuilder.tsx', "\nconst x = { op: 'setNodeField', nodeId: 'a', field: 'requires', value: [] };"),
  'menu: the left menu is systems only (count, reorder, off), with no search box — items, groups and type sections live in the work area; the add button adds a system; the save / publish note is a hover note': rep('components/templates/Tree.tsx', '              </div>\n            </li>', '              </div>{(s.children ?? []).map(c => <li key={c.id}>{c.label}</li>)}\n            </li>'),
  'types: the type chips wrap (never a sideways-scrolling row with the chosen chip out of sight)': rep('components/templates/TypeBuilder.tsx', '<div className="flex flex-wrap gap-1.5" role="group"', '<div className="flex gap-1.5 overflow-x-auto" role="group"'),
  'types: no jumping — a new selection opens its panel at the top, a section row scrolls only the editor box, nothing calls scrollIntoView': rep('components/templates/Workspace.tsx', 'useLayoutEffect(() => { if (box.current) box.current.scrollTop = 0; }, [scrollKey]);', ''),
  'ask ledrix: hidden — no Editor / Ask Ledrix tabs and no assistant panel mounted while ASK_LEDRIX is false (owner 2026-11-05)': rep(EDIT, 'const ASK_LEDRIX = false;', 'const ASK_LEDRIX = true;'),
  'only what you pick: the special-homes card offers only this template\'s kinds and hides when there are none': rep('components/templates/SpecialHomesPanel.tsx', 'specialRows(tree, system, source).filter(r => own.has(r.kind))', 'specialRows(tree, system, source)'),
  'only what you pick: changing a kind on the Overview adds its checkpoints only after review (starterOps) and switches them off only on request (trimNode)': rep('components/templates/HomeKinds.tsx', 'if (!added.length && !removedActive.length) { onOps(fields); setPending(null); return; }', 'onOps(fields); setPending(null); return;'),
  'group first: a system without type chips lists its groups (no Materials first / Full list switch), a group opens its own screen with everything set in it; typed systems keep their chips and draw a materials section as rows': rep('components/templates/EditorParts.tsx', 'const byGroups = !typeView;', 'const byGroups = false;'),
  'materials: the materials view adds, removes and opens only through materialLayout ops and the editor\'s addItem': rep('components/templates/MaterialsBuilder.tsx', "if (!v) onOps(removeMaterialOps(q, r.value));", "if (!v) onOps([{ op: 'removeAttribute', nodeId: q.node.id, attrId: q.attr.id }]);"),
  'move: the ⋯ menu on a group and an item offers Move to…, disabled with the reason when it cannot move; the dialog moves only through moveOps': rep('components/templates/Workspace.tsx', "|| moveBlockFor(tree, id) || false", "|| false"),
  'buildings: the strip and its model write building types only as ONE setTemplateField structureTypes — no other op, no other store': add('lib/templates/buildingModel.ts', "\nconst x = [{ op: 'addNode', parentId: null }];"),
  'building types: publishing refuses an error — in the hook, before the RPC, and on the button': rep('lib/templates/useDraft.ts', "if (bad) throw new TemplateApiError('invalid', 'structure_types'", "if (false) throw new TemplateApiError('invalid', 'structure_types'"),
};
const MUT3 = [
  ['limitations: a Limitations row opens each part’s own — when the inspector records it, what the checklist does, what the report says; a tap edits it there', rep('components/templates/GatesPanel.tsx', 'onClick={() => setOpen(isOpen ? null : g.id)}', 'onClick={() => {}}'), 'a tap opens nothing'],
  ['limitations: a Limitations row opens each part’s own — when the inspector records it, what the checklist does, what the report says; a tap edits it there', rep('components/templates/GatesPanel.tsx', '{isOpen && <GateEditor ', '{false && <GateEditor '), 'the editor never shows'],
  ['buildings: a building picker atop the systems column (the home, then each building; ‹ › step); with a building selected every list, Off list and switch in Systems reads it; the Building Types tab is gone; Create a template asks which other buildings come with the home', rep('components/templates/Tree.tsx', 'const covered = lens ? lens.isIn(s.id) : isCovered(tree, s);', 'const covered = isCovered(tree, s);'), 'the systems list ignores the building'],
  ['buildings: a building picker atop the systems column (the home, then each building; ‹ › step); with a building selected every list, Off list and switch in Systems reads it; the Building Types tab is gone; Create a template asks which other buildings come with the home', rep('components/templates/GroupList.tsx', 'const kids = (system.children ?? []).filter(c => !lens || lens.isIn(c.id));', 'const kids = system.children ?? [];'), 'a building lists parts it doesn\'t have'],
  ['buildings: a building picker atop the systems column (the home, then each building; ‹ › step); with a building selected every list, Off list and switch in Systems reads it; the Building Types tab is gone; Create a template asks which other buildings come with the home', rep('app/app/templates/[id]/page.tsx', '<BuildingLensProvider tree={tree} buildingId={building}>', '<BuildingLensProvider tree={tree} buildingId={null}>'), 'the strip changes nothing'],
  ['buildings: a building picker atop the systems column (the home, then each building; ‹ › step); with a building selected every list, Off list and switch in Systems reads it; the Building Types tab is gone; Create a template asks which other buildings come with the home', rep('components/templates/EditorParts.tsx', '.concat(lens ? lens.offIn(system.id).map(', '.concat(false ? lens!.offIn(system.id).map('), 'a building\'s Off list is missing'],
  ['back: every panel has a back arrow at the top left, beside its icon, going up ONE level (item → its group → the system; a type-chip system\'s item → the system); no X to close', rep('components/templates/Workspace.tsx', "const up = !typeView && loc.parent && loc.parent.id !== system.id && loc.parent.kind !== 'component' ? loc.parent : null;", "const up = null;"), 'back always jumps to the system'],
  ['back: every panel has a back arrow at the top left, beside its icon, going up ONE level (item → its group → the system; a type-chip system\'s item → the system); no X to close', rep('components/templates/Workspace.tsx', '{onBack && <button type="button"', '{false && <button type="button"'), 'no back arrow'],
  ['menu: the left menu is systems only (count, reorder, off), with no search box — items, groups and type sections live in the work area; the add button adds a system; the save / publish note is a hover note', rep('components/templates/Tree.tsx', '  const shown = tree.systems;', "  const [q, setQ] = useState(''); const shown = tree.systems; const box = <input placeholder=\"Search systems\" onChange={e => setQ(e.target.value)} />;"), 'the search box comes back'],
  ['menu: the left menu is systems only (count, reorder, off), with no search box — items, groups and type sections live in the work area; the add button adds a system; the save / publish note is a hover note', rep(EDIT, '        {(blocking > 0 && !(!server || !owner)) || publishBlock ? (', '        <p>Save draft keeps changes private.</p>{(blocking > 0 && !(!server || !owner)) || publishBlock ? ('), 'the note is back on the page'],
  ['group first: each group row\'s ⋯ renames it in the row, moves it up / down or to another system, or switches it off; the add box adds a group (or an item when there are none) — all through the editor\'s ops', rep('components/templates/GroupList.tsx', 'onSelect: () => { onOps(lens ? lens.set(g.id, false) : includeOps(tree, g.id, false)); } }', "onSelect: () => { onOps([{ op: 'trimNode', nodeId: g.id }] as TemplateOp[]); } }"), 'switch off writes its own op'],
  ['group first: each group row\'s ⋯ renames it in the row, moves it up / down or to another system, or switches it off; the add box adds a group (or an item when there are none) — all through the editor\'s ops', rep('components/templates/GroupList.tsx', 'onOps(ops.move(g.id, system.id, idx + 1))', 'onOps(ops.move(g.id, system.id, idx - 1))'), 'move down moves up'],
  ['group first: each group row\'s ⋯ renames it in the row, moves it up / down or to another system, or switches it off; the add box adds a group (or an item when there are none) — all through the editor\'s ops', rep('components/templates/GroupList.tsx', "groups.length ? 'subsystem' : 'component'", "'component'"), 'the add box adds items next to the groups'],
  ['advisories: Create a template shows the picker and puts the picked list on the new draft; the Template Builder\'s Report section edits it through advisoryOps', rep('app/app/templates/create/page.tsx', 'if (suggestAdv) delete tree.suggestAdvisories; else tree.suggestAdvisories = false;', ''), 'the answer never reaches the draft'],
  ['advisories: with No, the picker hides each rule and Suggest / Always add; with Yes a rule shows as its sentence and the picker opens only on Change; the rule controls are not full width', rep('components/templates/AdvisoriesEditor.tsx', '{suggest && picked && r.kind !== \'never\' && (', '{picked && r.kind !== \'never\' && ('), 'No still shows Suggest / Always add'],
  ['advisories: with No, the picker hides each rule and Suggest / Always add; with Yes a rule shows as its sentence and the picker opens only on Change; the rule controls are not full width', rep('components/templates/AdvisoriesEditor.tsx', '{suggest && isOpen(a.id, \'rule\') && (', '{isOpen(a.id, \'rule\') && ('), 'No still opens the rule'],
  ['advisories: with No, the picker hides each rule and Suggest / Always add; with Yes a rule shows as its sentence and the picker opens only on Change; the rule controls are not full width', rep('components/templates/AdvisoriesEditor.tsx', 'aria-label={`When ${label} applies`} className={`${inline} px-2 py-1 text-xs`}', 'aria-label={`When ${label} applies`} className={`${field} px-2 py-1 text-xs`}'), 'the rule box is full width again'],
  ['advisories: Create a template shows the picker and puts the picked list on the new draft; the Template Builder\'s Report section edits it through advisoryOps', rep('app/app/templates/create/page.tsx', '      if (advisories.length) tree.advisories = JSON.parse(JSON.stringify(advisories)); else delete tree.advisories;\n', ''), 'the picks never reach the draft'],
  ['advisories: Create a template shows the picker and puts the picked list on the new draft; the Template Builder\'s Report section edits it through advisoryOps', rep('components/templates/Sections.tsx', 'onChange={l => { onOps(advisoryOps(l)); }}', 'onChange={() => {}}'), 'the builder\'s picker writes nothing'],
  ['advisories: Create a template shows the picker and puts the picked list on the new draft; the Template Builder\'s Report section edits it through advisoryOps', rep('app/app/templates/[id]/page.tsx', '<ReportSection tree={tree} onGo={go} onOps={onOps} disabled={!!readOnly} />', '<ReportSection tree={tree} onGo={go} onOps={() => false} disabled={!!readOnly} />'), 'the page never passes the edits'],
  ['fireplace: each type chip draws its We operate it switch from canStartLimited, writing only through ops.operates and ops.startsSentence', rep('components/templates/Workspace.tsx', 'policy={<EveryTypeOperates tree={tree} system={system} node={node}', 'x={<EveryTypeOperates tree={tree} system={system} node={node}'), 'the TPR switch is not on its item\'s Limitations'],
  ['fireplace: each type chip draws its We operate it switch from canStartLimited, writing only through ops.operates and ops.startsSentence', rep('components/templates/TypeBuilder.tsx', '{own.filter(canStartLimited).map(n => (', '{[...layout.every, ...own].filter(canStartLimited).map(n => ('), 'the TPR switch is back at the top of the system'],
  ['fireplace: each type chip draws its We operate it switch from canStartLimited, writing only through ops.operates and ops.startsSentence', rep('components/templates/TypeBuilder.tsx', '{own.filter(canStartLimited).map(n => (', '{[].filter(canStartLimited).map(n => ('), 'the switch is not drawn'],
  ['fireplace: each type chip draws its We operate it switch from canStartLimited, writing only through ops.operates and ops.startsSentence', rep('components/templates/TypeBuilder.tsx', 'onChange={v => { onOps(ops.operates(node, f, value, v)); }}', 'onChange={v => { onOps(ops.operates(node, f, value, !v)); }}'), 'the switch writes the opposite'],
  ['fireplace: each type chip draws its We operate it switch from canStartLimited, writing only through ops.operates and ops.startsSentence', rep('components/templates/TypeBuilder.tsx', 'onBlur={() => { if (!text.trim()) { setText(entry.sentence); return; } onOps(ops.startsSentence(node, f, value, text)); }}', 'onBlur={() => { onOps([]); }}'), 'the sentence is never saved'],
  ['fireplace: each type chip draws its We operate it switch from canStartLimited, writing only through ops.operates and ops.startsSentence', rep('components/templates/TypeBuilder.tsx', 'const on = !entry;', 'const on = !!entry;'), 'the switch shows On for an Off answer'],
  ['rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on', rep('components/templates/ItemRow.tsx', "{ label: 'Switch off', disabled: disabled && LOCKED, onSelect: () => { onOps(lens ? lens.set(node.id, false) : includeOps(tree, node.id, false)); } },", "{ label: 'Delete', disabled: disabled && LOCKED, onSelect: () => { onOps([{ op: 'removeNode', nodeId: node.id }] as TemplateOp[]); } },"), 'Switch off becomes Delete'],
  ['rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on', rep('components/templates/ItemRow.tsx', ": includeOps(tree, node.id, false)); } },", ": includeOps(tree, node.id, true)); } },"), 'Switch off switches it on'],
  ['rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on', rep('components/templates/ItemRow.tsx', "if (t && t !== node.label) onOps(ops.rename(node.id, t));", "if (t && t !== node.label) {}"), 'renaming saves nothing'],
  ['rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on', rep('components/templates/ItemRow.tsx', "moveBlockFor(tree, node.id) || false", "false"), 'Move to… offered for an item that cannot move'],
  ['rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on', rep('components/templates/ItemRow.tsx', "if (e.key === 'Escape') { cancelled.current = true;", "if (e.key === 'Escape') { cancelled.current = false;"), 'Esc saves the rename'],
  ['rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on', rep('components/templates/ItemRow.tsx', '<button className="min-w-0 flex-1 py-1 text-left" onClick={() => onOpen(node.id)}>', '<button className="min-w-0 flex-1 py-1 text-left">'), 'clicking the row no longer opens the item'],
  ['rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on', rep('components/templates/MaterialsBuilder.tsx', '{rows.map(n => <ItemRow key={n.id}', '{rows.map(n => <li key={n.id}>{n.label}</li>)}{[].map(n => <ItemRow key={n.id}'), 'the group screen goes back to plain rows'],
  ['rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on', rep('components/templates/TypeBuilder.tsx', 'return <ItemRow key={n.id} tree={tree} node={n} onOps={apply}', 'return <li key={n.id}>{n.label}</li>; <ItemRow key={n.id} tree={tree} node={n} onOps={apply}'), 'the type view goes back to plain rows'],
  ['rows: an item row in Materials first and the type view opens the item, and its ⋯ menu offers Rename, Move to… and Switch off (never delete); an Off row offers Switch on', rep('components/templates/EditorParts.tsx', 'lens.set(t.id, true) : includeOps(tree, t.id, true)', 'lens.set(t.id, true) : includeOps(tree, t.id, false)'), 'Switch on in the Off list does nothing'],
  ['group screen: a group lists its items, one kind of row for all — a materials question\'s cards are not rows there; its answers, cards and switches open inside that question\'s own item, under Details', rep('components/templates/MaterialsBuilder.tsx', 'const rows = (group?.children ?? []).filter(c => !cards.has(c.id) && (!lens || lens.isIn(c.id)));', 'const rows = group?.children ?? [];'), 'the cards are rows on the group screen again'],
  ['group screen: a group lists its items, one kind of row for all — a materials question\'s cards are not rows there; its answers, cards and switches open inside that question\'s own item, under Details', rep('components/templates/Workspace.tsx', '{detailsOn && <><MaterialAnswers tree={tree} system={system} node={node} onOps={onOps} onOpen={open} selected={sel.nodeId} disabled={disabled} />', '{detailsOn && <>'), 'the answers never open on the item'],
  ['group screen: a group lists its items, one kind of row for all — a materials question\'s cards are not rows there; its answers, cards and switches open inside that question\'s own item, under Details', rep('components/templates/MaterialsBuilder.tsx', '.filter(q => q.node.id === node.id)', '.filter(() => false)'), 'no item shows its answers'],
  ['move: the ⋯ menu on a group and an item offers Move to…, disabled with the reason when it cannot move; the dialog moves only through moveOps', rep('components/templates/MoveTo.tsx', 'const o = fresh ? moveIntoNewGroupOps(tree, nodeId, t!.system.id, newGroup!) : home ? moveOps(tree, nodeId, home.id, after) : [];', "const o: TemplateOp[] = home ? [{ op: 'moveNode', nodeId, parentId: home.id, index: 0 }] : [];"), 'the dialog writes its own op'],
  ['move: the ⋯ menu on a group and an item offers Move to…, disabled with the reason when it cannot move; the dialog moves only through moveOps', rep('components/templates/MoveTo.tsx', 'const o = fresh ? moveIntoNewGroupOps(tree, nodeId, t!.system.id, newGroup!) :', "const o = fresh ? [{ op: 'addNode', parentId: t!.system.id, node: { id: 'g', label: newGroup!, kind: 'subsystem' } }] as TemplateOp[] :"), 'the dialog makes the new group with its own op'],
  ['move: the ⋯ menu on a group and an item offers Move to…, disabled with the reason when it cannot move; the dialog moves only through moveOps', rep('components/templates/MoveTo.tsx', 'onSubmit={e => { e.preventDefault(); addGroup(); }}', 'onSubmit={e => { e.preventDefault(); }}'), '"+ New group" does nothing'],
  ['group first: a system without type chips lists its groups (no Materials first / Full list switch), a group opens its own screen with everything set in it; typed systems keep their chips and draw a materials section as rows', rep('components/templates/TypeBuilder.tsx', 'if (mq) return section(', 'if (false) return section('), 'Electrical\'s wiring section goes back to a plain list'],
  ['materials: the materials view adds, removes and opens only through materialLayout ops and the editor\'s addItem', rep('components/templates/MaterialsBuilder.tsx', '{q.off.length > 0 && (<>', '{false && (<>'), 'an Off material disappears again'],
  ['materials: the materials view adds, removes and opens only through materialLayout ops and the editor\'s addItem', rep('components/templates/MaterialsBuilder.tsx', 'if (v) onOps(switchMaterialOnOps(q, o));', 'if (v) onOps(removeMaterialOps(q, o.value));'), 'switching a material on does nothing'],
  ['only what you pick: the special-homes card offers only this template\'s kinds and hides when there are none', rep('components/templates/SpecialHomesPanel.tsx', '|| rows.every(r => r.inTemplate)) return null;', ') return null;'), 'the card stays when there is nothing left to add'],
  ['only what you pick: changing a kind on the Overview adds its checkpoints only after review (starterOps) and switches them off only on request (trimNode)', rep('components/templates/HomeKinds.tsx', "...(off ? switchOff.map(id => ({ op: 'trimNode', nodeId: id }) as TemplateOp) : [])", "...switchOff.map(id => ({ op: 'trimNode', nodeId: id }) as TemplateOp)"), '"Keep them" switches the checkpoints off anyway'],
  ['ask ledrix: hidden — no Editor / Ask Ledrix tabs and no assistant panel mounted while ASK_LEDRIX is false (owner 2026-11-05)', rep(EDIT, "{ASK_LEDRIX && <div role=\"tablist\" aria-label=\"Editor mode\"", "{true && <div role=\"tablist\" aria-label=\"Editor mode\""), 'the Editor / Ask Ledrix tabs show again'],
  ['suggest: Ledrix\'s parts are offered inside each type\'s list (and at the end of an untyped system\'s list), added only through suggestOps; no separate catalog box', rep('components/templates/TypeBuilder.tsx', '{catTypes.length > 0 && <li className="px-3 py-2"><LedrixSuggestions', '{false && <li className="px-3 py-2"><LedrixSuggestions'), 'a type\'s list loses the suggestions'],
  ['suggest: Ledrix\'s parts are offered inside each type\'s list (and at the end of an untyped system\'s list), added only through suggestOps; no separate catalog box', rep('components/templates/CatalogPanel.tsx', "{c.presence === 'typical' ? '+ Add' : '+ Add as optional'}", "+ Add"), 'an If-present part no longer says it is added as optional'],
  ['types: a type\'s list tags only Ledrix\'s Typical — no "Also:", "Only", or "All types" text — and the chips carry no suggestion count', rep('components/templates/TypeBuilder.tsx', '{layout.every.map(n => row(n, tagOf(n)))}', '{layout.every.map(n => row(n, <Pill>All types</Pill>))}'), 'the All types tag is back'],
  ['types: a type\'s list tags only Ledrix\'s Typical — no "Also:", "Only", or "All types" text — and the chips carry no suggestion count', rep('components/templates/TypeBuilder.tsx', '{rowsForType(layout, v).length}</span></>', '{rowsForType(layout, v).length} · +{v.length}</span></>'), 'the chips gain a suggestion count'],
  ['menu: the left menu is systems only (count, reorder, off), with no search box — items, groups and type sections live in the work area; the add button adds a system; the save / publish note is a hover note', rep('components/templates/Tree.tsx', '>+ Add system<', '>+ Add system / component<'), 'the menu offers to add items again'],
  ['menu: the left menu is systems only (count, reorder, off), with no search box — items, groups and type sections live in the work area; the add button adds a system; the save / publish note is a hover note', rep('components/templates/TypeBuilder.tsx', '        {layout.every.map(n => row(n, tagOf(n)))}\n', ''), 'a type\'s list leaves out the items every type shows'],
  ['names: a system, group or item is renamed by the pencil beside its title, with no separate Name box', rep('components/templates/EditorParts.tsx', '{typeView && <TypeChips', '<CommitInput value={system.label} ariaLabel="System name" onCommit={() => {}} />{typeView && <TypeChips'), 'the system Name box is back'],
  ['names: a system, group or item is renamed by the pencil beside its title, with no separate Name box', rep('components/templates/Workspace.tsx', ' onRename={v => onOps(ops.rename(system.id, v))}', ''), 'a system title has no pencil'],
  ['tips: the description box is called Tips, and the phone preview marks company Tips with the ⓘ, never a line under the name', rep('components/templates/PhonePreview.tsx', '<span className="pv-tips"', '<span className="pv-guide">{n.description}</span><span className="pv-x"'), 'the preview prints Tips under the name again'],
  ['tips: the description box is called Tips, and the phone preview marks company Tips with the ⓘ, never a line under the name', add('components/templates/EditorParts.tsx', "\nconst X = () => <CommitInput value='' ariaLabel='x' onCommit={v => onOps(ops.describe('a', v))} />;"), 'a Tips box is back in a panel body'],
  ['tips: the description box is called Tips, and the phone preview marks company Tips with the ⓘ, never a line under the name', rep('components/templates/Workspace.tsx', "has ? 'border-accent bg-accent text-white' : 'border-muted text-muted'", "'border-muted text-muted'"), 'the ⓘ looks the same with or without Tips'],
  ['types: no jumping — a new selection opens its panel at the top, a section row scrolls only the editor box, nothing calls scrollIntoView', add('components/templates/Tree.tsx', "\ndocument.getElementById('x')?.scrollIntoView();"), 'something scrolls the page with scrollIntoView'],
  ['types: no jumping — a new selection opens its panel at the top, a section row scrolls only the editor box, nothing calls scrollIntoView', rep('components/templates/Workspace.tsx', '<Shell scrollKey={sk} reveal={reveal} kind="Component"', '<Shell kind="Component"'), 'one panel kind keeps the last scroll position'],
];
for (const [name, mutate, what] of MUT3) ok(`mutation caught: ${name} (${what})`, RULES[name](mutate(all)).length > 0);
const MUT2 = {
  'requirements: only editorModel.setRequirements writes them; nothing writes the default-set pin or overrides': add('lib/templates/requirementModel.ts', "\nexport const pin = [{ op: 'setTemplateField', field: 'requirementDefaults', value: 'ledrix-r1' }];"),
};
for (const [name, mutate] of Object.entries(MUT2)) ok(`mutation caught: ${name} (lib)`, RULES[name](mutate(all)).length > 0);
for (const [name, mutate] of Object.entries(MUT)) {
  const rule = RULES[name];
  if (!rule) { ok(`mutation has a rule: ${name}`, false); continue; }
  ok(`mutation caught: ${name}`, rule(mutate(all)).length > 0);
}
const EXEC_MUT = [
  { name: 'a typed answer is nested as an all inside any', file: 'ruleModel.ts', from: "return leaves.length === 1 ? leaves[0] : { any: leaves };", to: "return leaves.length === 1 ? leaves[0] : { any: [{ all: leaves }] };", check: 'rules: every rule the editor writes passes the runtime compiler and the op validator', run: runDesktop },
  { name: 'ALL is written as one group of alternatives', file: 'requirementModel.ts', from: "return mode === 'any' || clauses.length <= 1 ?", to: "return true ?", check: 'requirements: ANY is one group of alternatives, ALL is one group per method, and both read back', run: runDesktop },
  { name: 'a new requirement asks for an exception', file: 'requirementModel.ts', from: "unmet: { limitation: 'resolves', exception: 'not_allowed' },", to: "unmet: { limitation: 'resolves', exception: 'allowed' },", check: 'requirements: a new requirement is a valid COMPANY requirement on its own item, and the draft takes it', run: runDesktop },
  { name: 'Details OFF deletes instead of keeping', file: 'editorModel.ts', from: "? [setField(node.id, 'parked', parkedWith(node, { attributes: [...attrs] })), ...attrs.map(", to: "? [...attrs.map(", check: 'switches: Details OFF removes the fields from the item and keeps them, hidden (parked)', run: runDesktop },
  { name: 'restore puts the parked copy back after clearing it', file: 'editorModel.ts', from: "return parked.length ? [...parked.map(a => ({ op: 'addAttribute', nodeId: node.id, attribute: a }) as TemplateOp), setField(node.id, 'parked', parkedWith(node, { attributes: [] }))] : [];", to: "return parked.length ? [setField(node.id, 'parked', parkedWith(node, { attributes: [] })), ...parked.map(a => ({ op: 'addAttribute', nodeId: node.id, attribute: a }) as TemplateOp)] : [];", check: 'switches: a field kept under Ledrix’s own storage key switches off and back on, unchanged (marker kept)', run: runDesktop },
  { name: 'show in links into the item\'s own system', file: 'editorModel.ts', from: "homeId: node.id, parentId: systemId }]", to: "homeId: node.id, parentId: tree.systems[0].id }]", check: 'show in: the item appears in the other system as a link — one record, no copy of its answers', run: runDesktop },
  { name: 'a rule problem opens the wrong tab', file: 'publishFixes.ts', from: "rule_unsupported: 'applicability', rule_missing_item: 'applicability',", to: "rule_unsupported: 'applicability', rule_missing_item: 'overview',", check: 'publish fixes: a broken rule opens its item on the Applicability tab, and blocks', run: runDesktop },
  { name: 'property types accept any value', file: 'core/propertyTypes.ts', from: "if (v.some(x => typeof x !== 'string' || !IDS.has(x)))", to: "if (v.some(x => typeof x !== 'string'))", check: 'property types: an unknown property type is refused', run: runDesktop },
  { name: 'unticked checkpoints still land', file: 'startingPoints.ts', from: "const off = new Set(c.unticked);", to: "const off = new Set<string>();", check: 'kind of home: Manufactured + Older with two unticked → the draft is the base plus exactly the other 20, and the cutoff year is stored', run: runDesktop },
  { name: 'the association pre-mark without a condo', file: 'startingPoints.ts', from: "if (plan.condo && c.associationPremark)", to: "if (c.associationPremark)", check: 'kind of home: Condo adds no checkpoints; the association pre-mark is stored only when the company ticks it, and only for a condo template', run: runDesktop },
  { name: 'New Construction recommended for everyone', file: 'startingPoints.ts', from: "reasons: svc.has('new_construction') ? ['Built for new construction, a service you selected.'] : []", to: "reasons: ['Built for new construction, a service you selected.']", check: 'kind of home: "Ledrix New Construction" is its own card — the base plus 10 — recommended when the company offers new construction', run: runDesktop },
  { name: 'a company copy gets kinds added', file: 'startingPoints.ts', from: "export const asksKindOfHome = (k: StartKind): boolean => k === 'ledrix_default' || k === 'ledrix_new_construction';", to: "export const asksKindOfHome = (k: StartKind): boolean => k !== 'blank';", check: 'kind of home: a copy of the company’s own template is not asked (nothing added)', run: runDesktop },
  { name: 'a starting point claims coverage', file: 'startingPoints.ts', from: "const coverage = { state: 'not_evaluated' as const,", to: "const coverage = { state: 'covered' as const,", check: 'create: requirements coverage is NOT EVALUATED on every starting point, whatever the company declared', run: runDesktop },
  { name: 'Ledrix Default is recommended without a matching service', file: 'startingPoints.ts', from: "reasons: svc.has('home') ? ['Built for general home inspections, a service you selected.'] : [],", to: "reasons: ['Aligned with the standards you follow.'],", check: 'create: no recommendation when Ledrix knows nothing that points to one', run: runDesktop },
  { name: 'forking mutates the source', file: 'startingPoints.ts', from: "return { ...JSON.parse(JSON.stringify(tree)), id: 'custom', name };", to: "return Object.assign(tree, { id: 'custom', name });", check: 'create: a starting tree is copied — the source is never changed, and the copy is the company’s own (id custom, its name)', run: runDesktop },
  { name: 'an answer bringing two items counts as a material', file: 'materialLayout.ts', from: "if (per.some(r => r.cards.length > 1)) continue;", to: "", check: 'materials: in a typed system (Electrical), the wiring-type section is a materials question drawn as rows; Service Entrance (an answer brings two items) is a type, not a material', run: runTypes },
  { name: 'adding a material leaves Other showing for it', file: 'materialLayout.ts', from: "const narrowed = !q.typed ||", to: "const narrowed = true ||", check: 'materials: "+ Add material" adds the answer and its card ("Brass Supply Piping"), shown only when Brass is ticked, and "Other" stays for typed answers only — one change set', run: runTypes },
  { name: 'removing a material leaves its card on', file: 'materialLayout.ts', from: "...(card ? ops.setAside(card.id) : [])", to: "", check: 'materials: removing a material takes the answer out and switches its card off (restorable) — one change set', run: runTypes },
  { name: 'Interior lists its condition items first', file: 'materialLayout.ts', from: "const materials = qs.length ? [] : rest.filter(n => (n.attributes ?? []).length > 0);", to: "const materials = [];", check: 'materials: Interior floors, walls and countertops are materials questions, one card per answer (2026-11-07); a group with none lists its items that record a choice first (Attic insulation)', run: runTypes },
  { name: 'Interior\'s every-home lists carry the surface cards too', file: 'materialLayout.ts', from: "const every = rest.filter(n => !materials.includes(n));", to: "const every = rest;", check: 'interior: Walls, Ceilings & Floors (Floors, Walls / Ceilings; Trim moved to Doors & Windows), Countertops & Cabinets (Countertops, then Backsplash and Cabinets), Doors & Windows, Stairs & Railings, Ventilation; no Wall Material card', run: runTypes },
  { name: 'a unit can be moved', file: 'moveModel.ts', from: "if (unit) return unit.id === n.id", to: "if (false) return unit.id === n.id", check: 'move: units, a group holding one, a link and a count copy cannot move — and say why; an ordinary item can', run: runTypes },
  { name: 'a copied system is offered as a destination', file: 'moveModel.ts', from: "return (tree.systems ?? []).filter(s => !isCopy(s.id)).map(s => {", to: "return (tree.systems ?? []).map(s => {", check: 'move: a copied system is never a destination, a system with groups takes items only inside a group, and items in a copy stay', run: runTypes },
  { name: '"after X" lands one place off', file: 'moveModel.ts', from: "const at = afterId ? list.findIndex(c => c.id === afterId) + 1 : 0;", to: "const at = afterId ? list.findIndex(c => c.id === afterId) : 0;", check: 'move: the fan moves into Attic › Ventilation right after the fan termination, as ONE change, carrying everything it had', run: runTypes },
  { name: 'a starting point keeps the unpicked kinds switched off', file: 'startingPoints.ts', from: "const base = withoutSetAsideSpecials(tree);", to: "const base = tree;", check: 'only what you pick: a single-family template holds no special-home checkpoint at all — none active, none switched off, no Special homes group', run: runDesktop },
  { name: 'Older / Log are forgotten after creation', file: 'startingPoints.ts', from: "if (also.length) fields.push({ op: 'setTemplateField', field: 'alsoKinds', value: also });", to: "", check: 'only what you pick: Manufactured + Older holds exactly its ticked checkpoints (the unticked are not kept switched off) and remembers Older', run: runDesktop },
  { name: 'a legacy cutoff year no longer means Older', file: 'core/specialHomes.ts', from: "const legacyOlder = !Array.isArray(tpl.alsoKinds) && typeof tpl.olderCutoffYear === 'number';", to: "const legacyOlder = false;", check: 'only what you pick: the New Construction card remembers new construction; a legacy cutoff year still counts as Older', run: runDesktop },
  { name: 'switching Older off also switches off other kinds', file: 'core/specialHomes.ts', from: "return SPECIAL_HOMES.filter(s => s.kind === kind && isActive(tpl, s.id)).map(s => s.id);", to: "return SPECIAL_HOMES.filter(s => isActive(tpl, s.id)).map(s => s.id);", check: 'only what you pick: switching a kind off names exactly its active checkpoints', run: runDesktop },
  { name: 'an If-present suggestion is added switched on', file: 'catalogModel.ts', from: "if (o.op === 'addNode' && o.node.kind === 'component' && o.node.catalogRef && off.includes(o.node.catalogRef)) trims.push", to: "if (false) trims.push", check: 'suggest: a Typical part is added switched on, an If-present part switched off (offered on site) — one change set, with the equipment rule', run: runDesktop },
  { name: 'a switched-off part is suggested again', file: 'catalogModel.ts', from: "[...(x.children ?? []), ...(x.trimmed ?? [])].forEach", to: "[...(x.children ?? [])].forEach", check: 'suggest: a switched-off part is still in the template, so it is not suggested again', run: runDesktop },
  { name: 'Heating suggests the heads Cooling checks', file: 'catalogModel.ts', from: "if (r.present || r.evidenceOnly || r.component.checkedIn) continue;", to: "if (r.present || r.evidenceOnly) continue;", check: 'suggest: under the mini-split chip Heating suggests only what Cooling does not check (the outdoor defrost drain)', run: runDesktop },
  { name: 'a type the template cannot answer shows under every chip', file: 'catalogModel.ts', from: "return !!r && r.field !== field; });", to: "return r?.field !== field; });", check: 'suggest: an answer maps to its equipment (Gas Furnace and Propane → gas furnace; Boiler → the three boilers; Ductless Mini-Split → mini-split, nothing under another field)', run: runDesktop },
  { name: 'readings are suggested', file: 'catalogModel.ts', from: "if (r.present || r.evidenceOnly || r.component.checkedIn) continue;", to: "if (r.present || r.component.checkedIn) continue;", check: 'suggest: only parts the template lacks — nothing already there, no readings or data plates', run: runDesktop },
  { name: 'Boiler maps to one boiler only', file: 'catalogModel.ts', from: "return !!r && r.field === field && r.anyOf.includes(value); });", to: "return !!r && r.field === field && r.anyOf[0] === value && t.id !== 'oil_boiler'; });", check: 'suggest: an answer maps to its equipment (Gas Furnace and Propane → gas furnace; Boiler → the three boilers; Ductless Mini-Split → mini-split, nothing under another field)', run: runDesktop },
  { name: 'the catalog adds a component the template already has', file: 'catalogModel.ts', from: ".filter((x): x is { p: Pick; row: CatalogRow } => !!x.row && !x.row.present && ", to: ".filter((x): x is { p: Pick; row: CatalogRow } => !!x.row && ", check: 'catalog: only real picks are added — present, evidence and record-nothing picks are skipped', run: runDesktop },
  { name: 'the catalog adds evidence the phone cannot collect', file: 'catalogModel.ts', from: "!x.row.evidenceOnly && pickRecordsSomething", to: "pickRecordsSomething", check: 'catalog: only real picks are added — present, evidence and record-nothing picks are skipped', run: runDesktop },
  { name: 'the catalog adds a group to a system that has none', file: 'catalogModel.ts', from: "useGroup: hasGroups || kids.length === 0", to: "useGroup: true", check: 'catalog: a system with items but no groups gets items directly (a new group would hide its items)', run: runDesktop },
  { name: 'the catalog drops the equipment rule', file: 'catalogModel.ts', from: "...(rule ? { appliesWhen: rule }", to: "...(false ? { appliesWhen: rule }", check: 'catalog: each component applies only to its equipment ("Heating System is Gas Furnace or Propane")', run: runDesktop },
  { name: 'Condition off is stored as missing (= on in the app)', file: 'catalogModel.ts', from: "condition: p.condition,", to: "...(p.condition ? { condition: true } : {}),", check: 'catalog: Condition OFF is stored as an explicit false (the app reads a missing value as ON)', run: runDesktop },
  { name: 'switching Off writes no reason', file: 'editorModel.ts', from: 'reason, sentence: defaultStartsSentence(value, n.label) }])];', to: "reason: '', sentence: defaultStartsSentence(value, n.label) }])];", check: 'fireplace: Operation shows a "We operate it" switch per type — Off adds that answer\'s entry (reason Not Operated, a sentence), On removes it, one op each; the sentence edit refuses blank', run: runTypes },
  { name: 'switching On leaves the entry', file: 'editorModel.ts', from: 'on ? cur.filter(e => !(e.field === field && e.value === value))', to: 'on ? cur', check: 'fireplace: Operation shows a "We operate it" switch per type — Off adds that answer\'s entry (reason Not Operated, a sentence), On removes it, one op each; the sentence edit refuses blank', run: runTypes },
  { name: 'an item with no Not Operated reason gets the switch', file: 'editorModel.ts', from: 'export const canStartLimited = (n: TemplateNode): boolean => n.condition === true && !!startsLimitedReason(n);', to: 'export const canStartLimited = (n: TemplateNode): boolean => n.condition === true;', check: 'fireplace: Operation shows a "We operate it" switch per type — Off adds that answer\'s entry (reason Not Operated, a sentence), On removes it, one op each; the sentence edit refuses blank', run: runTypes },
  { name: 'a blank sentence is saved', file: 'editorModel.ts', from: 'if (!t || !cur.some(', to: 'if (!cur.some(', check: 'fireplace: Operation shows a "We operate it" switch per type — Off adds that answer\'s entry (reason Not Operated, a sentence), On removes it, one op each; the sentence edit refuses blank', run: runTypes },
  { name: 'the every-type sentence names the type, not the item', file: 'editorModel.ts', from: "value === '*' ? `The ${itemLabel.toLowerCase()} was not operated during the inspection.`", to: "value === '*' ? `The * was not operated during the inspection.`", check: 'water heater: TPR has ONE "We operate the TPR valve" switch for every type (value *), Ledrix starts it Off; switching it On removes the entry, Off writes a sentence naming the item', run: runTypes },
  { name: 'a range keeps only its start', file: 'advisoryModel.ts', from: "case 'between': return yearOk(r.a) && yearOk(r.b) && r.a <= r.b ? put({ yearFrom: r.a, yearThrough: r.b }", to: "case 'between': return yearOk(r.a) && yearOk(r.b) && r.a <= r.b ? put({ yearFrom: r.a }", check: 'advisories: the create preset (in Ledrix\'s order) is radon + sewer Always add and well, septic, asbestos, lead paint Suggest; rules round-trip (before, between, in or after, every, utility, never); your own gets a fresh id; the list is ONE setTemplateField that the builder accepts, and a bad one is refused', run: runTypes },
  { name: 'the preset forgets modes', file: 'advisoryModel.ts', from: "({ ...clone(a), mode: mode.get(a.id)! })", to: "({ ...clone(a) })", check: 'advisories: the create preset (in Ledrix\'s order) is radon + sewer Always add and well, septic, asbestos, lead paint Suggest; rules round-trip (before, between, in or after, every, utility, never); your own gets a fresh id; the list is ONE setTemplateField that the builder accepts, and a bad one is refused', run: runTypes },
  { name: 'your own reuses a Ledrix id', file: 'advisoryModel.ts', from: "const taken = new Set([...list.map(a => a.id), ...LEDRIX_ADVISORIES.map(a => a.id)]);", to: "const taken = new Set<string>();", check: 'advisories: the create preset (in Ledrix\'s order) is radon + sewer Always add and well, septic, asbestos, lead paint Suggest; rules round-trip (before, between, in or after, every, utility, never); your own gets a fresh id; the list is ONE setTemplateField that the builder accepts, and a bad one is refused', run: runTypes },
  { name: 'Yes stores true instead of removing it', file: 'advisoryModel.ts', from: "value: on ? null : false", to: "value: on", check: 'advisories: one yes/no ("suggest from the home\'s details?") is stored as suggestAdvisories false, Yes removes it; each rule reads as a sentence; every preset starts on Ledrix\'s own rule (Radon: every home)', run: runTypes },
  { name: 'the preset starts radon on Never', file: 'advisoryModel.ts', from: "({ ...clone(a), mode: mode.get(a.id)! })", to: "({ ...clone(a), suggestWhen: a.id === 'radon' ? undefined : a.suggestWhen, mode: mode.get(a.id)! })", check: 'advisories: one yes/no ("suggest from the home\'s details?") is stored as suggestAdvisories false, Yes removes it; each rule reads as a sentence; every preset starts on Ledrix\'s own rule (Radon: every home)', run: runTypes },
  { name: 'switching a part on doesn\'t bring its system', file: 'buildingModel.ts', from: "b.systems = tree.systems.map(s => s.id).filter(id => id === top || b.systems.includes(id));", to: "b.systems = [...b.systems];", check: 'buildings: switching parts per building — a Shop gets Hose Bibs alone from Plumbing (its other groups and fixtures start off), a group off takes its items, a system off leaves the list; each is ONE op the builder accepts', run: runTypes },
  { name: 'a system joining brings all its groups', file: 'buildingModel.ts', from: "if (!isSystem) for (const c of byId.get(top)?.children ?? []) off.add(c.id);", to: "", check: 'buildings: switching parts per building — a Shop gets Hose Bibs alone from Plumbing (its other groups and fixtures start off), a group off takes its items, a system off leaves the list; each is ONE op the builder accepts', run: runTypes },
  { name: 'an off group comes back whole', file: 'buildingModel.ts', from: "if (i < path.length - 1) for (const c of byId.get(id)?.children ?? []) if (c.id !== path[i + 1]) off.add(c.id);", to: "", check: 'buildings: switching parts per building — a Shop gets Hose Bibs alone from Plumbing (its other groups and fixtures start off), a group off takes its items, a system off leaves the list; each is ONE op the builder accepts', run: runTypes },
  { name: 'a group off keeps its items\' marks', file: 'buildingModel.ts', from: "    for (const id of under(nodeId)) off.delete(id);\n    off.add(nodeId);", to: "    off.add(nodeId);", check: 'buildings: switching parts per building — a Shop gets Hose Bibs alone from Plumbing (its other groups and fixtures start off), a group off takes its items, a system off leaves the list; each is ONE op the builder accepts', run: runTypes },
  { name: 'clearing a rule keeps hide-until-answered', file: 'editorModel.ts', from: "const wu = rule === null ? null : whenUnknown;", to: "const wu = whenUnknown;", check: 'applicability: removing the rule removes "hide until answered" with it', run: runDesktop },
  { name: 'propose replaces a reviewed proposal', file: 'session.ts', from: "if (draft.pending && draft.pending.entries.some(e => e.status !== 'proposed')) {", to: 'if (false) {', check: 'propose: never replaces a proposal that holds a decision', run: runExecuted },
  { name: 'an unreadable draft is replaced by a fresh one', file: 'draftStore.ts', from: "try { parsed = JSON.parse(raw); } catch { throw new DraftStoreError('The saved draft could not be read.'); }", to: 'try { parsed = JSON.parse(raw); } catch { return null; }', check: 'an unreadable saved draft is an error and is left in place, never silently replaced', run: runExecuted },
  { name: 'the draft shares the live template object', file: 'core/templateDraft.ts', from: 'tree: clone(args.live)', to: 'tree: args.live', check: 'draft: a new draft is a COPY of the live template', run: runDesktop },
  { name: 'hand edits skip the change-set log', file: 'editorModel.ts', from: "  const r = applyToDraft(d, cs, now);\n  return r.ok ? { ok: true, draft: r.draft } : { ok: false, error: r.error };", to: "  const r = applyToDraft(d, cs, now);\n  return r.ok ? { ok: true, draft: { ...r.draft, log: d.log } } : { ok: false, error: r.error };", check: 'hand edit: every edit is undoable', run: runDesktop },
  { name: 'a whole-template question may propose changes', file: 'assistant.ts', from: "return { system, user, promptRef: hashOf({ system, user }), proposesFor: null };", to: "return { system, user, promptRef: hashOf({ system, user }), proposesFor: req.tree.systems[0]?.id ?? null };", check: 'assistant: a whole-template question proposes nothing', run: runDesktop },
  { name: 'grades hidden in a value list slip through', file: 'assistant.ts', from: "if (op.op === 'setAttributeField') return", to: "if (op.op === 'setAttributeField') return false &&", check: 'assistant: grades are caught wherever they hide', run: runDesktop },
  { name: 'flattened changes are not re-wrapped', file: 'assistant.ts', from: "    if (typeof x.op === 'string') {", to: "    if (false) {", check: 'assistant: a flattened or renamed change is re-wrapped, a correct one is untouched, junk stays junk', run: runDesktop },
  { name: 'switching on only clears the off flag', file: 'editorModel.ts', from: "const want = s.id === systemId ? on : isCovered(tree, s);", to: "const want = s.id === systemId ? (on ? (undefined as any) : false) : isCovered(tree, s);", check: 'coverage: switching a system on makes it covered (defaultActive true, not merely "not false")', run: runDesktop },
  { name: 'assessment OFF writes null again', file: 'editorModel.ts', from: "assessed: (nodeId: string, on: boolean): TemplateOp[] => [setField(nodeId, 'condition', on)],", to: "assessed: (nodeId: string, on: boolean): TemplateOp[] => [setField(nodeId, 'condition', on ? true : null)],", check: 'condition: switching assessment OFF stores an explicit false (never a deleted field)', run: runDesktop },
  { name: 'the editor reads the raw field instead of the app rule', file: 'editorModel.ts', from: "if (n.attributes || n.condition !== undefined || n.limitations || x.method) return n.condition ?? true;", to: "if (n.attributes || n.condition !== undefined || n.limitations || x.method) return n.condition === true;", check: 'condition: a legacy item that never stored the field reads exactly as the app reads it (missing = on; spec facet = off)', run: runDesktop },
  { name: 'switching an item off deletes it instead', file: 'editorModel.ts', from: ": [{ op: 'trimNode', nodeId: id }];", to: ": [{ op: 'unaddNode', nodeId: id } as any];", check: 'switch: an item switched off is kept (off, offered on site) and switching it on brings it back', run: runDesktop },
  { name: 'a set-aside system comes back uncovered', file: 'editorModel.ts', from: "return r.ok ? [...back, ...ops.coverByDefault(r.tpl, id, true)] : back;", to: "return back;", check: 'switch: a set-aside system switched on comes back COVERED (restore + defaultActive true)', run: runDesktop },
  { name: 'a system switch sets the system aside', file: 'editorModel.ts', from: "return loc.depth === 0 ? ops.coverByDefault(tree, id, false) : [{ op: 'trimNode', nodeId: id }];", to: "return [{ op: 'trimNode', nodeId: id }];", check: 'switch: a system\'s switch is coverByDefault (it stays in the template, offered on site) — never a set-aside', run: runDesktop },
  { name: 'an item another question decides is called Every', file: 'typeLayout.ts', from: "    if (inner) {", to: "    if (false) {", check: 'types: an item another question in the system decides gets its own "Shown by …" section, not "Every" (Fireplace: by Chimney)', run: runTypes },
  { name: 'the preview row title ignores the type', file: 'core/answerShapes.ts', from: "  if (!tt || !v) return label;", to: "  return label;", check: 'types: the preview titles the Furnace by its picked type, as Scope does ("Gas Furnace", "Heat Pump", "Propane" → "Propane Furnace"; none or two picked → "Furnace"); other rows keep their names', run: runTypes },
  { name: 'the Propane name is not applied', file: 'core/answerShapes.ts', from: "const base = tt.map && typeof tt.map[v] === 'string' ? tt.map[v] : v;", to: "const base = v;", check: 'types: the preview titles the Furnace by its picked type, as Scope does ("Gas Furnace", "Heat Pump", "Propane" → "Propane Furnace"; none or two picked → "Furnace"); other rows keep their names', run: runTypes },
  { name: 'the type titles are not exported', file: 'core/ledrixRules.json', from: ' "typeTitles": {', to: ' "x_typeTitles": {', check: 'types: the preview titles the Furnace by its picked type, as Scope does ("Gas Furnace", "Heat Pump", "Propane" → "Propane Furnace"; none or two picked → "Furnace"); other rows keep their names', run: runTypes },
  { name: 'the Furnace forced-air rule is dropped from the pack', file: 'core/ledrixRules.json', from: '  "hvac_furnace": {\n   "requires": [', to: '  "hvac_furnace": {\n   "x_requires": [', check: 'types: Heating\'s Furnace and Cabinet / Access are filed under exactly the forced-air types, and the preview shows them for each forced-air type and for no other', run: runTypes },
  { name: 'Cabinet / Access shows for a boiler', file: 'core/ledrixRules.json', from: '  "hvac_cabinet": {\n   "requires": [\n    {\n     "specNodeId": "hvac_heating::fuel_source",\n     "includes": [', to: '  "hvac_cabinet": {\n   "requires": [\n    {\n     "specNodeId": "hvac_heating::fuel_source",\n     "includes": [\n      "Boiler",', check: 'types: Heating\'s Furnace and Cabinet / Access are filed under exactly the forced-air types, and the preview shows them for each forced-air type and for no other', run: runTypes },
  { name: 'a ruled item is called Every', file: 'typeLayout.ts', from: "    if (inner) {", to: "    if (false) {", check: 'types: "Every <system>" holds ONLY items with no rule at all, in every typed system of the Ledrix Default (Heating\'s included)', run: runTypes },
  { name: 'a special-home checkpoint is called Every', file: 'typeLayout.ts', from: "    if (specialIds.has(baseOf(n.id))) { special.push(n); continue; }", to: "", check: 'types: a special-home checkpoint (Manufactured-Home Listed Furnace) is in its own "Special homes" section, never "Every"', run: runTypes },
  { name: 'the type layout ignores the rules', file: 'typeLayout.ts', from: "  return collapseToActive(resolveApplicability(node as never, { specValue: () => value }).state);", to: "  return true;", check: 'types: each Cooling type shows EXACTLY the items the pack gives it (copies expanded)', run: runTypes },
  { name: 'a material list is laid out by type', file: 'typeLayout.ts', from: "if (c > best && several(k))", to: "if (c > best)", check: 'types: a material question that decides most of a system is still a material list, not type chips (Plumbing Supply on its own)', run: runTypes },
  { name: 'chips for a question that decides a few items', file: 'typeLayout.ts', from: "if (best * 3 < items.length) return null;", to: "", check: 'electrical: no type chips (Service Entrance decides 3 of 27 items); Heating, Cooling, Water Heater, Fireplace and Foundation keep theirs', run: runTypes },
  { name: 'Brought by is dropped (fuses back under every home)', file: 'materialLayout.ts', from: "if (!k) continue;", to: "if (k || !k) continue;", check: 'electrical: Fuses / Fuse Holders is brought by the fuse answers of Overcurrent Protection — never "every home"; breakers bring nothing extra', run: runTypes },
  { name: 'an answer brings only its first item', file: 'materialLayout.ts', from: "{ r.cards.push(n); any = true; }", to: "{ if (!r.cards.length) r.cards.push(n); any = true; }", check: 'electrical: Service records Size, Entrance and Main Disconnect; Service Entrance brings the drop and mast for Overhead and Service Mast, the lateral for Underground; Meter Base is every home', run: runTypes },
  { name: 'count copies are not collapsed', file: 'typeLayout.ts', from: "    if (g.items.length < 2) { typed.push(...g.items); continue; }", to: "    { typed.push(...g.items); continue; }", check: 'types: Indoor Head 1–8 are ONE row (one per head, 1–8), listed under Ductless Mini-Split only', run: runTypes },
  { name: 'the copies row edits only the first copy', file: 'typeLayout.ts', from: "  return group.items.flatMap(edit);", to: "  return group.items.slice(0, 1).flatMap(edit);", check: 'types: editing the copies row changes every copy at once, as ONE change set (one undo)', run: runTypes },
  { name: "the grid widens past Ledrix's rule", file: 'typeLayout.ts', from: "    if (outside.length) return { ok: false,", to: "    if (false) return { ok: false,", check: "types: a type Ledrix's rule excludes cannot be ticked, and no item can be left with no type (refused, nothing written)", run: runTypes },
  { name: 'the grid keeps a type rule when every allowed type is ticked', file: 'typeLayout.ts', from: "const narrow = values.length < allow.length ?", to: "const narrow = true ?", check: 'types: ticking back every type Ledrix allows removes the type rule again (no company rule left)', run: runTypes },
  { name: "the grid drops the item's other rule clauses", file: 'typeLayout.ts', from: "const clauses = [...keep, ...narrow];", to: "const clauses = [...narrow];", check: "types: a grid untick keeps the item's other rule (Heat Pump still follows the heating answer)", run: runTypes },
  { name: 'the grid writes the full set instead of the ticked one', file: 'typeLayout.ts', from: "[{ field: layout.question.field, anyOf: values }]", to: "[{ field: layout.question.field, anyOf: allow }]", check: "types: after the untick the phone's resolver and the grid agree for EVERY type", run: runTypes },
  { name: 'add-for-type shows before the type is answered', file: 'typeLayout.ts', from: ", whenUnknown: 'hide' } as TemplateNode", to: " } as TemplateNode", check: 'types: "+ Add item for <type>" adds ONE item that shows only for that type, hidden until the type is answered', run: runTypes },
  { name: 'the preview answer uses another key', file: 'typeLayout.ts', from: "? { key: layout.question.field, value }", to: "? { key: layout.question.nodeId + '::x', value }", check: "types: the preview, answered with the chosen type, shows that type's items and none of another type's", run: runTypes },
  { name: 'an Off material is no longer listed', file: 'materialLayout.ts', from: "if (values.length === 1 && !q.attr.values.some(v => brings(v)) && !brings(TYPED_PROBE)) q.off.push", to: "if (false) q.off.push", check: "materials: a switched-off material stays listed as Off with its card (Ledrix's PVC), and nothing on is listed Off", run: runTypes },
  { name: 'switching a material on leaves its card off', file: 'materialLayout.ts', from: "[...ops.fieldValues(q.node.id, q.attr, [...q.attr.values, off.value]), ...ops.restore(off.card.id)]", to: "[...ops.fieldValues(q.node.id, q.attr, [...q.attr.values, off.value])]", check: 'materials: switching it on puts the answer back (at the end) and its card back on — one change set — and it leaves the Off list', run: runTypes },
  { name: 'adding an Off material makes a second card', file: 'materialLayout.ts', from: "if (was) return switchMaterialOnOps(q, was);", to: "", check: 'materials: a company material (Brass) switched off is listed Off too, and adding "brass" again switches that one on — no second card', run: runTypes },
  { name: 'the new group is made but the item stays put', file: 'moveModel.ts', from: "return [...add, ...ops.move(id, gid, 0)];", to: "return add;", check: 'move: "+ New group" adds the group at the end of the system with the item as its first — ONE change set', run: runTypes },
  { name: 'a duplicate group name makes a second group', file: 'moveModel.ts', from: "!name.trim() || newGroupClash(tree, systemId, name)) return [];", to: "!name.trim()) return [];", check: 'move: a name the system already has as a group is that group (no duplicate); a group, a copied system or a blank name makes nothing', run: runTypes },
  { name: 'unknown answer sources pass through', file: 'assistant.ts', from: "source: s === 'company' || s === 'jurisdiction' ? s : 'general'", to: 'source: s', check: 'assistant: answers keep their source labels; unknown sources become general; non-text is dropped', run: runDesktop },
];
for (const m of EXEC_MUT) {
  const files = sourceFiles();
  if (files[m.file].split(m.from).length !== 2) { ok(`mutation anchor found once: ${m.name}`, false); continue; }
  files[m.file] = files[m.file].replace(m.from, () => m.to);
  const res = await m.run(files);
  ok(`mutation caught: ${m.name}`, res[m.check] !== true, JSON.stringify(Object.entries(res).filter(([, v]) => !v).map(([k]) => k)));
}

console.log(fail ? `\n✗ verify-template-builder: ${fail} failed, ${pass} passed` : `\n✓ verify-template-builder: ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
