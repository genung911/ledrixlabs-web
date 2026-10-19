// Guard for the desktop Template Builder (/app/templates/[id], /api/template-authoring, lib/templateBuilder).
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
// 3. STATIC — isolation (no Supabase write anywhere in the builder; company_templates only SELECTed; no
//    inspection or snapshot table), no model key or service-role key in browser code, the server route's gates
//    (session, owner/admin, own company's template, prompt built server-side, cost cap before the model).
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

const CORE = ['templateOps', 'templateValidate', 'templateChangeSets', 'templateDraft', 'templateAuthoring', 'templateOpSummary'];

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
function stage(files) {
  const dir = mkdtempSync(join(tmpdir(), 'tb-'));
  mkdirSync(join(dir, 'core'));
  const fix = s => s.replace(/from '(\.{1,2}\/[^']+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
  for (const [rel, src] of Object.entries(files)) writeFileSync(join(dir, rel), fix(src));
  return dir;
}
const sourceFiles = () => Object.fromEntries([
  ...CORE.map(f => [`core/${f}.ts`, read(`lib/templateBuilder/core/${f}.ts`)]),
  ['core/InspectionTemplate.ts', read('lib/templateBuilder/core/InspectionTemplate.ts')],
  ...BUILDER.map(f => [`${f}.ts`, read(`lib/templateBuilder/${f}.ts`)]),
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

console.log('executed');
const real = await runExecuted(sourceFiles());
for (const [k, v] of Object.entries(real)) ok(k, v);

// ── 3. Static ─────────────────────────────────────────────────────────────────────────────────────────────
const BUILDER_DIRS = ['lib/templateBuilder', 'app/app/templates', 'app/api/template-authoring'];
const loadAll = () => Object.fromEntries(BUILDER_DIRS.flatMap(walk).map(f => [f, read(f)]));
const ROUTE = 'app/api/template-authoring/route.ts';
const browserFiles = all => Object.entries(all).filter(([f]) => !f.startsWith('app/api/'));

const RULES = {
  'isolation: no Supabase write anywhere in the builder': all => Object.entries(all).filter(([, s]) => /\.(insert|update|upsert|delete)\s*\(/.test(strip(s)) || /\.rpc\s*\(/.test(strip(s))).map(([f]) => f),
  'isolation: company_templates is only ever SELECTed': all => Object.entries(all).filter(([, s]) => {
    const t = strip(s);
    return [...t.matchAll(/from\(\s*'company_templates'\s*\)\s*\.(\w+)/g)].some(m => m[1] !== 'select');
  }).map(([f]) => f),
  'isolation: no inspection, finding or snapshot table is touched': all => Object.entries(all).filter(([, s]) => /from\(\s*'(inspections|anomalies|technical_specs|inspection_template[\w]*|inspection_templates)'\s*\)/.test(strip(s))).map(([f]) => f),
  'isolation: browser storage is written only by draftStore': all => browserFiles(all).filter(([f, s]) => f !== 'lib/templateBuilder/draftStore.ts' && /localStorage|sessionStorage|indexedDB/.test(strip(s))).map(([f]) => f),
  'no model key or service-role key in browser code': all => browserFiles(all).filter(([, s]) => /SERVICE_ROLE|GATEWAY_KEY|x-ledrix-key|OPENAI/i.test(s)).map(([f]) => f),
  'route: requires a signed-in user': all => (/admin\.auth\.getUser\(token\)/.test(all[ROUTE] ?? '') && /if \(!token\) return fail\(401/.test(all[ROUTE] ?? '')) ? [] : [ROUTE],
  'route: owner/admin of the company, and the template is that company\'s': all => {
    const s = all[ROUTE] ?? '';
    return (/canAuthorTemplates\(profile\.role\)/.test(s) && /from\('company_templates'\)\.select\('id'\)\.eq\('id', templateId\)\.eq\('company_id', profile\.company_id\)/.test(s)) ? [] : [ROUTE];
  },
  'route: the prompt is built on the server with the fixed grammar': all => {
    const s = all[ROUTE] ?? '';
    return (/buildAuthoringPrompt\(\{ tree: t, systemId, request \}\)/.test(s) && /askModel\(prompt\.system, prompt\.user\)/.test(s) && !/body\.(system|messages|prompt)/.test(s)) ? [] : [ROUTE];
  },
  'route: the cost cap is counted before the model is called': all => {
    const s = strip(all[ROUTE] ?? '');
    const cap = s.indexOf('bumpUsage(admin, user.id)'), model = s.indexOf('await askModel(');
    return cap > 0 && model > cap && /used > DAILY_CAP/.test(s) ? [] : [ROUTE];
  },
  'page: the builder is offered to owners and admins only': all => {
    const list = all['app/app/templates/page.tsx'] ?? '', page = all['app/app/templates/[id]/page.tsx'] ?? '';
    return (/canAuthorTemplates\(access\.role\)/.test(list) && /author\s*\n?\s*\?\s*<Link href=\{`\/app\/templates\//.test(list) && /if \(!author\) \{ setLoad\(\{ kind: 'denied' \}\)/.test(page)) ? [] : ['app/app/templates'];
  },
  'no publish path: nothing in the builder names publishing as an action': all => browserFiles(all).filter(([, s]) => /\bpublish(Draft|Template)?\s*\(/.test(strip(s))).map(([f]) => f),
};

console.log('static');
const all = loadAll();
ok('the builder files exist', !!all[ROUTE] && !!all['app/app/templates/[id]/page.tsx'] && !!all['lib/templateBuilder/session.ts']);
for (const [name, rule] of Object.entries(RULES)) { const bad = rule(all); ok(name, bad.length === 0, bad.join(', ')); }

// ── 4. Mutations ──────────────────────────────────────────────────────────────────────────────────────────
console.log('mutations');
const P = 'app/app/templates/[id]/page.tsx';
const MUT = {
  'isolation: no Supabase write anywhere in the builder': s => ({ ...s, 'lib/templateBuilder/session.ts': s['lib/templateBuilder/session.ts'] + "\nworkspace.from('company_templates').upsert({});" }),
  'isolation: company_templates is only ever SELECTed': s => ({ ...s, [ROUTE]: s[ROUTE].replace("from('company_templates').select('id')", "from('company_templates').update({}).select('id')") }),
  'isolation: no inspection, finding or snapshot table is touched': s => ({ ...s, 'lib/templateBuilder/remote.ts': s['lib/templateBuilder/remote.ts'] + "\nworkspace.from('inspection_templates').select('*');" }),
  'isolation: browser storage is written only by draftStore': s => ({ ...s, [P]: s[P] + "\nlocalStorage.setItem('x', '1');" }),
  'no model key or service-role key in browser code': s => ({ ...s, 'lib/templateBuilder/remote.ts': s['lib/templateBuilder/remote.ts'] + "\nconst k = process.env.GATEWAY_KEY;" }),
  'route: requires a signed-in user': s => ({ ...s, [ROUTE]: s[ROUTE].replace('admin.auth.getUser(token)', 'admin.auth.getUser()') }),
  "route: owner/admin of the company, and the template is that company's": s => ({ ...s, [ROUTE]: s[ROUTE].replace(".eq('company_id', profile.company_id)", '') }),
  'route: the prompt is built on the server with the fixed grammar': s => ({ ...s, [ROUTE]: s[ROUTE].replace('askModel(prompt.system, prompt.user)', 'askModel(String((body as any).system), prompt.user)') }),
  'route: the cost cap is counted before the model is called': s => ({ ...s, [ROUTE]: s[ROUTE].replace('const used = await bumpUsage(admin, user.id);', 'const used = 0;') }),
  'page: the builder is offered to owners and admins only': s => ({ ...s, [P]: s[P].replace("if (!author) { setLoad({ kind: 'denied' }); return; }", '') }),
  'no publish path: nothing in the builder names publishing as an action': s => ({ ...s, 'lib/templateBuilder/session.ts': s['lib/templateBuilder/session.ts'] + '\nexport const go = () => publishDraft();' }),
};
for (const [name, mutate] of Object.entries(MUT)) {
  const rule = RULES[name];
  if (!rule) { ok(`mutation has a rule: ${name}`, false); continue; }
  ok(`mutation caught: ${name}`, rule(mutate(all)).length > 0);
}
const EXEC_MUT = [
  { name: 'propose replaces a reviewed proposal', file: 'session.ts', from: "if (draft.pending && draft.pending.entries.some(e => e.status !== 'proposed')) {", to: 'if (false) {', check: 'propose: never replaces a proposal that holds a decision' },
  { name: 'an unreadable draft is replaced by a fresh one', file: 'draftStore.ts', from: "try { parsed = JSON.parse(raw); } catch { throw new DraftStoreError('The saved draft could not be read.'); }", to: 'try { parsed = JSON.parse(raw); } catch { return null; }', check: 'an unreadable saved draft is an error and is left in place, never silently replaced' },
  { name: 'the draft shares the live template object', file: 'core/templateDraft.ts', from: 'tree: clone(args.live)', to: 'tree: args.live', check: 'open: the draft is a COPY — mutating it never touches the live template object' },
];
for (const m of EXEC_MUT) {
  const files = sourceFiles();
  if (files[m.file].split(m.from).length !== 2) { ok(`mutation anchor found once: ${m.name}`, false); continue; }
  files[m.file] = files[m.file].replace(m.from, () => m.to);
  const res = await runExecuted(files);
  ok(`mutation caught: ${m.name}`, res[m.check] === false, JSON.stringify(Object.entries(res).filter(([, v]) => !v).map(([k]) => k)));
}

console.log(fail ? `\n✗ verify-template-builder: ${fail} failed, ${pass} passed` : `\n✓ verify-template-builder: ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
