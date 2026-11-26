#!/usr/bin/env node
// verify-home-record-redesign — the Home Record's Home tab, redesigned (owner 2026-11-25, mockup 1CCUJycYwNKA8862rsStQ4
// "Approved", with the 12 adds/adjustments). Part 1: the house is the home screen.
//   1 the house: a point only for a system the record has; its colour is that system's worst finding; it pushes that
//     system's page inside Home (back returns); the points are also a list for keyboards / screen readers; the pulse
//     stops for reduced motion
//   2 counts, not a score: Safety · Major · Minor · Upkeep; no ring, no grade
//   3 light and dark: every colour is a token, dark under prefers-color-scheme
//   4 the adds: What wasn't inspected (from the share API, item + reason only), the inspector card, the scope line,
//     a photo on each finding row, the finding opens the existing detail
// Mutants: in-memory copies. Nothing on disk is edited.
import { readFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
import { shareSource } from './lib/shareSource.mjs';   // the share page, split into files 2026-11-25, as one module
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = { page: shareSource(ROOT), api: readFileSync(join(ROOT, 'app/api/share/[token]/route.ts'), 'utf8') };
function checks(S) {
  const out = []; const ok = (n, v) => out.push([n, !!v]);
  const home = (S.page.match(/function HomeTab\([\s\S]*?\n}\n/) ?? [''])[0];
  ok('1 a point only for a system the record has', /const pts = HR_POINTS\.filter\(p => present\(p\.id\)\)/.test(S.page) && home.includes('const present = (id: string) => sysOf(id).length > 0;'));
  ok('1 a point is coloured by its worst finding (Safety first)', home.includes('for (const k of HR_RANK) if (ks.includes(k)) return HR_PRIO[k].color;') && S.page.includes("const HR_RANK: HrPrio[] = ['safety', 'major', 'minor', 'maint'];"));
  ok('1 a point pushes its system inside Home, back returns', home.includes("onPick={id => setPage({ kind: 'system', id })}") && home.includes('onClick={() => setPage(null)}'));
  ok('1 the points are also a list for keyboards and screen readers', home.includes('aria-label="Systems on the drawing"') && /onKeyDown=\{e => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\)/.test(S.page));
  ok('1 the pulse stops for reduced motion', S.page.includes('@media (prefers-reduced-motion:reduce){.hr .hr-pulse{animation:none;opacity:0}}'));
  ok('2 four counts, Safety · Major · Minor · Upkeep', S.page.includes("safety: { label: 'Safety'") && S.page.includes("maint: { label: 'Upkeep'") && /\{HR_RANK\.map\(k => \(/.test(home));
  ok('2 no ring and no score', !/strokeDasharray/.test(home) && !/\bscore\b|\bgrade\b/i.test(home.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')));
  ok('3 dark follows the device', S.page.includes('@media (prefers-color-scheme:dark){.hr{${HR_DARK}}}') && /--hsafety:#FF5A52/.test(S.page));
  ok('3 the Home tab paints with tokens, not fixed colours', !/#(?:F6F2EA|141009|262016)/.test(home));
  ok('4 What wasn\'t inspected reads the share API\'s limitations', home.includes("const limits = Array.isArray(record.limitations) ? record.limitations : [];") && home.includes("setPage({ kind: 'limits' })"));
  ok('4 the API sends only item + reason, for its own share', /async function selectLimitations\(shareId: string\)/.test(S.api) && S.api.includes('inspection_id=eq.${encodeURIComponent(shareId)}&kind=eq.condition&select=node_key,value')
    && S.api.includes('seen.add(k); out.push({ item, reason });') && S.api.includes('selectLimitations(access.shareId).catch(() => [])'));
  ok('4 the inspector card names the inspector, company and license', home.includes("record.license_number ? `License ${record.license_number}` : ''"));
  ok('4 the scope line: observed on the date, not a warranty', home.includes('It is not a warranty or a guarantee. Questions about a finding go to your inspector.'));
  ok('4 each finding row shows its photo and opens the finding', home.includes('const k = hrPrioOf(a); const img = photoUrl(a.imageUri);') && home.includes('onClick={() => setOpen(a)}') && home.includes('<FindingDetailModal a={open}'));
  ok('4 no prices on Home', !/\$\d|budget_estimate|price/i.test(home));
  return out;
}
const base = checks(SRC); let fail = 0;
for (const [n, v] of base) { console.log(`${v ? '✓' : '✗'} ${n}`); if (!v) fail++; }
const mut = (label, key, a, b) => ({ label, key, a, b });
const mutants = [
  mut('a point for every system, present or not', 'page', 'const pts = HR_POINTS.filter(p => present(p.id))', 'const pts = HR_POINTS'),
  mut('points always green', 'page', 'for (const k of HR_RANK) if (ks.includes(k)) return HR_PRIO[k].color;', ''),
  mut('a point jumps to the Systems tab instead', 'page', "onPick={id => setPage({ kind: 'system', id })}", "onPick={() => onTabChange('systems')}"),
  mut('no list for screen readers', 'page', 'aria-label="Systems on the drawing"', 'aria-hidden="true"'),
  mut('pulse ignores reduced motion', 'page', '@media (prefers-reduced-motion:reduce){.hr .hr-pulse{animation:none;opacity:0}}', ''),
  mut('a score comes back', 'page', '  const gut = 16;\n  const sealed', '  const score = 100;\n  const gut = 16;\n  const sealed'),
  mut('dark mode dropped', 'page', '@media (prefers-color-scheme:dark){.hr{${HR_DARK}}}', ''),
  mut('limitations read from another share', 'api', 'selectLimitations(access.shareId).catch(() => [])', 'selectLimitations(String(req.nextUrl.searchParams.get("s") ?? "")).catch(() => [])'),
  mut('the API sends the whole value', 'api', 'seen.add(k); out.push({ item, reason });', 'seen.add(k); out.push({ item, reason, ...v });'),
  mut('no scope line', 'page', 'It is not a warranty or a guarantee. Questions about a finding go to your inspector.', 'Thanks for choosing us.'),
  mut('finding rows lose their photo', 'page', 'const k = hrPrioOf(a); const img = photoUrl(a.imageUri);', 'const k = hrPrioOf(a); const img = null;'),
  mut('a price on Home', 'page', "  const gut = 16;\n  const sealed", "  const est = '$350';\n  const gut = 16;\n  const sealed"),
];
let caught = 0;
for (const m of mutants) {
  if (!SRC[m.key].includes(m.a)) { console.log(`!! anchor missing: ${m.label}`); continue; }
  const dead = checks({ ...SRC, [m.key]: SRC[m.key].replace(m.a, m.b) }).some(r => !r[1]);
  console.log(`${dead ? '☠' : '!!'} mutant: ${m.label}`); if (dead) caught++;
}
console.log(`\n${base.length - fail}/${base.length} checks · ${caught}/${mutants.length} mutants caught`);
if (fail || caught !== mutants.length) process.exit(1);
