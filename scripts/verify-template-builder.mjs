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

const CORE = ['templateOps', 'templateValidate', 'templateChangeSets', 'templateDraft', 'templateAuthoring', 'templateOpSummary', 'templateRules', 'structureTypes', 'requirementsContract', 'equipmentCatalog'];
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
const DESKTOP = ['editorModel', 'assistant', 'ruleModel', 'requirementModel', 'catalogModel', 'startingPoints'];
function stage(files) {
  const dir = mkdtempSync(join(tmpdir(), 'tb-'));
  mkdirSync(join(dir, 'core'));
  const alias = s => s
    .replace(/from '@\/lib\/templateBuilder\/core\/([^']+)'/g, "from './core/$1'")
    .replace(/from '@\/lib\/(?:templateBuilder|templates)\/([^']+)'/g, "from './$1'");
  const fix = s => alias(s).replace(/from '(\.{1,2}\/[^']+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
  for (const [rel, src] of Object.entries(files)) writeFileSync(join(dir, rel), fix(src));
  return dir;
}
const sourceFiles = () => Object.fromEntries([
  ...CORE.map(f => [`core/${f}.ts`, read(`lib/templateBuilder/core/${f}.ts`)]),
  ...TAXONOMY_CORE.map(f => [`core/${f}.ts`, read(`lib/templateBuilder/core/${f}.ts`)]),
  ['core/InspectionTemplate.ts', read('lib/templateBuilder/core/InspectionTemplate.ts')],
  ...BUILDER.map(f => [`${f}.ts`, read(`lib/templateBuilder/${f}.ts`)]),
  ...DESKTOP.map(f => [`${f}.ts`, read(`lib/templates/${f}.ts`)]),
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
      r('switches: an item whose field keeps answers under Ledrix’s own key cannot switch Details off',
        E.detailsLocked(E.locate(sd.tree, 'heating__locked').node) && E.ops.switchDetails(E.locate(sd.tree, 'heating__locked').node, false).length === 0);
      apply(E.ops.assessed('heating__vent', false), 7300); apply(E.ops.switchDetails(vn(), false), 7400);
      r('switches: Condition, Details and Requirements all off → the item records nothing (hidden on the phone) and its summary says so',
        E.recordsNothingHere(vn()) && /hidden from inspectors/.test(E.itemSummary(vn())));
      apply(E.ops.assessed('heating__vent', true), 7500);
      r('switches: any one on → it records something again', !E.recordsNothingHere(vn()));
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
      r('create: the blank start has no systems; every card reports real counts from its tree',
        pts(ctx()).find(p => p.kind === 'blank').tree.systems.length === 0 && f.find(p => p.key === 'ledrix_fourpoint').systems.join() === 'Roofing' && f.find(p => p.key === 'ledrix_default').componentCount === 1);
    }
    // ── the equipment component catalog (owner rulings 2026-10-26) ──────────────────────────────────────────
    const C = await import(pathToFileURL(join(dir, 'catalogModel.ts')).href);
    const EC = await import(pathToFileURL(join(dir, 'core/equipmentCatalog.ts')).href);
    const FUEL = ['Gas Furnace', 'Electric Heat', 'Heat Pump', 'Propane', 'Oil Furnace', 'Boiler', 'Radiant Heat'];
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
    }
  } catch (e) {
    r(`desktop scenario completed (${e?.message})`, false);
  }
  return results;
}

console.log('executed');
const real = await runExecuted(sourceFiles());
for (const [k, v] of Object.entries(real)) ok(k, v);
const desk = await runDesktop(sourceFiles());
for (const [k, v] of Object.entries(desk)) ok(k, v);

