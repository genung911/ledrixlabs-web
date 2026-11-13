#!/usr/bin/env node
// verify-limitations — Limitations live inside each system (owner 2026-11-07: "should this be worked into the what inspect
// area? Below conditions section would be limitations?" → mockup https://claude.ai/artifact/FSTfPJUMmjGDVFqiqneD6o →
// "Approved" → "Build and push").
//   §1 executed  lib/templates/limitationModel.ts on Ledrix's default template and pack: which systems a gate reaches,
//                the rows a gate reads as, and the count beside each system
//                and (2026-11-07, one shape at every level, mockup CgiHJ5LqFQb4hAFSrAr3ox) which gates reach a group or an
//                item, and the Limitations row's count and line
//                and (2026-11-07, limitations back in Condition, mockup D55cNLEk1gM9B4cHbTtD1q) utilities counted once,
//                not per system; a system's row holds only its access situations
//   §2 wiring    (2026-11-07, back in Condition) an item's limitations open from Condition, beside Quick findings, with
//                back to Condition; groups have no row; a system has one only when an access situation reaches it;
//                Utilities sits at the top of the systems list and opens one screen. Before that: every system, group and item starts with a Limitations row that opens that part's own screen (edits in
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
  out['the count beside a system is its access situations: Attic 3, Roofing 4 (Walked changes nothing); Plumbing, Water Heater and Exterior none; the utilities count once (3)'] =
    c.get('attic') === 3 && c.get('roofing') === 4 && !c.has('plumbing') && !c.has('exterior') && !c.has('water_heater') && M.utilityCount(TPL) === 3
    && M.utilityGates(TPL).map(x => x.id).sort().join('|') === 'utility_gas|utility_power|utility_water'
    && M.accessGatesOfPart(gates, sys, 'roofing').map(x => x.id).join('|') === 'roof_method' && !M.accessGatesOfPart(gates, sys, 'plumbing').length;
  const P = (id) => M.gatesOfPart(gates, sys, id).map(x => x.id);
  out['a part is reached by a gate set inside it, or by one whose area holds it: Roofing, Covering and Asphalt Shingle get the roof method; Drainage does not; Fixtures gets Water off, Fuel · Gas does not'] =
    P('roofing').includes('roof_method') && P('roofing__covering').includes('roof_method') && P('roof_cov_asphalt').includes('roof_method')
    && !P('roofing__drainage').includes('roof_method') && P('plumbing__fixtures').includes('utility_water') && !P('plumbing__fuel_gas').includes('utility_water')
    && P('attic').includes('attic_access') && !P('exterior').length;
  const find = (ns, id) => { for (const n of ns) { if (n.id === id) return n; const r = find(n.children ?? [], id); if (r) return r; } return null; };
  const a = M.partLimitSummary(gates, sys, find(sys, 'roof_cov_asphalt')), dr = M.partLimitSummary(gates, sys, find(sys, 'roofing__drainage'));
  const fx = M.partLimitSummary(gates, sys, find(sys, 'plumbing__fixtures'));
  out['the Limitations row: Asphalt Shingle counts its own reason and the roof method (5) and names them; Drainage says None · tap to add; Fixtures leaves Water off to Utilities'] =
    a.count === 5 && a.line.startsWith('Not Accessed, ') && a.line.includes('Drone') && dr.count === 0 && dr.line === 'None · tap to add' && fx.count === 0;
  const off = { ...TPL, gates: [{ id: 'attic_access', removed: true }] };
  out['a gate turned off for the template leaves the count'] = !M.limitCounts(off).has('attic');

  const strip = s => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  const ws = strip(src.ws), gp = strip(src.gp), tr = strip(src.tree), pg = strip(src.page), ep = strip(src.ep);
  out['an item has no Limitations row; Condition (on) opens Quick findings and Limitations, each with back to Condition'] =
    !/<LimitationsRow tree=\{tree\} part=\{node\}/.test(ws)
    && /\{assessesCondition\(node\) && <div className="px-4 py-4">[\s\S]{0,200}<FacetRow title="Quick findings"[^\n]*onOpen=\{\(\) => setTab\('quickfindings'\)\} \/>\s*<FacetRow title="Limitations"[^\n]*onOpen=\{\(\) => setTab\('limitations'\)\} \/>/.test(ws)
    && /if \(tab === 'quickfindings'\) return facet\('quickfindings', <ComponentCondition node=\{node\} onOps=\{onOps\} disabled=\{disabled\} \/>, 'condition'\);/.test(ws)
    && /if \(tab === 'limitations'\) return facet\('limitations', <ItemLimitations tree=\{tree\} part=\{node\}[\s\S]{0,300}onOpenUtilities=\{\(\) => setTab\('utilities'\)\} \/>, 'condition'\);/.test(ws)
    && /onBack=\{back === 'overview' \? \{ label: node\.label, go: \(\) => setTab\('overview'\) \} : \{ label: TAB_LABEL\[back\], go: \(\) => setTab\(back\) \}\}/.test(ws);
  out['groups have no Limitations row; a system has one only when an access situation reaches it, and its screen lists only those'] =
    /<GroupDetails tree=\{tree\} system=\{system\} node=\{node\} onOps=\{onOps\} onOpen=\{open\} selected=\{sel\.nodeId\} disabled=\{disabled\} \/>/.test(ws)
    && /const hasAccess = accessGatesOfPart\(templateGates\(tree\), tree\.systems \?\? \[\], system\.id\)\.length > 0;/.test(ws)
    && /about=\{hasAccess \? <AboutRows><LimitationsRow tree=\{tree\} part=\{system\} onOpen=\{\(\) => setTab\('limitations'\)\} \/><\/AboutRows> : undefined\}/.test(ws)
    && /if \(tab === 'limitations'\) return \(\s*<Shell[^\n]*>\s*<PartLimitations tree=\{tree\} part=\{system\}/.test(ws)
    && /const mine = useMemo\(\(\) => accessGatesOfPart\(gates, systems, part\.id\), \[gates, systems, part\.id\]\);/.test(gp)
    && (ep.match(/\{about\}/g) ?? []).length === 2
    && /const \{ count, line \} = useMemo\(\(\) => partLimitSummary\(templateGates\(tree\), tree\.systems \?\? \[\], part\), \[tree, part\]\);/.test(gp);
  out['the system screen edits each situation in place with that system’s items; + Add offers rows inside it'] =
    /\{isOpen && <GateEditor G=\{G\} gate=\{g\} inPart=\{inPart\}/.test(gp)
    && /\.filter\(id => inPart\(id\)\)\.map\(id =>/.test(gp)
    && /count=\{g => G\.covered\(g\)\.filter\(n => inPart\(n\.id\)\)\.length\}/.test(gp)
    && /visit\(\[part\], parentNode\);/.test(gp);
  out['the item’s Limitations: its reasons, the TPR switch, and — read only — what limits it automatically, each opening where it is set'] =
    /<ChipList values=\{part\.limitations \?\? \[\]\}[\s\S]{0,200}onChange=\{v => onOps\(ops\.limitations\(part\.id, v\)\)\}/.test(gp)
    && /\{policy\}/.test(gp) && /policy=\{<EveryTypeOperates tree=\{tree\} system=\{system\} node=\{node\}/.test(ws)
    && /const auto = useMemo\(\(\) => gatesOfPart\(templateGates\(tree\), systems, part\.id\)/.test(gp)
    && /onClick=\{\(\) => \(g\.utility \? onOpenUtilities\(\) : sys && onOpenSystem\(sys\)\)\}/.test(gp)
    && /onOpenSystem=\{openSystemLimits\} onOpenUtilities=\{\(\) => setTab\('utilities'\)\}/.test(ws)
    && !/Limitation reasons/.test(ep);
  out['Utilities: one row at the top of the systems list opens one screen for Water, Gas and Power, with all their items'] =
    /const utilities = useMemo\(\(\) => utilityCount\(tree\), \[tree\]\);/.test(tr) && /<button onClick=\{onOpenUtilities\} aria-current=\{utilitiesOn/.test(tr)
    // 2026-11-12: Expected life sits beside Utilities; neither leaves a system highlighted.
    && /const on = sel\.systemId === s\.id && !utilitiesOn && !expectedLifeOn;/.test(tr)
    && /utilitiesOn=\{ctab === 'utilities'\} onOpenUtilities=\{\(\) => \{ setMode\('edit'\); setCtab\('utilities'\); \}\}/.test(pg)
    && /if \(tab === 'utilities'\) return \(\s*<Shell[^\n]*>\s*<UtilitiesPanel tree=\{tree\}/.test(ws)
    && /const utils = G\.gates\.filter\(g => g\.utility\);/.test(gp) && /utils\.map\(g => <UtilityCard key=\{g\.id\} G=\{G\} gate=\{g\}/.test(gp);
  // 2026-11-12 (owner, mockup 5ktKnZRzXM25jMS4wVXgQD "approved"): each utility is a one-line summary; opened, a drop-down per
  // reason, one sample report line in the report's own words, and the items as checkboxes by system (ticked = skipped).
  out['Utilities, cleaned up: a summary line; a drop-down per reason; the report\'s own line; items ticked by system; Rename/Reset/Turn off in ⋯'] =
    /const summary = !all\.length \? 'Nothing to skip in this template yet' : skips \? `Skips \$\{skipped\} of \$\{all\.length\}/.test(gp)
    && /onChange=\{e => G\.setReason\(g, i, \{ effect: e\.target\.value as GateEffect \}\)\}/.test(gp)
    && /\{gateLine\(\{ gate: g, reason: sample, cause: sample\.value \}/.test(gp)
    && /<input type="checkbox" checked=\{inNow\.has\(n\.id\)\} disabled=\{disabled\} onChange=\{\(\) => G\.toggleItem\(g, n\.id\)\} \/>/.test(gp)
    && /const sys = displayLabel\(f\.path\[0\] \?\? f\.node\.label\);/.test(gp)
    && /label: 'Rename in the report'/.test(gp) && /label: 'Reset to Ledrix', onSelect: \(\) => \{ G\.reset\(g\.id\); \}/.test(gp) && /label: 'Turn off for this template', onSelect: \(\) => \{ G\.turnOff\(g\.id\); \}/.test(gp);
  out['the systems list shows the count'] = /const limits = useMemo\(\(\) => limitCounts\(tree\), \[tree\]\);/.test(tr) && /\{itemCount\(s\)\}\{limits\.get\(s\.id\) \?/.test(tr);
  out['the Limitations step is gone (an old link opens What you inspect); Review lists them all once and opens a system’s, or Utilities'] =
    !/\{ id: 'gates', label:/.test(pg) && !/section === 'gates'/.test(pg) && /s === 'counts' \|\| s === 'gates' \? 'systems'/.test(pg)
    && /<LimitationsList tree=\{tree\} onOpen=\{\(sid, util\) => go\('systems', \{ systemId: sid, nodeId: null \}, util \? 'utilities' : 'limitations'\)\} \/>/.test(pg)
    && /onClick=\{\(\) => onOpen\(ins\[0\], !!g\.utility\)\}/.test(gp);
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
  ['utilities counted in every system', rep('model', '    if (g.utility) continue;\n', '')],
  ['the row summary counts utilities', rep('model', 'const reach = gatesOfPart(gates, systems, part.id).filter(g => !g.utility);', 'const reach = gatesOfPart(gates, systems, part.id);')],
  ['access includes utilities', rep('model', 'gatesOfPart(gates, systems, partId).filter(g => !g.utility);', 'gatesOfPart(gates, systems, partId);')],
  ['the Utilities count is empty', rep('model', 'limitRows(g).filter(r => r.limits).length, 0)', '0, 0)')],
  ['the item row comes back', rep('ws', '<FacetRow title="Condition" line={assessesCondition(node) ?', "<LimitationsRow tree={tree} part={node} onOpen={() => setTab('limitations')} />\n          <FacetRow title=\"Condition\" line={assessesCondition(node) ?")],
  ['Condition has no Limitations row', rep('ws', '<FacetRow title="Limitations" line={ownLimits', '<FacetRow title="Reasons" line={ownLimits')],
  ['Quick findings opens nothing', rep('ws', "onOpen={() => setTab('quickfindings')}", 'onOpen={() => {}}')],
  ['the item’s Limitations go back to the item', rep('ws', "onOpenUtilities={() => setTab('utilities')} />, 'condition');", "onOpenUtilities={() => setTab('utilities')} />);")],
  ['a group gets its row back', rep('ws', 'selected={sel.nodeId} disabled={disabled} />', "selected={sel.nodeId} disabled={disabled} about={<AboutRows><LimitationsRow tree={tree} part={node} onOpen={() => setTab('limitations')} /></AboutRows>} />")],
  ['every system gets the row', rep('ws', 'about={hasAccess ?', 'about={true ?')],
  ['the system row opens nothing', rep('ws', "if (tab === 'limitations') return (", "if (tab === 'nope') return (")],
  ['a system lists utilities too', rep('gp', 'const mine = useMemo(() => accessGatesOfPart(gates, systems, part.id), [gates, systems, part.id]);', 'const mine = useMemo(() => gatesOfPart(gates, systems, part.id), [gates, systems, part.id]);')],
  ['other parts’ items shown', rep('gp', '.filter(id => inPart(id)).map(id =>', '.map(id =>')],
  ['+ Add offers everything', rep('gp', 'visit([part], parentNode);', 'visit(systems, null);')],
  ['the item’s reasons are not saved', rep('gp', 'onChange={v => onOps(ops.limitations(part.id, v))}', 'onChange={() => {}}')],
  ['the TPR switch leaves', rep('ws', 'policy={<EveryTypeOperates', 'x={<EveryTypeOperates')],
  ['what limits it automatically opens nothing', rep('gp', 'onClick={() => (g.utility ? onOpenUtilities() : sys && onOpenSystem(sys))}', 'onClick={() => {}}')],
  ['no Utilities row', rep('tree', '<button onClick={onOpenUtilities}', '<button onClick={() => {}}')],
  ['a system stays highlighted on Utilities', rep('tree', 'const on = sel.systemId === s.id && !utilitiesOn && !expectedLifeOn;', 'const on = sel.systemId === s.id && !expectedLifeOn;')],
  ['the page never opens Utilities', rep('page', "setMode('edit'); setCtab('utilities'); }}", "setMode('edit'); }}")],
  ['no Utilities screen', rep('ws', "if (tab === 'utilities') return (", "if (tab === 'nope2') return (")],
  ['Utilities shows no cards', rep('gp', 'utils.map(g => <UtilityCard key={g.id} G={G} gate={g}', 'utils.slice(0, 0).map(g => <UtilityCard key={g.id} G={G} gate={g}')],
  ['an item\'s checkbox does nothing', rep('gp', 'onChange={() => G.toggleItem(g, n.id)} />', 'onChange={() => {}} />')],
  ['a reason\'s drop-down does nothing', rep('gp', 'onChange={e => G.setReason(g, i, { effect: e.target.value as GateEffect })}', 'onChange={() => {}}')],
  ['the report line is made up, not the report\'s', rep('gp', '{gateLine({ gate: g, reason: sample, cause: sample.value }', '{String({ gate: g, reason: sample, cause: sample.value }')],
  ['items are not grouped by their system', rep('gp', 'const sys = displayLabel(f.path[0] ?? f.node.label);', 'const sys = displayLabel(f.node.label);')],
  ['Reset does nothing', rep('gp', "label: 'Reset to Ledrix', onSelect: () => { G.reset(g.id); }", "label: 'Reset to Ledrix', onSelect: () => { }")],
  ['no count in the list', rep('tree', '{itemCount(s)}{limits.get(s.id) ?', '{itemCount(s)}{false ?')],
  ['the step comes back', rep('page', "  { id: 'report', label: 'Report',", "  { id: 'gates', label: 'Limitations', icon: '' },\n  { id: 'report', label: 'Report',")],
  ['Review drops the list', rep('page', '<LimitationsList tree={tree} onOpen=', '<div data-x=')],
  ['Review opens a system for a utility', rep('page', "util ? 'utilities' : 'limitations'", "'limitations'")],
];
let survived = 0;
for (const [name, fn] of MUT) { const s = { ...SRC }; fn(s); const r = await checks(s); if (Object.values(r).every(Boolean)) { survived++; console.error(`  x mutation survived: ${name}`); } }
console.log(`verify-limitations: ${n - bad}/${n} checks passed; ${MUT.length - survived}/${MUT.length} mutations caught`);
process.exit(bad || survived ? 1 : 0);
