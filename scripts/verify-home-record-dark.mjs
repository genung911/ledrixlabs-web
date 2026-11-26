#!/usr/bin/env node
// verify-home-record-dark — approval pack items 4 + 5 (owner 2026-11-25): every Home Record tab in light AND dark, the
// phone's bottom tab bar, the paper-white report, and the house drawn by home type. Reads the share page (shareSource)
// and the share route; runs houseKind. `--mutate` proves each check can fail (in memory).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { shareSource } from './lib/shareSource.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const real = { page: shareSource(REPO), route: readFileSync(new URL('../app/api/share/[token]/route.ts', import.meta.url), 'utf8') };

function houseKindOf(S) {
  const m = S.match(/function houseKind\([\s\S]*?\n}\n/);
  if (!m) return null;
  const js = ts.transpileModule(m[0], { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(js + '; return houseKind;')();
}

function checks(src) {
  const S = src.page, R = src.route; const out = []; const ok = (n, c) => out.push([n, !!c]);
  // dark
  ok('the neutrals are tokens, not light hex', ['BG', 'CARD', 'CARD2', 'BORDER', 'DIM', 'MED', 'TEXT'].every(k => new RegExp(`const ${k}\\s+= 'var\\(--s`).test(S)));
  ok('the tokens have a dark set that follows the device', /@media \(prefers-color-scheme:dark\)\{\.sp\{\$\{SP_DARK\}/.test(S) && /--sbg:#0A0B0D/.test(S));
  ok('the page root carries them', S.includes('<div className="sp" style={{ background: BG, color: TEXT,') && S.includes('<style>{SP_CSS}</style>'));
  ok('the top bar, rail and Ask Ledrix dock are frosted from the tokens, not light glass', !/rgba\(24[56],24[67],24[34],0\.9/.test(S) && (S.match(/background: GLASS/g) ?? []).length >= 3);
  ok('the report document stays paper-white', S.includes('<div className="sp-paper" style={{ background: \'#fff\', color: \'#0F1216\' }}><ReportTab') && /\.sp \.sp-paper\{\$\{SP_LIGHT\}/.test(S));
  ok('no white text on an ink button (it would vanish in dark)', !/background: TEXT,[^}\n]*color: '#fff'/.test(S));
  ok('the status bands use tokens', !/'#EEF4FD'|'#EAF5EE'|'#FDF0EC'/.test(S));
  ok('the orb follows the device too', S.includes("tone={darkUi ? 'dark' : 'light'}"));
  // bottom bar
  ok('on a phone the tabs are a bottom bar; on a computer along the top', S.includes('{desk && <HomeRail active={tab} onPick={pick} />}') && S.includes('{!desk && <HomeRail active={tab} onPick={pick} bottom />}'));
  ok('the bottom bar is fixed to the bottom and clears the home indicator', /position: 'fixed', left: 0, right: 0, bottom: 0/.test(S) && /paddingBottom: 'env\(safe-area-inset-bottom, 0px\)'/.test(S));
  ok('Ask Ledrix sits just above the bar', S.includes("bottom: desk ? 0 : `calc(${TABBAR_H}px + env(safe-area-inset-bottom, 0px))`"));
  // drawing
  const hk = houseKindOf(S);
  ok('houseKind found', !!hk);
  if (hk) {
    ok('Manufactured and Mobile → the home on piers', hk({ homeType: 'Manufactured' }) === 'manufactured' && hk({ homeType: 'Mobile', stories: '2 stories' }) === 'manufactured');
    ok('Condo / Townhome → the building', hk({ homeType: 'Condo/Townhome' }) === 'condo');
    ok('Single family, 1 story → one story; 2 stories → two', hk({ homeType: 'Site-Built', stories: '1 story' }) === 'one' && hk({ homeType: 'Site-Built', stories: '2 stories' }) === 'two');
    ok('unknown, or Multi-unit (after launch) → two story', hk(null) === 'two' && hk({}) === 'two' && hk({ homeType: 'Multi-Unit', stories: '1 story' }) === 'two');
  }
  ok('each drawing moves its points', /at: \{ one: \[153, 100\], manufactured: \[190, 128\], condo: \[195, 72\] \}/.test(S)
    && S.includes("const [x, y] = p.at[kind] ?? [p.x, p.y];"));
  ok('the drawing is chosen from the record', S.includes('kind={houseKind(record.house)}'));
  ok('the server sends only known home types and stories', /return \{ homeType: HOME_TYPES\.has\(row\.home_type\) \? row\.home_type : null, stories: STORIES\.has\(row\.stories\) \? row\.stories : null \};/.test(R)
    && R.includes('limitations, house,'));
  return out;
}
const MUTS = [
  ['TEXT is light hex again', 'page', "const TEXT     = 'var(--stext)';", "const TEXT     = '#262016';"],
  ['no dark set', 'page', '@media (prefers-color-scheme:dark){.sp{${SP_DARK}color-scheme:dark}}', ''],
  ['the root has no tokens', 'page', '<div className="sp" style={{ background: BG, color: TEXT,', '<div style={{ background: BG, color: TEXT,'],
  ['the dock is light glass', 'page', "          background: GLASS, backdropFilter: 'blur(12px)',", "          background: 'rgba(245,246,243,0.9)', backdropFilter: 'blur(12px)',"],
  ['the report goes dark', 'page', '<div className="sp-paper" style={{ background: \'#fff\', color: \'#0F1216\' }}><ReportTab', '<div><ReportTab'],
  ['white on ink', 'page', "onClick={onUnlock} style={{ background: TEXT, color: INK_ON,", "onClick={onUnlock} style={{ background: TEXT, color: '#fff',"],
  ['a light band', 'page', "background: claim.kind === 'claimed' ? TINT_OK", "background: claim.kind === 'claimed' ? '#EAF5EE'"],
  ['the orb stays light', 'page', "tone={darkUi ? 'dark' : 'light'}", 'tone="light"'],
  ['phones keep the top rail', 'page', '{!desk && <HomeRail active={tab} onPick={pick} bottom />}', '{!desk && <HomeRail active={tab} onPick={pick} />}'],
  ['the dock covers the bar', 'page', "bottom: desk ? 0 : `calc(${TABBAR_H}px + env(safe-area-inset-bottom, 0px))`", 'bottom: 0'],
  ['manufactured drawn as a house', 'page', "if (t === 'Manufactured' || t === 'Mobile') return 'manufactured';", ''],
  ['one story ignored', 'page', "if (t === 'Site-Built' && h?.stories === '1 story') return 'one';", ''],
  ['points never move', 'page', "const [x, y] = p.at[kind] ?? [p.x, p.y];", "const [x, y] = [p.x, p.y];"],
  ['always two story', 'page', 'kind={houseKind(record.house)}', "kind={'two'}"],
  ['any home type leaves the server', 'route', 'homeType: HOME_TYPES.has(row.home_type) ? row.home_type : null', 'homeType: row.home_type ?? null'],
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
console.log(`\nverify-home-record-dark — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
