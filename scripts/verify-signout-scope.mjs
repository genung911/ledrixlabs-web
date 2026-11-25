#!/usr/bin/env node
// verify-signout-scope — signing out on the website ends THIS browser's session only (owner 2026-11-24: "I'm not able to
// sync" — a website sign-out at 8:48 PM ended the phone's session too; Supabase's signOut() defaults to scope 'global').
// Every signOut( in app/, components/ and lib/ must pass { scope: 'local' }. Mutants change an in-memory copy.
import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === 'prototype' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(tsx?|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []);
const files = ['app', 'components', 'lib'].flatMap(d => walk(path.join(root, d)));
const SRC = Object.fromEntries(files.map(f => [path.relative(root, f), fs.readFileSync(f, 'utf8')]));
function checks(S) {
  const out = []; const ok = (n, v) => out.push([n, !!v]);
  const calls = Object.entries(S).flatMap(([f, s]) => [...s.matchAll(/auth\.signOut\(([^)]*)\)/g)].map(m => [f, m[1]]));
  const bad = calls.filter(([, a]) => !/scope:\s*'local'/.test(a));
  ok(`every sign-out is this device only (${calls.length} found)${bad.length ? ' — global: ' + bad.map(b => b[0]).join(', ') : ''}`, calls.length >= 2 && !bad.length);
  return out;
}
const MUT = [
  ['components/workspace/WorkspaceShell.tsx', "workspace.auth.signOut({ scope: 'local' })", 'workspace.auth.signOut()', 'the workspace signs out every device'],
  ['app/share/[id]/page.tsx', "supabase.auth.signOut({ scope: 'local' })", 'supabase.auth.signOut()', 'the share page signs out every device'],
];
const base = checks(SRC); let bad = 0;
for (const [n, v] of base) { console.log(`  ${v ? '✓' : '✗'} ${n}`); if (!v) bad++; }
console.log('mutations'); let caught = 0;
for (const [f, a, b, why] of MUT) {
  if ((SRC[f] ?? '').split(a).length !== 2) { console.log(`  ✗ anchor not found once: ${why}`); bad++; continue; }
  const killed = checks({ ...SRC, [f]: SRC[f].replace(a, b) }).some(([, v]) => !v);
  console.log(`  ${killed ? '✓ caught' : '✗ NOT caught'}: ${why}`); if (killed) caught++; else bad++;
}
console.log(`\n${bad ? '✗' : '✓'} verify-signout-scope: ${base.filter(([, v]) => v).length}/${base.length} checks, ${caught}/${MUT.length} mutations caught`);
process.exit(bad ? 1 : 0);
