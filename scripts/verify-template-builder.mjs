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

const CORE = ['templateOps', 'templateValidate', 'templateChangeSets', 'templateDraft', 'templateAuthoring', 'templateOpSummary', 'templateRules'];
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
const DESKTOP = ['editorModel', 'assistant'];
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
    step(E.ops.assessed(node().id, false), 4600);
    r('hand edit: turning assessment off removes it (never a grade)', node().condition === undefined);
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
  'writes: only the three template tables and the publish RPC': all => {
    const s = strip(all[API] ?? '');
    const tables = [...s.matchAll(/from\(\s*'([\w]+)'\s*\)/g)].map(m => m[1]);
    const rpcs = [...s.matchAll(/\.rpc\(\s*'([\w]+)'/g)].map(m => m[1]);
    return tables.every(t => ['company_templates', 'company_template_drafts', 'company_inspection_types'].includes(t)) && rpcs.every(x => x === 'publish_company_template_draft') && rpcs.length === 1 ? [] : [API];
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
  'writes: only the three template tables and the publish RPC': add(API, "\nworkspace.from('anomalies').select('id');"),
  'writes: every update names the next version (row_version)': rep(API, "update({ name: name.trim(), row_version: t.rowVersion + 1 })", "update({ name: name.trim() })"),
  'writes: the live template is never inserted, upserted or hard-deleted from the browser': add(API, "\nworkspace.from('company_templates').delete().eq('id', x);"),
  'isolation: no inspection, finding or snapshot table is touched': add('lib/templates/useDraft.ts', "\nworkspace.from('inspection_templates').select('*');"),
  'isolation: browser storage is written only by draftStore': add(EDIT, "\nlocalStorage.setItem('x', '1');"),
  'isolation: the phone preview reads the draft and writes nothing': add('components/templates/PhonePreview.tsx', "\nfetch('/api/x');"),
  'no model key or service-role key in browser code': add('components/templates/LedrixPanel.tsx', "\nconst k = process.env.GATEWAY_KEY;"),
  'route: requires a signed-in user': rep(ROUTE, 'admin.auth.getUser(token)', 'admin.auth.getUser()'),
  "route: owner/admin, working on their own company's template or draft": rep(ROUTE, ".eq('id', templateId as string).eq('company_id', profile.company_id)", ".eq('id', templateId as string)"),
  'route: the prompt is built on the server': rep(ROUTE, 'askModel(prompt.system, prompt.user)', 'askModel(String((body as any).system), prompt.user)'),
  'route: the cost cap is counted before the model is called': rep(ROUTE, 'const used = await bumpUsage(admin, user.id);', 'const used = 0;'),
  'route: the reply shape is normalized before grades are filtered and the browser checks it': all => /normalizeChanges\(\(parsed as \{ changes: unknown\[\] \}\)\.changes\)/.test(strip(all[ROUTE] ?? '')) ? [] : [ROUTE],
  'route: the reply shape is normalized before grades are filtered and the browser checks it': rep(ROUTE, 'normalizeChanges((parsed as { changes: unknown[] }).changes)', '(parsed as { changes: unknown[] }).changes'),
  'route: grades are filtered out before the owner sees them': rep(ROUTE, '.filter(c => !isGradeChange(c))', '.filter(Boolean)'),
  'pages: editing is for owners and admins only': rep(EDIT, 'if (!access.companyId || !author)', 'if (!access.companyId)'),
  'pages: publish, rename, delete and type assignment are owner-only in the UI': rep(LIST, 'disabled={!owner || busy}', 'disabled={busy}'),
  'pages: publishing always asks first and says inspections are not changed': rep(EDIT, 'Inspections already started or finished keep the copy they started with', 'Done'),
};
for (const [name, mutate] of Object.entries(MUT)) {
  const rule = RULES[name];
  if (!rule) { ok(`mutation has a rule: ${name}`, false); continue; }
  ok(`mutation caught: ${name}`, rule(mutate(all)).length > 0);
}
const EXEC_MUT = [
  { name: 'propose replaces a reviewed proposal', file: 'session.ts', from: "if (draft.pending && draft.pending.entries.some(e => e.status !== 'proposed')) {", to: 'if (false) {', check: 'propose: never replaces a proposal that holds a decision', run: runExecuted },
  { name: 'an unreadable draft is replaced by a fresh one', file: 'draftStore.ts', from: "try { parsed = JSON.parse(raw); } catch { throw new DraftStoreError('The saved draft could not be read.'); }", to: 'try { parsed = JSON.parse(raw); } catch { return null; }', check: 'an unreadable saved draft is an error and is left in place, never silently replaced', run: runExecuted },
  { name: 'the draft shares the live template object', file: 'core/templateDraft.ts', from: 'tree: clone(args.live)', to: 'tree: args.live', check: 'draft: a new draft is a COPY of the live template', run: runDesktop },
  { name: 'hand edits skip the change-set log', file: 'editorModel.ts', from: "  const r = applyToDraft(d, cs, now);\n  return r.ok ? { ok: true, draft: r.draft } : { ok: false, error: r.error };", to: "  const r = applyToDraft(d, cs, now);\n  return r.ok ? { ok: true, draft: { ...r.draft, log: d.log } } : { ok: false, error: r.error };", check: 'hand edit: every edit is undoable', run: runDesktop },
  { name: 'a whole-template question may propose changes', file: 'assistant.ts', from: "return { system, user, promptRef: hashOf({ system, user }), proposesFor: null };", to: "return { system, user, promptRef: hashOf({ system, user }), proposesFor: req.tree.systems[0]?.id ?? null };", check: 'assistant: a whole-template question proposes nothing', run: runDesktop },
  { name: 'grades hidden in a value list slip through', file: 'assistant.ts', from: "if (op.op === 'setAttributeField') return", to: "if (op.op === 'setAttributeField') return false &&", check: 'assistant: grades are caught wherever they hide', run: runDesktop },
  { name: 'flattened changes are not re-wrapped', file: 'assistant.ts', from: "    if (typeof x.op === 'string') {", to: "    if (false) {", check: 'assistant: a flattened or renamed change is re-wrapped, a correct one is untouched, junk stays junk', run: runDesktop },
  { name: 'switching on only clears the off flag', file: 'editorModel.ts', from: "const want = s.id === systemId ? on : isCovered(tree, s);", to: "const want = s.id === systemId ? (on ? (undefined as any) : false) : isCovered(tree, s);", check: 'coverage: switching a system on makes it covered (defaultActive true, not merely "not false")', run: runDesktop },
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
