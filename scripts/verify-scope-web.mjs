#!/usr/bin/env node
// verify-scope-web — the Scope checklist on the website (2026-11-02, owner-approved mockup; ledrix-app SQL #92).
//
//   node scripts/verify-scope-web.mjs        (LEDRIX_APP=<dir> for another app checkout; ALLOW_NO_APP=1 skips §1)
//
//   §1 PARITY: lib/scope/core/** are byte-identical copies of ledrix-app src/core/** (the app's scopeRules.ts and the
//      pure modules it needs) — the one shared rules file, owner 2026-11-02
//   §2 the MODEL, executed on the real 275 N Kimball rows the phone wrote: the same keys and labels; rows and tiles;
//      pair halves and pointers; the progress count; limitation reasons; Satisfactory replaces / clears
//   §3 the PANEL: every pick takes the lock first and names the version it saw; the section gate; Satisfactory is off
//      while an item has a finding; spec picks keep the entry's other fields
//   §4 mutations
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ?? join(ROOT, '..', 'ledrix-app');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
registerHooks({
  resolve(spec, ctx, next) { if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]sx?$|\.json$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); },
  load(url, ctx, next) { if (url.endsWith('.json')) return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`, shortCircuit: true }; return next(url, ctx); },
});

const out = []; const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });

// §1
const COPIES = ['taxonomy/scopeRules.ts', 'taxonomy/conditionMatch.ts', 'taxonomy/specKeyDefs.ts', 'taxonomy/ledrix.core.json', 'taxonomy/roomMatching.ts', 'taxonomy/leafProgress.ts', 'services/structureIds.ts'];
if (!existsSync(join(APP, 'src/core/taxonomy/scopeRules.ts'))) {
  if (process.env.ALLOW_NO_APP) console.log(`  · §1 SKIPPED — no ledrix-app at ${APP}`);
  else ok(`§1 ledrix-app found at ${APP} (LEDRIX_APP, or ALLOW_NO_APP=1 to skip)`, false);
} else {
  for (const f of COPIES) ok(`§1 lib/scope/core/${f} is byte-identical to the app's src/core/${f}`, read(`lib/scope/core/${f}`) === readFileSync(join(APP, 'src/core', f), 'utf8'),
    'run node scripts/sync-web-preview.mjs in ledrix-app');
  const manifest = JSON.parse(readFileSync(join(APP, 'scripts/web-preview-sync.json'), 'utf8')).copies;
  ok('§1 the app’s sync manifest lists every one of them', COPIES.every(f => manifest[`src/core/${f}`] === `lib/scope/core/${f}`));
}

// §2
const M = await import(pathToFileURL(join(ROOT, 'lib/scope/model.ts')).href);
const R = await import(pathToFileURL(join(ROOT, 'lib/scope/core/taxonomy/scopeRules.ts')).href);
const fx = JSON.parse(read('scripts/fixtures/scope-kimball.json'));
const values = M.valueMapOf(fx.values);
const view = M.buildScope(fx.template, values, { findings: id => (id === 'roof_gutters' ? 1 : 0), photos: () => 0 });
const sys = (id) => view.systems.find(s => s.node.id === id);
const rows = (id) => sys(id).tiles.flatMap(t => t.rows);
const row = (sid, nid) => rows(sid).find(r => r.node.id === nid);
const keysOf = (r) => r.specs.map(f => f.key);
ok('§2 a three-field spec writes the phone’s keys and labels (Roof Material — Layer Count)',
  JSON.stringify(keysOf(row('roofing', 'roof_material'))) === '["roof_material::type","roof_material::layer_count","roof_material::estimated_age"]'
  && row('roofing', 'roof_material').specs[1].label === 'Roof Material — Layer Count', JSON.stringify(row('roofing', 'roof_material').specs.map(f => [f.key, f.label])));
ok('§2 the core pack keeps Cooling’s two fields apart (hvac_cooling::spec / ::age), as the phone stored them',
  JSON.stringify(keysOf(row('cooling', 'hvac_cooling'))) === '["hvac_cooling::spec","hvac_cooling::age"]' && row('cooling', 'hvac_cooling').specs[0].label === 'AC System Type — AC System Type');
ok('§2 a single field is the bare node id, named by the component (Gutters)', JSON.stringify(keysOf(row('roofing', 'roof_gutters'))) === '["roof_gutters"]' && row('roofing', 'roof_gutters').specs[0].label === 'Gutters');
ok('§2 a method-only row writes the bare id under its own name (Method of Inspection)', JSON.stringify(keysOf(row('roofing', 'roof_method'))) === '["roof_method"]' && row('roofing', 'roof_method').specs[0].label === 'Method of Inspection');
ok('§2 what the phone stored is what the page shows', JSON.stringify(row('roofing', 'roof_material').specs.map(f => f.picked)) === '[["Asphalt Shingle"],["2 Layers"],["Under 5 years old"]]'
  && JSON.stringify(row('roofing', 'roof_flashing').condition.values) === '["OK"]');