// ── 3. Static ─────────────────────────────────────────────────────────────────────────────────────────────
const BUILDER_DIRS = ['lib/templateBuilder', 'lib/templates', 'components/templates', 'app/app/templates', 'app/api/template-assistant'];
const loadAll = () => Object.fromEntries(BUILDER_DIRS.flatMap(walk).map(f => [f, read(f)]));
const ROUTE = 'app/api/template-assistant/route.ts';
const API = 'lib/templates/api.ts';
const LIST = 'app/app/templates/page.tsx', EDIT = 'app/app/templates/[id]/page.tsx';
const browserFiles = all => Object.entries(all).filter(([f]) => !f.startsWith('app/api/'));
const WRITE = /\.(insert|update|upsert|delete)\s*\(\s*[{\[]|\.delete\(\)|\.rpc\s*\(/;

const RULES = {
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
  'isolation: browser storage is written only by draftStore': all => browserFiles(all).filter(([f, s]) => f !== 'lib/templateBuilder/draftStore.ts' && /localStorage|sessionStorage|indexedDB/.test(strip(s))).map(([f]) => f),
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
    const s = strip(all['components/templates/EditorParts.tsx'] ?? '');
    return (/<Toggle on=\{assessesCondition\(node\)\}/.test(s) && !/node\.condition (===|&&)/.test(s)) ? [] : ['components/templates/EditorParts.tsx'];
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
    const ws = strip(all['components/templates/Workspace.tsx'] ?? ''), parts = strip(all['components/templates/EditorParts.tsx'] ?? '');
    return /action=\{<IncludedSwitch on=\{isCovered\(tree, system\)\} label=\{system\.label\} disabled=\{disabled\} onChange=\{v => onOps\(ops\.coverByDefault\(tree, system\.id, v\)\)\} \/>\}/.test(ws)
      && !/coverByDefault/.test(parts) ? [] : ['components/templates/Workspace.tsx'];
  },
  'switches: an item’s Overview carries Condition, Details and Requirements; each tab shows only when its switch is on': all => {
    const ws = strip(all['components/templates/Workspace.tsx'] ?? ''), parts = strip(all['components/templates/EditorParts.tsx'] ?? '');
    return /const visible: ComponentTab\[\] = \['overview', \.\.\.\(assessesCondition\(node\) \? \['condition' as const\] : \[\]\), \.\.\.\(detailsOn \? \['details' as const\] : \[\]\), \.\.\.\(reqsOn \? \['requirements' as const\] : \[\]\), 'applicability'\];/.test(ws)
      && /ops\.switchDetails\(node, on\)/.test(ws) && /ops\.switchRequirements\(node, on\)/.test(ws)
      && /Nothing to record — inspectors won’t see this item\./.test(parts) && !/ReportTab/.test(ws) ? [] : ['components/templates/Workspace.tsx'];
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
  'catalog: the system panel offers the catalog, which adds only through catalogOps and never offers Evidence yet': all => {
    const panel = strip(all['components/templates/CatalogPanel.tsx'] ?? ''), parts = strip(all['components/templates/EditorParts.tsx'] ?? '');
    return /<CatalogPanel tree=\{tree\} system=\{system\} onOps=\{onOps\} disabled=\{disabled\} \/>/.test(parts)
      && /onOps\(catalogOps\(tree, system, type\.id, addable\)\)/.test(panel) && !/op: '/.test(panel)
      && /<Toggle on=\{false\} disabled label=\{`Evidence for/.test(panel) ? [] : ['components/templates/CatalogPanel.tsx'];
  },
  'building types: edited only through setTemplateField structureTypes': all => {
    const s = strip(all['components/templates/BuildingTypes.tsx'] ?? '');
    const opsUsed = [...s.matchAll(/op: '(\w+)'/g)].map(m => m[1]);
    return (/const commit = \(next: StructureTypeDef\[\] \| null\) => onOps\(\[\{ op: 'setTemplateField', field: 'structureTypes', value: next \}\]\);/.test(s)
      && opsUsed.every(o => o === 'setTemplateField') && !/workspace|fetch\(|supabase/i.test(s)) ? [] : ['components/templates/BuildingTypes.tsx'];
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
  'requirements: publishing refuses a template that carries them — in the hook, before the RPC': all => {
    const hook = strip(all['lib/templates/useDraft.ts'] ?? '');
    const gate = hook.indexOf('const reqs = carriedRequirements(m0.core.tree);'), rpc = hook.indexOf('return publishDraft(');
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
      const writes = (x.match(/'requirements'/g) ?? []).length;
      if (f === 'lib/templates/editorModel.ts' ? !(writes === 1 && /setRequirements: \(nodeId: string, defs: readonly unknown\[\]\): TemplateOp\[\] => \[setField\(nodeId, 'requirements', /.test(x)) : writes > 0) bad.push(f);
    }
    return bad;
  },
  'requirements: the Publish button is disabled with the reason while the draft carries them': all => {
    const e = strip(all[EDIT] ?? '');
    return (/const reqs = carriedRequirements\(tree\);/.test(e) && /: reqs\.length \? `Not publishable yet — inspections can’t use requirements yet/.test(e)
      && /const canPublish = !publishBlock && /.test(e) && /disabled=\{!canPublish\} title=\{publishBlock \?\? undefined\}/.test(e)) ? [] : [EDIT];
  },
  // 2026-10-26: the six sections each render a real view of the draft (no dead navigation), and the inspector preview
  // renders the draft tree itself.
  'workspace: every section in the rail renders its view': all => {
    const e = strip(all[EDIT] ?? '');
    const ids = ['overview', 'buildings', 'systems', 'requirements', 'report', 'review'];
    return ids.every(id => new RegExp(`\\{ id: '${id}', label: `).test(e) && new RegExp(`section === '${id}' \\? 'flex'|section === '${id}' && `).test(e)) ? [] : [EDIT];
  },
  'workspace: the inspector preview renders the draft tree': all => /<PhonePreview tree=\{tree\} selection=\{sel\}/.test(strip(all[EDIT] ?? '')) ? [] : [EDIT],
  'applicability: rules are written only in the runtime\'s shape (ruleModel.writeRule)': all => {
    const r = strip(all['components/templates/RuleEditor.tsx'] ?? '');
    return /const next = writeRule\(conds\);/.test(r) && /onSave\(next\)/.test(r) && !/appliesWhen/.test(r) ? [] : ['components/templates/RuleEditor.tsx'];
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
  'writes: only lib/templates/api.ts writes to the database': add('components/templates/LedrixPanel.tsx', "\nworkspace.from('company_templates').update({ name: 'x' });"),
  'writes: only the three template tables, the company template context and the publish RPC': add(API, "\nworkspace.from('anomalies').select('id');"),
  'writes: every update names the next version (row_version)': rep(API, "update({ name: name.trim(), row_version: t.rowVersion + 1 })", "update({ name: name.trim() })"),
  'writes: the live template is never inserted, upserted or hard-deleted from the browser': add(API, "\nworkspace.from('company_templates').delete().eq('id', x);"),
  'isolation: no inspection, finding or snapshot table is touched': add('lib/templates/useDraft.ts', "\nworkspace.from('inspection_templates').select('*');"),
  'isolation: browser storage is written only by draftStore': add(EDIT, "\nlocalStorage.setItem('x', '1');"),
  'isolation: the phone preview reads the draft and writes nothing': add('components/templates/PhonePreview.tsx', "\nfetch('/api/x');"),
  'no model key or service-role key in browser code': add('components/templates/LedrixPanel.tsx', "\nconst k = process.env.GATEWAY_KEY;"),
  'route: requires a signed-in user': rep(ROUTE, 'admin.auth.getUser(token)', 'admin.auth.getUser()'),
  "route: owner/admin, working on their own company's template or draft": rep(ROUTE, ".eq('id', templateId as string).eq('company_id', profile.company_id)", ".eq('id', templateId as string)"),
  'editor: the condition switch shows the app rule, not the raw field': rep('components/templates/EditorParts.tsx', '<Toggle on={assessesCondition(node)}', '<Toggle on={node.condition === true}'),
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
  'requirements: publishing refuses a template that carries them — in the hook, before the RPC': rep('lib/templates/useDraft.ts', "if (reqs.length) throw new TemplateApiError('invalid', 'requirements_unsupported'", "if (false) throw new TemplateApiError('invalid', 'requirements_unsupported'"),
  'requirements: only editorModel.setRequirements writes them; nothing writes the default-set pin or overrides': add('components/templates/EditorParts.tsx', "\nconst x = { op: 'setNodeField', nodeId: 'a', field: 'requirements', value: [] };"),
  'requirements: the Publish button is disabled with the reason while the draft carries them': rep(EDIT, ': reqs.length ? `Not publishable yet', ': false ? `Not publishable yet'),
  'workspace: every section in the rail renders its view': rep(EDIT, "section === 'report' && ", "section === 'nothing' && "),
  'workspace: the inspector preview renders the draft tree': rep(EDIT, '<PhonePreview tree={tree} selection={sel}', '<PhonePreview tree={m.live?.tree ?? tree} selection={sel}'),
  'applicability: rules are written only in the runtime\'s shape (ruleModel.writeRule)': rep('components/templates/RuleEditor.tsx', 'onSave(next)', 'onSave({ any: conds })'),
  'editor: a system’s Included switch sits on its title line and writes through coverByDefault (the app’s rule)': rep('components/templates/Workspace.tsx', 'onChange={v => onOps(ops.coverByDefault(tree, system.id, v))} />}', 'onChange={() => undefined} />}'),
  'switches: an item’s Overview carries Condition, Details and Requirements; each tab shows only when its switch is on': rep('components/templates/Workspace.tsx', "...(detailsOn ? ['details' as const] : [])", "'details' as const"),
  'create: New template opens the creation page, which only starts a private draft and opens it in the builder': rep('app/app/templates/create/page.tsx', "router.push(`/app/templates/new?draft=${encodeURIComponent(draft.id)}`)", "router.push('/app/templates')"),
  'create: no individual license is collected, import is not offered as working, and no compliance is claimed': rep('app/app/templates/create/page.tsx', 'Coming later</Pill>', 'Beta</Pill>'),
  'catalog: the system panel offers the catalog, which adds only through catalogOps and never offers Evidence yet': rep('components/templates/CatalogPanel.tsx', '<Toggle on={false} disabled label={`Evidence for', '<Toggle on={false} label={`Evidence for'),
  'building types: edited only through setTemplateField structureTypes': add('components/templates/BuildingTypes.tsx', "\nconst x = [{ op: 'addNode', parentId: null }];"),
  'building types: publishing refuses an error — in the hook, before the RPC, and on the button': rep('lib/templates/useDraft.ts', "if (bad) throw new TemplateApiError('invalid', 'structure_types'", "if (false) throw new TemplateApiError('invalid', 'structure_types'"),
};
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
  { name: 'Details can be switched off over a Ledrix-keyed field', file: 'editorModel.ts', from: "return attrs.length && !detailsLocked(node)", to: "return attrs.length", check: 'switches: an item whose field keeps answers under Ledrix’s own key cannot switch Details off', run: runDesktop },
  { name: 'a starting point claims coverage', file: 'startingPoints.ts', from: "const coverage = { state: 'not_evaluated' as const,", to: "const coverage = { state: 'covered' as const,", check: 'create: requirements coverage is NOT EVALUATED on every starting point, whatever the company declared', run: runDesktop },
  { name: 'Ledrix Default is recommended without a matching service', file: 'startingPoints.ts', from: "reasons: svc.has('home') ? ['Built for general home inspections, a service you selected.'] : [],", to: "reasons: ['Aligned with the standards you follow.'],", check: 'create: no recommendation when Ledrix knows nothing that points to one', run: runDesktop },
  { name: 'forking mutates the source', file: 'startingPoints.ts', from: "return { ...JSON.parse(JSON.stringify(tree)), id: 'custom', name };", to: "return Object.assign(tree, { id: 'custom', name });", check: 'create: a starting tree is copied — the source is never changed, and the copy is the company’s own (id custom, its name)', run: runDesktop },
  { name: 'the catalog adds a component the template already has', file: 'catalogModel.ts', from: ".filter((x): x is { p: Pick; row: CatalogRow } => !!x.row && !x.row.present && ", to: ".filter((x): x is { p: Pick; row: CatalogRow } => !!x.row && ", check: 'catalog: only real picks are added — present, evidence and record-nothing picks are skipped', run: runDesktop },
  { name: 'the catalog adds evidence the phone cannot collect', file: 'catalogModel.ts', from: "!x.row.evidenceOnly && pickRecordsSomething", to: "pickRecordsSomething", check: 'catalog: only real picks are added — present, evidence and record-nothing picks are skipped', run: runDesktop },
  { name: 'the catalog adds a group to a system that has none', file: 'catalogModel.ts', from: "useGroup: hasGroups || kids.length === 0", to: "useGroup: true", check: 'catalog: a system with items but no groups gets items directly (a new group would hide its items)', run: runDesktop },
  { name: 'the catalog drops the equipment rule', file: 'catalogModel.ts', from: "...(rule ? { appliesWhen: rule }", to: "...(false ? { appliesWhen: rule }", check: 'catalog: each component applies only to its equipment ("Heating System is Gas Furnace or Propane")', run: runDesktop },
  { name: 'Condition off is stored as missing (= on in the app)', file: 'catalogModel.ts', from: "condition: p.condition,", to: "...(p.condition ? { condition: true } : {}),", check: 'catalog: Condition OFF is stored as an explicit false (the app reads a missing value as ON)', run: runDesktop },
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
