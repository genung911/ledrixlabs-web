#!/usr/bin/env node
// verify-limitations — Limitations live inside each system (owner 2026-11-07: "should this be worked into the what inspect
// area? Below conditions section would be limitations?" → mockup https://claude.ai/artifact/FSTfPJUMmjGDVFqiqneD6o →
// "Approved" → "Build and push").
//   §1 executed  lib/templates/limitationModel.ts on Ledrix's default template and pack: which systems a gate reaches,
//                the rows a gate reads as, and the count beside each system
//                and (2026-11-07, one shape at every level, mockup CgiHJ5LqFQb4hAFSrAr3ox) which gates reach a group or an
//                item, and the Limitations row's count and line
//   §2 wiring    every system, group and item starts with a Limitations row that opens that part's own screen (edits in
//                place, items shown for that part, an item's own reasons, the TPR switch with its reason), the systems
//                list shows the count, the Limitations step is gone, Review lists them all once and opens them
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
  tree: read('components/templates/Tree.tsx'), page: read('app/app/templates/[id]/page.tsx'), ep: read('components/templates/EditorParts.tsx'),
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
  const P = (id) => M.gatesOfPart(gates, sys, id).map(x => x.id);
  out['a part is reached by a gate set inside it, or by one whose area holds it: Roofing, Covering and Asphalt Shingle get the roof method; Drainage does not; Fixtures gets Water off, Fuel · Gas does not'] =
    P('roofing').includes('roof_method') && P('roofing__covering').includes('roof_method') && P('roof_cov_asphalt').includes('roof_method')
    && !P('roofing__drainage').includes('roof_method') && P('plumbing__fixtures').includes('utility_water') && !P('plumbing__fuel_gas').includes('utility_water')
    && P('attic').includes('attic_access') && !P('exterior').length;
  const find = (ns, id) => { for (const n of ns) { if (n.id === id) return n; const r = find(n.children ?? [], id); if (r) return r; } return null; };
  const a = M.partLimitSummary(gates, sys, find(sys, 'roof_cov_asphalt')), dr = M.partLimitSummary(gates, sys, find(sys, 'roofing__drainage'));
  out['the Limitations row: Asphalt Shingle counts its own reason and the roof method (5) and names them; Drainage says None · tap to add'] =
    a.count === 5 && a.line.startsWith('Not Accessed, ') && a.line.includes('Drone') && dr.count === 0 && dr.line === 'None · tap to add';
  const off = { ...TPL, gates: [{ id: 'attic_access', removed: true }] };
  out['a gate turned off for the template leaves the count'] = !M.limitCounts(off).has('attic');

  const strip = s => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  const ws = strip(src.ws), gp = strip(src.gp), tr = strip(src.tree), pg = strip(src.page), ep = strip(src.ep);
  out['a system, a group and an item each start with a Limitations row that opens that part’s own Limitations screen'] =
    /about=\{<AboutRows><LimitationsRow tree=\{tree\} part=\{system\} onOpen=\{\(\) => setTab\('limitations'\)\} \/><\/AboutRows>\}/.test(ws)
    && /about=\{<AboutRows><LimitationsRow tree=\{tree\} part=\{node\} onOpen=\{\(\) => setTab\('limitations'\)\} \/><\/AboutRows>\}/.test(ws)
    && /<AboutRows>\s*<LimitationsRow tree=\{tree\} part=\{node\} onOpen=\{\(\) => setTab\('limitations'\)\} \/>\s*<FacetRow title="Condition"/.test(ws)
    && /if \(tab === 'limitations'\) return limitsScreen\(system, system\.label\);/.test(ws)
    && /if \(tab === 'limitations'\) return limitsScreen\(node, `\$\{path\} › \$\{node\.label\}`\);/.test(ws)
    && /<PartLimitations tree=\{tree\} system=\{system\} part=\{part\}/.test(ws)
    && /\{about\}/.test(ep) && (ep.match(/\{about\}/g) ?? []).length === 2
    && /const mine = useMemo\(\(\) => gatesOfPart\(gates, systems, part\.id\), \[gates, systems, part\.id\]\);/.test(gp)
    && /const \{ count, line \} = useMemo\(\(\) => partLimitSummary\(templateGates\(tree\), tree\.systems \?\? \[\], part\), \[tree, part\]\);/.test(gp);
  out['the screen: an item’s own reasons first, each situation edited in place with this part’s items, a utility names the other systems, + Add offers rows inside this part'] =
    /\{isItem && \([\s\S]{0,200}<ChipList values=\{part\.limitations \?\? \[\]\}[\s\S]{0,200}onChange=\{v => onOps\(ops\.limitations\(part\.id, v\)\)\}/.test(gp)
    && /\{isOpen && <GateEditor G=\{G\} gate=\{g\} inPart=\{inPart\}/.test(gp)
    && /\.filter\(id => inPart\(id\)\)\.map\(id =>/.test(gp)
    && /Utility · also \$\{others\.map\(sysName\)\.join\(', '\)\}/.test(gp)
    && /visit\(\[part\], parentNode\);/.test(gp)
    && !/Limitation reasons/.test(ep);
  out['the TPR “we operate it” switch sits on the item’s Limitations screen'] =
    /if \(tab === 'limitations'\) return limitsScreen\(node, `\$\{path\} › \$\{node\.label\}`, <EveryTypeOperates tree=\{tree\} system=\{system\} node=\{node\}/.test(ws) && /\{policy\}/.test(gp);
  out['the systems list shows the count'] = /const limits = useMemo\(\(\) => limitCounts\(tree\), \[tree\]\);/.test(tr) && /\{itemCount\(s\)\}\{limits\.get\(s\.id\) \?/.test(tr);
  out['the Limitations step is gone (an old link opens What you inspect); Review lists them all once'] =
    !/\{ id: 'gates', label:/.test(pg) && !/section === 'gates'/.test(pg) && /s === 'counts' \|\| s === 'gates' \? 'systems'/.test(pg)
    && /<LimitationsList tree=\{tree\} onOpen=\{sid => go\('systems', \{ systemId: sid, nodeId: null \}, 'limitations'\)\} \/>/.test(pg);
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
  ['an area doesn’t reach what sits in it', rep('model', "  return (g.area ?? []).some(a => up.has(baseOf(a)));", '  return false;')],
  ['a gate set inside a part doesn’t reach it', rep('model', '  if (touched.some(t => ancestorsOf(t, parents).includes(partId))) return true;', '')],
  ['an item’s own reasons don’t count', rep('model', '  count += own.length;\n', '')],
  ['no row on the system', rep('ws', "about={<AboutRows><LimitationsRow tree={tree} part={system} onOpen={() => setTab('limitations')} /></AboutRows>}", '')],
  ['no row on a group', rep('ws', "about={<AboutRows><LimitationsRow tree={tree} part={node} onOpen={() => setTab('limitations')} /></AboutRows>}", '')],
  ['the system row opens nothing', rep('ws', "if (tab === 'limitations') return limitsScreen(system, system.label);", '')],
  ['every gate on every part', rep('gp', 'const mine = useMemo(() => gatesOfPart(gates, systems, part.id), [gates, systems, part.id]);', 'const mine = useMemo(() => gates, [gates, systems, part.id]);')],
  ['other parts’ items shown', rep('gp', '.filter(id => inPart(id)).map(id =>', '.map(id =>')],
  ['+ Add offers everything', rep('gp', 'visit([part], parentNode);', 'visit(systems, null);')],
  ['the item’s reasons are not on its screen', rep('gp', 'onChange={v => onOps(ops.limitations(part.id, v))}', 'onChange={() => {}}')],
  ['the TPR switch leaves', rep('ws', ', <EveryTypeOperates tree={tree} system={system} node={node} onOps={onOps} disabled={disabled} />);', ');')],
  ['no count in the list', rep('tree', '{itemCount(s)}{limits.get(s.id) ?', '{itemCount(s)}{false ?')],
  ['the step comes back', rep('page', "  { id: 'report', label: 'Report',", "  { id: 'gates', label: 'Limitations', icon: '' },\n  { id: 'report', label: 'Report',")],
  ['Review drops the list', rep('page', '<LimitationsList tree={tree} onOpen=', '<div data-x=')],
  ['Review opens the system, not its Limitations', rep('page', "nodeId: null }, 'limitations')} />", "nodeId: null })} />")],
];
let survived = 0;
for (const [name, fn] of MUT) { const s = { ...SRC }; fn(s); const r = await checks(s); if (Object.values(r).every(Boolean)) { survived++; console.error(`  x mutation survived: ${name}`); } }
console.log(`verify-limitations: ${n - bad}/${n} checks passed; ${MUT.length - survived}/${MUT.length} mutations caught`);
process.exit(bad || survived ? 1 : 0);
