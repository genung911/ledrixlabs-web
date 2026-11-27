#!/usr/bin/env node
// verify-share-account — the Home Record's account button (owner 2026-11-26, mockup QGBCS3JhtN4vhxVSuA1b1b option A,
// "Approved"): initials at the top right for anyone signed in; a menu with who they are, this home and where it stands,
// the Ledrix Home app, and a Sign out that ASKS FIRST. And the page's own logo is white (logo option D). `--mutate` proves it.
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const real = { ui: read('app/share/[id]/ui.tsx') + '\n' + read('app/share/[id]/Account.tsx'), page: read('app/share/[id]/page.tsx') };
function checks({ ui: U, page: P }) {
  const out = []; const ok = (n, c) => out.push([n, !!c]);
  ok('signed in → the account button (not the old sign-out pill)', U.includes('{signedIn && <AccountButton account={account} address={address} onSignOut={onSignOut} />}') && !U.includes('title="Signed in to Ledrix — tap to sign out"'));
  ok('the button shows for anyone signed in, subscribed or not', P.includes('signedIn={!!session} onSignOut='));
  ok('the menu: name and email, this home and where it stands, the Ledrix Home app, Sign out', U.includes('{email ?? \'Signed in\'}') && U.includes("{(account?.status === 'yours' && sinceText(account.since)) || STATUS_TEXT[account?.status ?? 'not_yet']}")
    && U.includes('href="/home"') && U.includes("onClick={() => { setOpen(false); setConfirm(true); }}"));
  ok('where it stands comes from the claim: on your account / waiting for closing / not claimed yet', P.includes("status: holds ? 'yours' : buying ? 'waiting' : 'not_yet'"));
  ok('"Yours since …" from my_claim_state (#156), only for a holder; "On your account" until it is known', P.includes("setSince(st0.data.since ?? null)") && P.includes("setSince(st1.data.since ?? null)")
    && P.includes("since: holds ? since : null }} />") && U.includes("`Yours since ${new Date(t).toLocaleDateString('en-US'"));
  ok('Sign out asks first, and only its confirm signs out', U.includes('aria-label="Sign out?"') && U.includes('onClick={() => { setConfirm(false); onSignOut?.(); }}') && (U.match(/onSignOut\?\.\(\)/g) ?? []).length === 1);
  ok('the menu closes on a click away and on Escape', U.includes("if (e.key === 'Escape') setOpen(false);") && U.includes("document.addEventListener('mousedown', away)"));
  ok('the Home Record logo is white, not the blue sheen', U.includes('<ValDeltaSVG size={Math.round(size * 0.82)} color="#FFFFFF" />'));
  // h7 (owner 2026-11-27, Ledrix Home mockup RGxzKqE49fQukzkbksoPzC screen 1): Get Ledrix Home, only once the home is theirs.
  ok('Get Ledrix Home shows only to the person who holds the home', P.includes(': holds ? <GetAppCard email={session?.user?.email ?? null} /> : undefined} />}'));
  ok('…with no App Store link until there is one', U.includes('export const HOME_APP_STORE_URL: string | null = null;') && U.includes('{HOME_APP_STORE_URL\n        ? <a href={HOME_APP_STORE_URL}') && U.includes('Coming to the App Store'));
  ok('…and never a word about sensors (not made yet)', !/sensor|pod\b/i.test(U.slice(U.indexOf('export function GetAppCard'))));
  return out;
}
const MUTS = [
  ['the old one-tap sign-out pill comes back', 'ui', '{signedIn && <AccountButton account={account} address={address} onSignOut={onSignOut} />}', '{signedIn && <button onClick={onSignOut} title="Signed in to Ledrix — tap to sign out" />}'],
  ['Sign out in the menu signs out at once', 'ui', "onClick={() => { setOpen(false); setConfirm(true); }}", "onClick={() => { setOpen(false); onSignOut?.(); }}"],
  ['an unsubscribed homeowner loses the button', 'page', 'signedIn={!!session} onSignOut=', 'signedIn={access} onSignOut='],
  ['a buyer reads as not claimed', 'page', "buying ? 'waiting' : 'not_yet'", "'not_yet'"],
  ['the date shown to someone who doesn\'t hold the home', 'page', 'since: holds ? since : null }} />', 'since }} />'],
  ['the date never read on the second check', 'page', 'setSince(st1.data.since ?? null); ', ''],
  ['Escape no longer closes it', 'ui', "if (e.key === 'Escape') setOpen(false);", ''],
  ['the logo goes blue again', 'ui', 'color="#FFFFFF" />\n', 'color={BLUE} sheen />\n'],
  ['the app card for anyone signed in', 'page', ': holds ? <GetAppCard email={session?.user?.email ?? null} /> : undefined} />}', ': <GetAppCard email={session?.user?.email ?? null} />} />}'],
  ['a dead App Store link', 'ui', 'export const HOME_APP_STORE_URL: string | null = null;', "export const HOME_APP_STORE_URL: string | null = 'https://apps.apple.com/';"],
  ['the card mentions sensors', 'ui', '<br />· Your inspection kept as the first snapshot of your home', '<br />· Sensors in the attic and walls'],
];
let fail = 0;
for (const [n, v] of checks(real)) { console.log(`${v ? '✓' : '✗'} ${n}`); if (!v) fail++; }
if (process.argv.includes('--mutate')) {
  let caught = 0;
  for (const [why, f, a, b] of MUTS) {
    if (real[f].split(a).length !== 2) { console.log(`✗ anchor present once: ${why}`); fail++; continue; }
    const hit = checks({ ...real, [f]: real[f].replace(a, b) }).some(([, v]) => !v);
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  console.log(`${caught}/${MUTS.length} mutations caught`);
}
console.log(`\nverify-share-account — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
