#!/usr/bin/env node
// verify-manufactured-builder — the Template Builder side of the manufactured update (owner 2026-11-25, mockup
// Et7QWWPTN1UPWWjvcBPTGG, "Approved mock up"). The ops themselves are executed by the app's
// verify-manufactured-foundation; this checks they are REACHED:
//   1. a NEW template that includes Manufactured gets them (startingPoints.buildStarterTree)
//   2. ticking Manufactured on an existing template gets them with its checkpoints (HomeKinds applyAdd)
//   3. "Apply manufactured updates" shows only while something is missing, and applies them
//   4. each system shows "Manufactured home · n items" at the top (SpecialHomesBanner in ItemsPanel), only for checkpoints
//      the template holds for its own kinds
// Mutants: in-memory copies of the sources. Nothing on disk is edited.
import { readFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => readFileSync(join(ROOT, p), 'utf8');
const SRC = { sp: rd('lib/templates/startingPoints.ts'), hk: rd('components/templates/HomeKinds.tsx'), ep: rd('components/templates/EditorParts.tsx'), sh: rd('components/templates/SpecialHomesPanel.tsx') };
function checks(S) {
  const out = []; const ok = (n, v) => out.push([n, !!v]);
  ok('1 a new Manufactured template gets the extras', /if \(plan\.kinds\.includes\('manufactured'\)\) fields\.push\(\.\.\.manufacturedExtrasOps\(base\)\);/.test(S.sp)
    && S.sp.indexOf('manufacturedExtrasOps(base)') < S.sp.indexOf('const all = [...r.ops, ...fields];'));
  ok('2 ticking Manufactured adds the extras with its checkpoints', /const extras = pending\.added\.includes\('manufactured'\) \? manufacturedExtrasOps\(tree\) : \[\];/.test(S.hk)
    && S.hk.includes('onOps([...pending.fields, ...r.ops, ...extras])'));
  ok('3 Apply shows only for a Manufactured template with something missing', S.hk.includes("{!pending && now.includes('manufactured') && manufacturedExtrasOps(tree).length > 0 ? ("));
  ok('3 Apply applies the extras', S.hk.includes('onClick={() => onOps(manufacturedExtrasOps(tree))}>Apply manufactured updates</button>'));
  ok('4 the banner sits at the top of every system', /<div className="space-y-5 px-4 py-4">[\s\S]{0,200}<SpecialHomesBanner tree=\{tree\} system=\{system\}/.test(S.ep));
  ok('4 the banner lists only held checkpoints of the template\'s own kinds', S.sh.includes('specialRows(tree, system, source).filter(r => own.has(r.kind) && r.inTemplate)'));
  ok('4 the banner names the kind and count', S.sh.includes("manufactured: 'Manufactured home'") && S.sh.includes("{BANNER_NOUN[k.id]} · {mine.length} item{mine.length === 1 ? '' : 's'}"));
  return out;
}
const base = checks(SRC); let fail = 0;
for (const [n, v] of base) { console.log(`${v ? '✓' : '✗'} ${n}`); if (!v) fail++; }
const mut = (label, key, a, b) => ({ label, key, a, b });
const mutants = [
  mut('new templates skip the extras', 'sp', "  if (plan.kinds.includes('manufactured')) fields.push(...manufacturedExtrasOps(base));\n", ''),
  mut('extras on every new template', 'sp', "if (plan.kinds.includes('manufactured')) fields.push", 'if (true) fields.push'),
  mut('ticking Manufactured drops the extras', 'hk', 'onOps([...pending.fields, ...r.ops, ...extras])', 'onOps([...pending.fields, ...r.ops])'),
  mut('Apply always shown', 'hk', " && manufacturedExtrasOps(tree).length > 0 ? (", ' ? ('),
  mut('Apply on any template', 'hk', "{!pending && now.includes('manufactured') && ", '{!pending && '),
  mut('Apply does nothing', 'hk', 'onClick={() => onOps(manufacturedExtrasOps(tree))}', 'onClick={() => onOps([])}'),
  mut('banner removed', 'ep', '<SpecialHomesBanner tree={tree} system={system}', '<SpecialHomesPanel tree={tree} system={system}'),
  mut('banner lists offered (not held) checkpoints', 'sh', '&& r.inTemplate)', ')'),
  mut('banner shows every kind', 'sh', 'filter(r => own.has(r.kind) && r.inTemplate)', 'filter(r => r.inTemplate)'),
];
let caught = 0;
for (const m of mutants) {
  if (!SRC[m.key].includes(m.a)) { console.log(`!! anchor missing: ${m.label}`); continue; }
  const dead = checks({ ...SRC, [m.key]: SRC[m.key].replace(m.a, m.b) }).some(r => !r[1]);
  console.log(`${dead ? '☠' : '!!'} mutant: ${m.label}`); if (dead) caught++;
}
console.log(`\n${base.length - fail}/${base.length} checks · ${caught}/${mutants.length} mutants caught`);
if (fail || caught !== mutants.length) process.exit(1);