ok('§2 every key the page would write is one the phone wrote (no drift on the real rows)',
  fx.values.every(v => view.systems.some(s => s.tiles.some(t => t.rows.some(r => (v.kind === 'condition' ? r.condition?.key === v.node_key : r.specs.some(f => f.key === v.node_key)))))));
// A company that ADDS a field keeps the Ledrix field on its old key (the core pack decides, not the template's field
// count): Gutters + a company "Guard Type" → material stays bare `roof_gutters`, the new one is `roof_gutters::guard_type`.
const added = M.buildScope({ systems: [{ id: 'roofing', kind: 'system', label: 'ROOFING', inScope: true, children: [
  { id: 'roof_gutters', kind: 'component', label: 'Gutters', condition: true, attributes: [
    { id: 'material', label: 'Material', values: ['Vinyl'] }, { id: 'guard_type', label: 'Guard Type', values: ['Screen'] }] }] }] },
  M.valueMapOf([]), { findings: () => 0, photos: () => 0 });
ok('§2 a company-added field never moves the Ledrix field’s key (core pack, not template shape)',
  JSON.stringify(added.systems[0].tiles[0].rows[0].specs.map(f => f.key)) === '["roof_gutters","roof_gutters::guard_type"]',
  JSON.stringify(added.systems[0].tiles[0].rows[0].specs.map(f => f.key)));
ok('§2 tiles are the subsystems; a system with none is its own tile', JSON.stringify(sys('roofing').tiles.map(t => t.node.id)) === '["roofing__covering","roofing__flashing_penetrations","roofing__drainage"]'
  && JSON.stringify(sys('cooling').tiles.map(t => t.node.id)) === '["cooling"]');
ok('§2 a pointer row and anything trimmed are not rows', !rows('cooling').some(r => r.node.id.startsWith('cooling__link')) && !rows('roofing').some(r => r.node.id.startsWith('roofing_manufactured')));
ok('§2 sections are the system ids', row('roofing', 'roof_gutters').section === 'roofing' && row('cooling', 'hvac_condenser').section === 'cooling');
// Roofing: Roof Material (3/3 fields) and Method (answered) are described; Asphalt Shingle, Flashings, Skylights are
// Satisfactory; Gutters and Discharge take a condition and have none yet, so their spec alone does not count (phone rule).
ok('§2 the count: an empty condition entry ({values: []}) is not checked; a fully described spec is; a spec alone does not check an item that takes a condition', sys('cooling').done === 1 && sys('cooling').total === 3
  && sys('roofing').done === 5 && sys('roofing').total === 7, JSON.stringify([sys('cooling').done, sys('cooling').total, sys('roofing').done, sys('roofing').total]));
ok('§2 limitation reasons: the item’s own first, the standard ones underneath', JSON.stringify(row('roofing', 'roof_skylights').condition.reasons.slice(0, 2)) === '["Not Visible","Not visible during inspection"]');
ok('§2 a limitation is stored as the phone stores it, and replaces Satisfactory', JSON.stringify(R.nextConditionValues(['OK'], { limitation: 'Not Visible' })) === '["Not Visible (Limitation)"]');
ok('§2 Satisfactory replaces a limitation; tapping it again clears to []', JSON.stringify(R.nextConditionValues(['Not Visible (Limitation)'], { ok: true })) === '["OK"]' && JSON.stringify(R.nextConditionValues(['OK'], { ok: true })) === '[]');
ok('§2 the section gate: the lead edits every section, a teammate their own, someone not on the job none', (() => {
  const team = { lead: 'k', me: 'k', people: [{ user_id: 'k' }, { user_id: 'm' }], sections: { heating: 'm' } };
  return M.sectionAccess(team, 'heating') === 'edit' && M.sectionAccess({ ...team, me: 'm' }, 'heating') === 'edit'
    && M.sectionAccess({ ...team, me: 'm' }, 'roofing') === 'not_yours' && M.sectionAccess({ ...team, me: 'x' }, 'roofing') === 'not_on_job';
})());

