#!/usr/bin/env node
// verify-logo-black — the Ledrix logo is the current delta, BLACK on light and WHITE on dark (owner 2026-11-26, logo
// option D). Ledrix blue stays the accent and the Ledrix Intelligence orb; the logo itself is never blue. Reads the website
// and the app (LEDRIX_APP). `--mutate` proves each check can fail (in memory).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const APP = process.env.LEDRIX_APP || '../ledrix-app';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const readApp = (f) => readFileSync(`${APP}/${f}`, 'utf8');
const sha = (f) => createHash('sha256').update(readFileSync(`${APP}/${f}`)).digest('hex');
const BRAND = ['app/page.tsx', 'components/marketing/VisionManifesto.tsx', 'components/marketing/Navbar.tsx', 'components/marketing/Footer.tsx',
  'app/terms/page.tsx', 'app/privacy/page.tsx', 'app/home/page.tsx', 'components/workspace/WorkspaceShell.tsx', 'app/app/login/page.tsx'];
const real = { delta: read('components/LedrixDelta.tsx'), icon: read('app/icon.svg'), og: read('app/opengraph-image.tsx'), nav: read('components/marketing/Navbar.tsx'),
  brand: BRAND.map(read).join('\n'), login: readApp('src/app/LoginScreen.tsx'), signup: readApp('src/app/SignupScreen.tsx'),
  appIcon: sha('assets/icon_1.png'), splash: sha('assets/splash.png') };
const ICON = '414113dcaf72f313fa301d3b80d263a7f6771b5e885837d8b1e0a86f78aef968', SPLASH = '26e503cd8667424776cded63d0740aa9a5ea6188771e79f3d92e304fca17ee0b';
function checks(S) {
  const out = []; const ok = (n, c) => out.push([n, !!c]);
  ok('the logo takes the text colour around it (black on light, white on dark)', S.delta.includes("color = 'currentColor',"));
  ok('no logo on the website wears the blue sheen', !/<LedrixDelta[^>]*\ssheen[\s/>]/.test(S.brand));
  ok('the menu bar logo follows its wordmark: ink when the bar is light, white over the dark hero', S.nav.includes("group-hover:scale-110 ${inkChrome ? 'text-ink' : 'text-white'}"));
  ok('the browser-tab icon: a white delta on a near-black tile', S.icon.includes('<rect width="100" height="100" rx="22" fill="#111214"/>') && S.icon.includes('fill="#FFFFFF" fill-rule="evenodd"') && !S.icon.includes('#217BE8'));
  ok('the link-share image: the real delta in white, no blue', S.og.includes('fill="#FFFFFF" fillRule="evenodd"') && !S.og.includes('#217BE8') && !S.og.includes('borderBottom'));
  ok('the phone\'s sign-in and sign-up screens: white delta and wordmark', [S.login, S.signup].every(s => s.includes('<ValDelta size={38} color="#FFFFFF" />') && s.includes('<LedrixWordmark size={52} color="#FFFFFF" />')));
  ok('the app icon and launch screen are the black-tile files', S.appIcon === ICON && S.splash === SPLASH);
  return out;
}
const MUTS = [
  ['the logo goes back to blue', 'delta', "color = 'currentColor',", "color = '#217BE8',"],
  ['a page puts the sheen back', 'brand', '<LedrixDelta size={22} />', '<LedrixDelta size={22} sheen />'],
  ['the menu bar logo stays white on a light bar', 'nav', "${inkChrome ? 'text-ink' : 'text-white'}`} />", "text-white`} />"],
  ['the tab icon is blue again', 'icon', 'fill="#FFFFFF" fill-rule="evenodd"', 'fill="#217BE8" fill-rule="evenodd"'],
  ['the share image uses the old blue triangle', 'og', 'fill="#FFFFFF" fillRule="evenodd"', "fill=\"#217BE8\" fillRule=\"evenodd\""],
  ['sign-in shows the blue delta', 'login', '<ValDelta size={38} color="#FFFFFF" />', '<ValDelta size={38} color={CYAN} />'],
  ['the old cyan app icon comes back', 'appIcon', ICON, '0'.repeat(64)],
];
let fail = 0;
for (const [n, v] of checks(real)) { console.log(`${v ? '✓' : '✗'} ${n}`); if (!v) fail++; }
if (process.argv.includes('--mutate')) {
  let caught = 0;
  for (const [why, f, a, b] of MUTS) {
    if (real[f].split(a).length < 2) { console.log(`✗ anchor present: ${why}`); fail++; continue; }
    const hit = checks({ ...real, [f]: real[f].replace(a, b) }).some(([, v]) => !v);
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  console.log(`${caught}/${MUTS.length} mutations caught`);
}
console.log(`\nverify-logo-black — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
