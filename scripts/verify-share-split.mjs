#!/usr/bin/env node
// verify-share-split — the share page is split into files (2026-11-25, owner: "Is there a way to reduce the size of the
// share page file?" → "Yes"), and every guard reads it through scripts/lib/shareSource.mjs as one module.
//   1 every .tsx in app/share/[id]/ (not its sub-routes) is in SHARE_FILES — a file left out would hide from every guard
//   2 the joined module holds every file's code (each declaration line of each file appears in it)
//   3 the files only import each other by name ('./x') and end with plain export lines, the shape the join expects
//   4 no file is a new monolith: each under 900 lines
// Mutants: in-memory. Nothing on disk is edited.
import { readdirSync, readFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
import { SHARE_DIR, SHARE_FILES, joinShare } from './lib/shareSource.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const onDisk = readdirSync(join(ROOT, SHARE_DIR), { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.tsx')).map(e => e.name);
const FILES = Object.fromEntries(onDisk.map(f => [f, readFileSync(join(ROOT, SHARE_DIR, f), 'utf8')]));
function checks(list, files) {
  const out = []; const ok = (n, v) => out.push([n, !!v]);
  const names = Object.keys(files);
  ok('1 every file of the page is joined for the guards', names.every(f => list.includes(f)) && list.every(f => names.includes(f)));
  let joined = ''; try { joined = joinShare(files); } catch { joined = ''; }
  const decl = /^(?:export )?(?:async )?(?:function|const|let|type|interface) [A-Za-z_]/;
  ok('2 the joined module holds every declaration', !!joined && names.every(f => files[f].split('\n').filter(l => decl.test(l)).every(l => joined.includes(l))));
  ok('3 files import each other only by ./name, and export with plain lines', names.every(f => files[f].split('\n').every(l =>
    !/^import /.test(l) || !/from '\.\.?\/(?!\.\.\/)/.test(l) || /from '\.\/[A-Za-z]+';$/.test(l) || /from '\.\.\/\.\.\/\.\.\//.test(l))));
  ok('4 no file over 900 lines', names.every(f => files[f].split('\n').length <= 900));
  return out;
}
const base = checks(SHARE_FILES, FILES); let fail = 0;
for (const [n, v] of base) { console.log(`${v ? '✓' : '✗'} ${n}`); if (!v) fail++; }
const mutants = [
  ['a new file the guards never see', [...SHARE_FILES], { ...FILES, 'NewTab.tsx': 'const X = 1;\nexport { X };\n' }],
  ['a file dropped from the join list', SHARE_FILES.filter(f => f !== 'HomeTab.tsx'), FILES],
  ['a file imports a sibling by a path the join cannot see', SHARE_FILES, { ...FILES, 'HomeTab.tsx': "import { Icon } from '../[id]/ui';\n" + FILES['HomeTab.tsx'] }],
  ['a monolith grows back', SHARE_FILES, { ...FILES, 'ui.tsx': FILES['ui.tsx'] + '\n'.repeat(200) }],
];
let caught = 0;
for (const [label, list, files] of mutants) {
  const rows = checks(list, files);
  const dead = rows.some(r => !r[1]);
  console.log(`${dead ? '☠' : '!!'} mutant: ${label}`); if (dead) caught++;
}
console.log(`\n${base.length - fail}/${base.length} checks · ${caught}/${mutants.length} mutants caught`);
if (fail || caught !== mutants.length) process.exit(1);
