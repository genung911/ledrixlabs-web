#!/usr/bin/env node
// verify-conflicts-web — "When two devices disagree" on the website (2026-11-03; ledrix-app SQL #97).
//   §1 lib/conflicts/rules.ts is byte-identical to the app's conflictRules.ts (one set of choices and words)
//   §2 settling: keep = resolve('original_server'); use the other = a versioned write under the edit lock, then
//      resolve('original_client'); the card shows only when something disagrees, above the findings
//   §3 mutations
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ?? join(ROOT, '..', 'ledrix-app');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const SRC = { api: read('lib/conflicts/api.ts'), card: read('components/workspace/ConflictsCard.tsx'), page: read('app/app/inspections/[id]/page.tsx') };
function suite(src) {
  const out = []; const ok = (n, c) => out.push({ n, c: !!c });
  if (existsSync(join(APP, 'src/core/services/conflictRules.ts'))) ok('§1 the rules are the app’s, byte for byte', read('lib/conflicts/rules.ts') === readFileSync(join(APP, 'src/core/services/conflictRules.ts'), 'utf8'));
  else if (!process.env.ALLOW_NO_APP) ok(`§1 ledrix-app found at ${APP}`, false);
  ok('§2 keep resolves to the saved value', /p_selected_source: 'original_server'/.test(src.api));
  ok('§2 use the other writes through the versioned path with the lock, then resolves to it',
    /sync_base_version: \(row as \{ row_version: number \}\)\.row_version, sync_device: webDevice\(\), lease_epoch: lease\.epoch/.test(src.api) && /p_selected_source: 'original_client'/.test(src.api)
    && /const lease = await lock\.ensure\(\); if \(!lease\) return; r = await useOther\(c, lease\);/.test(src.card));
  ok('§2 only the choices the rules allow', /\{ch\.useOther && <button/.test(src.card));
  ok('§2 shown only when something disagrees, on the inspection page', /if \(!rows\.length\) return null;/.test(src.card) && /<ConflictsCard inspectionId=\{id\} lock=\{lock\}/.test(src.page));
  return out;
}
let pass = 0, fail = 0;
const report = rs => rs.forEach(r => { if (r.c) { pass++; console.log(`  ✓ ${r.n}`); } else { fail++; console.log(`  ✗ ${r.n}`); } });
console.log('verify-conflicts-web'); report(suite(SRC));
console.log('\n§3 mutations');
const MUT = [
  ['use-the-other without the lock', 'card', 'const lease = await lock.ensure(); if (!lease) return; r = await useOther(c, lease);', 'r = await useOther(c, { epoch: 0 });', /^§2 use the other/],
  ['the base version not sent', 'api', 'sync_base_version: (row as { row_version: number }).row_version, ', '', /^§2 use the other/],
  ['use-the-other offered when it cannot land', 'card', '{ch.useOther && <button', '{<button', /^§2 only the choices/],
];
for (const [why, k, from, to, expect] of MUT) {
  if (SRC[k].split(from).length !== 2) { fail++; console.log(`  ✗ anchor not found once: ${why}`); continue; }
  const rs = suite({ ...SRC, [k]: SRC[k].replace(from, to) });
  if (rs.some(r => !r.c && expect.test(r.n))) { pass++; console.log(`  ✓ caught: ${why}`); } else { fail++; console.log(`  ✗ NOT caught: ${why}`); }
}
console.log(`\nverify-conflicts-web — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
