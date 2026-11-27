#!/usr/bin/env node
// verify-home-records — /api/home/records (h8 2b, owner 2026-11-27): the reports a signed-in homeowner holds, for the
// Ledrix Home app. Read as text: a token is required; who may read a tenure is decided by tenure_access called AS the
// person (their JWT), never by the server's own reasoning; findings and specs leave only through the published
// allow-list; share_token / inspector_id are never selected; statuses are read as the person (RLS).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'app/api/home/records/route.ts'), 'utf8');
function run(s) {
  const c = []; const ok = (n, v) => c.push([n, !!v]);
  ok('a token is required', /if \(!token \|\| token === ANON\) return fail\('Sign in first\.', 401\);/.test(s) && /if \(!who\?\.user\) return fail\('Sign in first\.', 401\);/.test(s));
  ok('the person’s client carries their JWT', /createClient\(SUPA_URL, ANON, \{ global: \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \}/.test(s));
  ok('who may read is tenure_access, asked AS the person', /await asPerson\.rpc\('tenure_access', \{ t, need: 'viewer', for_write: false \}\)/.test(s) && /if \(ok === true\) allowed\.add\(t\);/.test(s));
  ok('only allowed tenures’ reports are loaded', /\.filter\(\(l: any\) => allowed\.has\(String\(l\.tenure_id\)\)\)/.test(s));
  ok('findings and specs leave only through the allow-list', /findings: publishedFindings\(r\.anomalies\), specs: publishedSpecs\(r\.specs\)/.test(s));
  ok('share_token / inspector_id are never selected', !/share_token|inspector_id/.test(s.match(/const RECORD_FIELDS = '[^']*'/)?.[0] ?? 'share_token'));
  ok('statuses are read as the person (RLS)', /await asPerson\.from\('home_finding_status'\)/.test(s));
  return c;
}
const MUTANTS = [
  ['no sign-in needed', s => s.replace(`  if (!who?.user) return fail('Sign in first.', 401);\n`, '')],
  ['the server decides access', s => s.replace(`if (ok === true) allowed.add(t);`, `allowed.add(t);`)],
  ['raw findings sent', s => s.replace(`findings: publishedFindings(r.anomalies)`, `findings: r.anomalies`)],
  ['the edit token selected', s => s.replace(`const RECORD_FIELDS = 'share_id, `, `const RECORD_FIELDS = 'share_id, share_token, `)],
  ['statuses read by the server', s => s.replace(`await asPerson.from('home_finding_status')`, `await admin.from('home_finding_status')`)],
];
const base = run(SRC); let bad = 0;
for (const [n, v] of base) { console.log(`  ${v ? '✓' : '✗'} ${n}`); if (!v) bad++; }
let caught = 0;
for (const [n, f] of MUTANTS) { const m = f(SRC); if (m === SRC) { console.log(`  ✗ ${n}: anchor not found`); bad++; continue; } const k = run(m).some(([, v]) => !v); console.log(`  ${k ? '✓' : '✗'} ${n} ${k ? 'caught' : 'NOT caught'}`); if (k) caught++; else bad++; }
console.log(`\n${bad ? '✗' : '✓'} verify-home-records: ${base.filter(([, v]) => v).length}/${base.length} checks, ${caught}/${MUTANTS.length} mutations caught`);
process.exit(bad ? 1 : 0);
