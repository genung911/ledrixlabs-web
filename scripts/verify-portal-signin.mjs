#!/usr/bin/env node
// verify-portal-signin — the share page's email link returns to a CLEAN address (owner 2026-11-11, desktop loop).
//   §1 the link's return address is origin + path + query — never window.location.href, which carried a stale
//      `#error=…otp_expired…` into every new link, so the client read the old error and never the new sign-in
//   §2 after the client reads a link's fragment, a leftover auth fragment (tokens or an error) is cleared from the address
//   §M each rule, removed, fails a check (in memory; no file is edited)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(join(root, 'app/share/[id]/page.tsx'), 'utf8');
const flat = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

function suite(src) {
  const s = flat(src); const out = [];
  const check = (n, c) => out.push({ n, c: !!c });
  check('§1 the email link returns to origin + path + query',
    /const back = typeof window !== 'undefined' \? `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}\$\{window\.location\.search\}` : undefined;/.test(s)
    && /signInWithOtp\(\{ email: e, options: \{ emailRedirectTo: back \} \}\)/.test(s));
  check('§1 no sign-in link returns to the full address (with its fragment)', !/emailRedirectTo: [^}]*location\.href/.test(s));
  check('§2 a leftover auth fragment is cleared after the session is read',
    /access_token\|refresh_token\|error_code\|error_description\|error\)=/.test(s)
    && /window\.history\.replaceState\(null, '', `\$\{window\.location\.pathname\}\$\{window\.location\.search\}`\)/.test(s));
  return out;
}

let fail = 0;
for (const r of suite(PAGE)) { console.log(`  ${r.c ? '✓' : '✗'} ${r.n}`); if (!r.c) fail++; }
const MUT = [
  ['the link returns to the full address', 'emailRedirectTo: back }', 'emailRedirectTo: window.location.href }'],
  ['the fragment left in the address', "window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);", ''],
  ['an error fragment not recognised', '|error_code|error_description|error)=', ')='],
];
for (const [why, a, b] of MUT) {
  if (PAGE.split(a).length !== 2) { fail++; console.log(`  ✗ anchor present once: ${why}`); continue; }
  const caught = suite(PAGE.replace(a, b)).some(r => !r.c);
  console.log(`  ${caught ? '✓ caught' : '✗ NOT caught'}: ${why}`); if (!caught) fail++;
}
console.log(`\nverify-portal-signin: ${fail ? fail + ' failed' : 'all passed'}`);
process.exit(fail ? 1 : 0);
