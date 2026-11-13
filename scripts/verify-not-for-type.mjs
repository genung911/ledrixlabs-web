#!/usr/bin/env node
// ─── Guard: "Not for <type>" on a type's list (owner 2026-11-12: "Window unit in cooling should not carry the thermostat
// and distribution from heating" → "Yes for not for windows/wall") ─────────────────────────────────────────────────
// Static checks on TypeBuilder.tsx and ItemRow.tsx, each proved by an in-memory mutation:
//   1. the ⋯ action writes the SAME validated rule as the grid's untick (typeRuleOps), with that type removed
//   2. it is offered only on a type's list (not the grid), not on the type question, and not when it is the only type
//   3. an item shown from another section (Thermostat, a link) gets the menu too
//   node scripts/verify-not-for-type.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const TB = readFileSync(join(repo, 'components/templates/TypeBuilder.tsx'), 'utf8');
const IR = readFileSync(join(repo, 'components/templates/ItemRow.tsx'), 'utf8');

function checks(tb, ir) {
  const out = []; const ok = (n, c) => out.push({ n, c: !!c });
  ok('1 the action removes this type through typeRuleOps', tb.includes('const r = typeRuleOps(tree, layout, g ? g.items.map(i => i.id) : [n.id], cur.filter(v => v !== pick)); if (!r.ok) { setMsg(r.reason); return; } apply(r.ops);'));
  ok('2 only on a type\'s list, not the type question, not the last type', tb.includes('if (pick === GRID || n.id === layout.question.nodeId) return undefined;')
    && tb.includes('if (!cur.includes(pick)) return undefined;') && tb.includes("cur.length === 1 ? `It shows only for ${pick}; switch it off instead.`"));
  ok('2 every row on the list gets it', tb.includes('tag={tag} more={notFor(n)} />'));
  ok('3 a linked item gets the menu too', ir.includes('{node.pointsTo ? (more?.length ? <Menu label={`More for ${node.label}`} items={more} /> : <span className="w-8 flex-none" aria-hidden />) : (')
    && ir.includes('...(more ?? []),'));
  return out;
}
let fail = 0;
for (const x of checks(TB, IR)) { console.log(`  ${x.c ? '✓' : '✗'} ${x.n}`); if (!x.c) fail++; }
console.log('\nmutations');
const MUT = [
  ['tb', 'the type is not removed', 'cur.filter(v => v !== pick)); if (!r.ok)', 'cur); if (!r.ok)'],
  ['tb', 'offered on the grid', 'if (pick === GRID || n.id === layout.question.nodeId) return undefined;', 'if (n.id === layout.question.nodeId) return undefined;'],
  ['ir', 'a link has no menu', '(more?.length ? <Menu label={`More for ${node.label}`} items={more} /> : <span className="w-8 flex-none" aria-hidden />)', '<span className="w-8 flex-none" aria-hidden />'],
];
for (const [k, why, a, b] of MUT) {
  const src = k === 'tb' ? TB : IR;
  if (src.split(a).length !== 2) { fail++; console.log(`  ✗ anchor present once: ${why}`); continue; }
  const caught = checks(k === 'tb' ? TB.replace(a, b) : TB, k === 'ir' ? IR.replace(a, b) : IR).some(x => !x.c);
  console.log(`  ${caught ? '✓ caught' : '✗ NOT caught'}: ${why}`); if (!caught) fail++;
}
console.log(`\nverify-not-for-type: ${fail ? fail + ' failed' : 'all passed'}`);
process.exit(fail ? 1 : 0);
