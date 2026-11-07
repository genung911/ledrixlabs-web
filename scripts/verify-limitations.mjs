#!/usr/bin/env node
// verify-limitations — Limitations live inside each system (owner 2026-11-07: "should this be worked into the what inspect
// area? Below conditions section would be limitations?" → mockup https://claude.ai/artifact/FSTfPJUMmjGDVFqiqneD6o →
// "Approved" → "Build and push").
//   §1 executed  lib/templates/limitationModel.ts on Ledrix's default template and pack: which systems a gate reaches,
//                the rows a gate reads as, and the count beside each system
//   §2 wiring    the system screen shows its limitations under the groups, edits them in place (items shown for that
//                system), the systems list shows the count, the Limitations step is gone, Review lists them all once
// Mutations run on a COPY of the model in a temp dir, or on the source text in memory.
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let MODEL_DIR = null;   // where '@/lib/templates/limitationModel' resolves for the current run
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('@/')) {
      const rel = spec.slice(2);
      const base = rel === 'lib/templates/limitationModel' && MODEL_DIR ? join(MODEL_DIR, 'limitationModel.ts') : join(ROOT, /\.json$/.test(rel) ? rel : rel + '.ts');
      return next(pathToFileURL(base).href, ctx);
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url.endsWith('.json')) return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`, shortCircuit: true };
    return next(url, ctx);
  },
});
const read = p => readFileSync(join(ROOT, p), 'utf8');
const SRC = {
  model: read('lib/templates/limitationModel.ts'), gp: read('components/templates/GatesPanel.tsx'), ws: read('components/templates/Workspace.tsx'),
  tree: read('components/templates/Tree.tsx'), page: read('app/app/templates/[id]/page.tsx'),
};
const TPL = JSON.parse(read('lib/templates/baselines/ledrixDefault.json'));
let run = 0;
async function load(src) {
  const d = mkdtempSync(join(tmpdir(), 'limits-')); writeFileSync(join(d, 'limitationModel.ts'), src);
  // The model imports by '@/…'; the entry is imported through that alias so the temp copy is what runs.
  MODEL_DIR = d; run++;
  const entry = join(d, `entry${run}.mjs`); writeFileSync(entry, `export * from '@/lib/templates/limitationModel';\n`);
  return import(pathToFileURL(entry).href);
}

async function checks(src) {
  const out = {};
  let M; try { M = await load(src.model); } catch (e) { M = null; }
  if (!M) return { 'model loads': false };
  const gates = M.templateGates(TPL);
  const g = id => gates.find(x => x.id === id);
  const sys = TPL.systems;
  out['a gate reaches the systems of its row, its area and its items — a utility reaches each system it touches'] =
    M.systemsOfGate(g('attic_access'), sys).join('|') === 'attic'
    && M.systemsOfGate(g('crawlspace_access'), sys).join('|') === 'foundation'
    && M.systemsOfGate(g('panel_dead_front'), sys).join('|') === 'electrical'
    && ['plumbing', 'water_heater', 'cooling', 'appliances'].every(s => M.systemsOfGate(g('utility_water'), sys).includes(s))
    && !M.systemsOfGate(g('utility_water'), sys).includes('roofing')
    && M.systemsOfGate({ id: 'company_x', label: 'X', row: 'roof_method', origin: 'company', reasons: [] }, sys).join('|') === 'roofing';
  const rows = M.limitRows(g('utility_water'));
  out['reasons with the same effect read as one row; a row that changes nothing does not limit'] =
    rows.length === 1 && rows[0].reasons.length === 2 && rows[0].limits
    && M.limitRows(g('attic_access')).length === 3
    && M.limitRows(g('roof_method')).filter(r => !r.limits).length === 1;
  const c = M.limitCounts(TPL);
  out['the count beside a system: Attic 3, Roofing 4 (Walked changes nothing), Plumbing 1, Exterior none'] =
    c.get('attic') === 3 && c.get('roofing') === 4 && c.get('plumbing') === 1 && !c.has('exterior') && c.get('water_heater') === 3;
  const off = { ...TPL, gates: [{ id: 'attic_access', removed: true }] };
  out['a gate turned off for the template leaves the count'] = !M.limitCounts(off).has('attic');

  const strip = s => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  const ws = strip(src.ws), gp = strip(src.gp), tr = strip(src.tree), pg = strip(src.page);
  out['the system screen shows its limitations under the groups'] =
    /<ItemsPanel tree=\{tree\} system=\{system\}[^\n]*\/>\s*(?:\{\}\s*)?<SystemLimitations tree=\{tree\} system=\{system\} onOps=\{onOps\} disabled=\{disabled\} \/>\s*<\/Shell>/.test(ws)
    && /const mine = useMemo\(\(\) => gatesOfSystem\(gates, systems, system\.id\), \[gates, systems, system\.id\]\);/.test(gp);
  out['a row edits in place; its items are this system’s; a utility names the other systems; + Add offers this system’s rows'] =
    /\{isOpen && <GateEditor G=\{G\} gate=\{g\} systemId=\{system\.id\}/.test(gp)
    && /\.filter\(id => idx\.get\(id\) === systemId\)\.map\(id =>/.test(gp)
    && /\{g\.utility && others\.length > 0 && <span[^>]*>Utility · also \{others\.map\(sysName\)\.join\(', '\)\}<\/span>\}/.test(gp)
    && /visit\(\[system\], null\);/.test(gp);
  out['the systems list shows the count'] = /const limits = useMemo\(\(\) => limitCounts\(tree\), \[tree\]\);/.test(tr) && /\{itemCount\(s\)\}\{limits\.get\(s\.id\) \?/.test(tr);
  out['the Limitations step is gone (an old link opens What you inspect); Review lists them all once'] =
    !/\{ id: 'gates', label:/.test(pg) && !/section === 'gates'/.test(pg) && /s === 'counts' \|\| s === 'gates' \? 'systems'/.test(pg)
    && /<LimitationsList tree=\{tree\} onOpen=\{sid => \{ go\('systems', \{ systemId: sid, nodeId: null \}\);/.test(pg);
  return out;
}

let bad = 0, n = 0;
const res = await checks(SRC);
for (const [k, v] of Object.entries(res)) { n++; if (!v) { bad++; console.error(`  x ${k}`); } }
const rep = (k, a, b) => s => { if (!s[k].includes(a)) throw new Error(`anchor missing in ${k}: ${a.slice(0, 60)}`); s[k] = s[k].replace(a, b); };
const MUT = [
  ['items don’t place a gate', rep('model', '  (g.items ?? []).forEach(i => at(i.node));\n', '')],
  ['the row doesn’t place a gate', rep('model', '  at(g.row);\n', '')],
  ['every reason is its own row', rep('model', "const k = `${r.effect}|${r.effect === 'qualify' ? r.phrase ?? '' : ''}`;", 'const k = r.value;')],
  ['a row that changes nothing counts', rep('model', "limits: rs[0].effect !== 'none'", 'limits: true')],
  ['turned-off gates still count', rep('model', 'effectiveGates(LEDRIX_GATES, ownGates(tree))', 'effectiveGates(LEDRIX_GATES, [])')],
  ['the system screen drops them', rep('ws', '        <SystemLimitations tree={tree} system={system} onOps={onOps} disabled={disabled} />\n', '')],
  ['every gate in every system', rep('gp', 'const mine = useMemo(() => gatesOfSystem(gates, systems, system.id), [gates, systems, system.id]);', 'const mine = useMemo(() => gates, [gates, systems, system.id]);')],
  ['other systems’ items shown', rep('gp', '.filter(id => idx.get(id) === systemId).map(id =>', '.map(id =>')],
  ['+ Add offers every system', rep('gp', 'visit([system], null);', 'visit(systems, null);')],
  ['no count in the list', rep('tree', '{itemCount(s)}{limits.get(s.id) ?', '{itemCount(s)}{false ?')],
  ['the step comes back', rep('page', "  { id: 'report', label: 'Report',", "  { id: 'gates', label: 'Limitations', icon: '' },\n  { id: 'report', label: 'Report',")],
  ['Review drops the list', rep('page', '<LimitationsList tree={tree} onOpen=', '<div data-x=')],
];
let survived = 0;
for (const [name, fn] of MUT) { const s = { ...SRC }; fn(s); const r = await checks(s); if (Object.values(r).every(Boolean)) { survived++; console.error(`  x mutation survived: ${name}`); } }
console.log(`verify-limitations: ${n - bad}/${n} checks passed; ${MUT.length - survived}/${MUT.length} mutations caught`);
process.exit(bad || survived ? 1 : 0);
