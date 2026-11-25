#!/usr/bin/env node
// verify-scope-job-rules — the website's Scope runs the job's OWN rules, as the phone does (owner 2026-11-24: the website
// showed Garage Door items on 123 Test St, whose Garage isn't Attached, and took a limitation on one the phone hides).
// A job created with a frozen rule set (`ruleDefinitions`) runs only those (the phone's inspectionRulesLookup); a job
// without one keeps the node's own rule over the pack's. EXECUTED through lib/scope/model.ts buildScope.
// Mutants are executed against an in-memory copy of model.ts written to a temp file; nothing under lib/ is edited.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
registerHooks({
  resolve(spec, ctx, next) { if (/^\.\.?\//.test(spec) && !/\.[cm]?[jt]sx?$|\.json$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); },
  load(url, ctx, next) { if (url.endsWith('.json')) return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`, shortCircuit: true }; return next(url, ctx); },
});
const item = (id, label) => ({ id, kind: 'component', label, condition: true });
const tpl = (withRules) => ({
  systems: [{ id: 'windows_doors', kind: 'system', label: 'WINDOWS & DOORS', inScope: true, children: [
    { id: 'windows_doors__garage_door', kind: 'subsystem', label: 'Garage Door', children: [item('gar_opener', 'Garage Door Opener'), item('gar_springs', 'Garage Door Springs & Cables')] },
    { id: 'windows_doors__doors', kind: 'subsystem', label: 'Exterior Doors', children: [item('ext_weatherstrip', 'Weatherstripping'), item('co_door_closer', 'Garage Entry Door Closer')] },
  ] }],
  ...(withRules ? { ruleDefinitions: { version: 1, nodes: {
    gar_opener: { requires: [{ exact: true, includes: ['Attached'], specNodeId: 'house::garage' }], dependsOnSpec: null },
    gar_springs: { requires: [{ exact: true, includes: ['Attached'], specNodeId: 'house::garage' }], dependsOnSpec: null },
    ext_weatherstrip: { requires: null, dependsOnSpec: null },
    // A company's own rule (compiled into the frozen set at creation) — Ledrix's pack has no rule for this item.
    co_door_closer: { requires: [{ exact: true, includes: ['Attached'], specNodeId: 'house::garage' }], dependsOnSpec: null },
  } } } : {}),
});
async function run(modelUrl) {
  const M = await import(modelUrl + `?v=${Math.random()}`);
  // The rows the page draws (systems → tiles → rows), never the template tree each entry also carries.
  const ids = (t, extras) => M.buildScope(t, M.valueMapOf([]), { findings: () => 0, photos: () => 0 }, {}, { extras, inMain: true }).systems
    .flatMap(sy => (sy.tiles ?? []).flatMap(tl => (tl.rows ?? []).map(r => r.node?.id)));
  const has = (arr, id) => arr.includes(id);
  const out = []; const ok = (n, v) => out.push([n, !!v]);
  const none = ids(tpl(true), { garageType: '' }), att = ids(tpl(true), { garageType: 'Attached' }), det = ids(tpl(true), { garageType: 'Detached' });
  ok('a frozen rule hides the Garage Door items when Garage is Detached', !has(det, 'gar_opener') && !has(det, 'gar_springs'));
  ok('…shows them when Garage is Attached', has(att, 'gar_opener') && has(att, 'gar_springs'));
  ok('…and shows them while Garage is unanswered (Rule 2: an unanswered fact never hides)', has(none, 'gar_opener'));
  ok('a company rule the pack does not have is followed (the reason to read the job’s rules)', !has(det, 'co_door_closer') && has(att, 'co_door_closer'));
  ok('an item with no rule always shows (Weatherstripping)', has(none, 'ext_weatherstrip') && has(att, 'ext_weatherstrip'));
  const legacy = ids(tpl(false), { garageType: '' });
  ok('a job without a frozen rule set keeps the old behaviour (node rule over the pack)', has(legacy, 'ext_weatherstrip'));
  return out;
}
const MODEL = join(ROOT, 'lib/scope/model.ts');
const base = await run(pathToFileURL(MODEL).href);
let bad = 0; for (const [n, v] of base) { console.log(`  ${v ? '✓' : '✗'} ${n}`); if (!v) bad++; }
const src = readFileSync(MODEL, 'utf8');
const MUT = [
  ['    const node: ApplicabilityNode = frozenRules\n', '    const node: ApplicabilityNode = false\n', 'the job’s frozen rules are ignored (the bug)'],
  ["  const frozenDefs = (template as { ruleDefinitions?: { nodes?: unknown } } | null)?.ruleDefinitions?.nodes;", '  const frozenDefs = undefined as unknown;', 'the rule set is never read'],
];
console.log('mutations'); let caught = 0;
const tmp = mkdtempSync(join(tmpdir(), 'scope-rules-'));
try {
  cpSync(join(ROOT, 'lib/scope'), join(tmp, 'scope'), { recursive: true });
  for (const [a, b, why] of MUT) {
    if (src.split(a).length !== 2) { console.log(`  ✗ anchor not found once: ${why}`); bad++; continue; }
    const f = join(tmp, 'scope', 'model.ts'); writeFileSync(f, src.replace(a, b));
    const killed = (await run(pathToFileURL(f).href)).some(([, v]) => !v);
    console.log(`  ${killed ? '✓ caught' : '✗ NOT caught'}: ${why}`); if (killed) caught++; else bad++;
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`\n${bad ? '✗' : '✓'} verify-scope-job-rules: ${base.filter(([, v]) => v).length}/${base.length} checks, ${caught}/${MUT.length} mutations caught`);
process.exit(bad ? 1 : 0);