// §3
const panel = read('components/workspace/ScopePanel.tsx'), api = read('lib/scope/api.ts'), page = read('app/app/inspections/[id]/page.tsx');
ok('§3 every pick takes the job’s edit lock first', /const lease = await lock\.ensure\(\);\s*if \(!lease\) return;\s*const r = await putValue\(/.test(panel));
ok('§3 every pick names the version it saw (#92), through the phones’ own function', /base_seq: row\.baseSeq/.test(api) && /rpc\('put_inspection_values'/.test(api) && /baseSeq: seq/.test(panel));
ok('§3 a refused "changed" shows the phone’s value and says so', /r\.reason === 'changed'/.test(panel) && /Your pick wasn’t saved\. Theirs is showing now\./.test(panel));
ok('§3 picks only for someone who may change the section, and not while their phone has the job', /const editable = access === 'edit' && !lock\.heldBy;/.test(panel));
ok('§3 Satisfactory is off while the item has a finding', /disabled=\{!editable \|\| busy \|\| \(noOk && !ok\)\}/.test(panel) && /const noOk = row\.findings > 0;/.test(panel));
ok('§3 a spec pick keeps the entry’s other fields (room, age)', /\{ \.\.\.prev, label: f\.label, value: joinSpecPicks\(picked\) \}/.test(panel));
ok('§3 the page has a Scope section that shares the findings’ lock', /\{ id: 'scope', label: 'Scope', show: findingsVisible \}/.test(page) && /<ScopePanel inspectionId=\{id\} team=\{team\} names=\{names\} lock=\{lock\}/.test(page));

let pass = 0, fail = 0;
if (process.env.SCOPE_MUTANT) { console.log(JSON.stringify(out.filter(r => !r.pass).map(r => r.name))); process.exit(0); }
for (const r of out) { if (r.pass) { pass++; console.log(`  ✓ ${r.name}`); } else { fail++; console.log(`  ✗ ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`); } }
// §4 mutations — each one applied to a copy of the tree, the suite re-run against it, and it must fail.
const { execFileSync } = await import('node:child_process');
const { mkdtempSync, cpSync, writeFileSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const MUTANTS = [
  { f: 'lib/scope/model.ts', why: 'pointer rows shown', from: 'return !!n && !n.pointsTo && !recordsNothing(n);', to: 'return !!n && !recordsNothing(n);', expect: /^§2 a pointer row/ },
  { f: 'lib/scope/model.ts', why: 'the core pack not registered (keys from the template’s shape)', from: "import './core/taxonomy/specKeyDefs';", to: '', expect: /^§2 a company-added field/ },
  { f: 'lib/scope/model.ts', why: 'a spec alone counts an item that takes a condition', from: "const ans = componentAxes(k).condition === false ? answerNodeFor(k, pairMap.get(k.id)) : null;", to: "const ans = answerNodeFor(k, pairMap.get(k.id));", expect: /^§2 the count/ },
  { f: 'lib/scope/model.ts', why: 'a teammate may change any section', from: "return holderOf(team, section) === team.me ? 'edit' : 'not_yours';", to: "return 'edit';", expect: /^§2 the section gate/ },
  { f: 'components/workspace/ScopePanel.tsx', why: 'picks saved without the lock', from: 'const lease = await lock.ensure();\n      if (!lease) return;\n', to: '', expect: /^§3 every pick takes/ },
  { f: 'lib/scope/api.ts', why: 'the version seen is not sent', from: ', base_seq: row.baseSeq', to: '', expect: /^§3 every pick names/ },
  { f: 'components/workspace/ScopePanel.tsx', why: 'a spec pick drops room / age', from: '{ ...prev, label: f.label, value: joinSpecPicks(picked) }', to: '{ label: f.label, value: joinSpecPicks(picked) }', expect: /^§3 a spec pick keeps/ },
];
if (!process.env.SCOPE_NO_MUTANTS) for (const m of MUTANTS) {
  const src = read(m.f);
  if (src.split(m.from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${m.why}`); continue; }
  const dir = mkdtempSync(join(tmpdir(), 'scope-mut-'));
  for (const d of ['lib', 'components', 'app', 'scripts']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  writeFileSync(join(dir, m.f), src.replace(m.from, m.to));
  let failed = [];
  try { failed = JSON.parse(execFileSync(process.execPath, [join(dir, 'scripts/verify-scope-web.mjs')], { encoding: 'utf8', env: { ...process.env, SCOPE_MUTANT: '1', SCOPE_NO_MUTANTS: '1', LEDRIX_APP: APP } }).trim().split('\n').pop()); }
  catch { failed = ['(the suite crashed)']; }
  if (failed.some(n => m.expect.test(n) || n === '(the suite crashed)')) { pass++; console.log(`  ✓ caught: ${m.why}`); } else { fail++; console.log(`  ✗ NOT caught: ${m.why}`); }
}
console.log(`\nverify-scope-web — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
