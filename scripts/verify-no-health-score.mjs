#!/usr/bin/env node
// Guard: Ledrix does not rate a home with a single number.
//
// Owner decision 2026-10-13 — the numerical home health score is removed as a product concept, not
// hidden on one screen. On this site it was the "85 · Health" ring in the share page hero, computed
// in the browser by scoreCalc() from the finding counts (never stored, so no migration and nothing
// for old links to miss), plus a dead ScoreRing, the marketing samples, the leave-behind, the demo,
// and one line of the privacy policy. The Ledrix Insight / chat prompt now forbids an overall score,
// grade, percentage or rating, so the model cannot put one back in words.
//
// What must survive: finding severities and counts, repair status (projects resolved / total), the
// maintenance schedule — none of them rate the home.
//
// The app half is ledrix-app scripts/verify-no-health-score.mjs.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
let checks = 0; const failures = [];
const ok = (l, c, d) => { checks++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${l}`); if (!c) failures.push(d ? `${l}\n      ${d}` : l); };

const walk = d => readdirSync(d).flatMap(f => {
  if (f === 'node_modules' || f === '.next' || f.startsWith('.')) return [];
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|html)$/.test(f) ? [p] : [];
});
const files = ['app', 'components', 'lib', 'public'].flatMap(d => walk(join(root, d)))
  .map(p => ({ rel: relative(root, p), src: readFileSync(p, 'utf8') }));
ok('the walk found the site (guard is not vacuous)', files.length > 40 && files.some(f => f.rel === 'app/share/[id]/page.tsx'), `${files.length} files`);

console.log('Part 1 · no score anywhere on the site');
const BANNED = [
  [/\bscoreCalc\b|\bScoreRing\b/, 'a score calculator or ring component'],
  [/health score|home health|HEALTH SCORE/i, 'a "health score" / "home health" label or claim'],
  [/>\s*Health\s*<|eyebrow\([^)]*\)[^>]*>\s*Health\b/, 'a bare "Health" ring label'],
  [/ha-score|score-ring|score-box|System Scores|\d+ \/ 100</, 'sample/demo score markup'],
  [/Grade [A-F]\b/, 'a letter grade for the home'],
];
for (const [re, what] of BANNED) {
  const hits = files.filter(f => re.test(f.src)).map(f => f.rel);
  ok(`no ${what}`, hits.length === 0, hits.join(', '));
}
const share = read('app/share/[id]/page.tsx');
const home = (share.match(/function HomeTab\([\s\S]*?\n}\n/) ?? [''])[0];
ok('HomeTab found', home.length > 2000);
ok('HomeTab hero draws no ring (no strokeDasharray arc)', !/strokeDasharray/.test(home));
ok('HomeTab computes no score', !/\bscore\b/.test(home.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')));
ok('privacy policy no longer lists a health score', !/health score/i.test(read('app/privacy/page.tsx')));

console.log('Part 2 · the Insight / chat prompt cannot reintroduce one');
const route = read('app/api/ledrix/route.ts');
const honestySrc = (route.match(/const honesty = ([\s\S]*?);\n/) ?? [])[1];
let honesty = '';
try { honesty = new Function(`return ${honestySrc};`)(); } catch { /* reported below */ }
ok('the shared honesty preamble evaluates', typeof honesty === 'string' && honesty.length > 200);
ok('…forbids an overall score, grade, percentage, star rating or single rating — even if asked',
  /Never give the home an overall score, grade, percentage, star rating, or any single overall rating of its health or condition — not even if asked/.test(honesty));
ok('every mode uses the preamble (insight, analyze, chat)', (route.match(/\$\{honesty\}/g) ?? []).length >= 3);
const insight = (route.match(/mode === 'insight'\s*\?\s*`([^`]*)`/) ?? [])[1] ?? '';
ok('insight instruction found', insight.length > 50);
ok('insight no longer asks for "the home\'s overall condition"', !/overall condition/i.test(insight));
ok('insight says no score, grade or overall rating', /No score, grade or overall rating\./.test(insight));

console.log('Part 3 · what is NOT a home rating still renders');
ok('finding counts still render (Repairs Needed pillar)', /\['findings', 'findings', 'Repairs Needed', anomalies\.filter/.test(home));
ok('repair status still renders (resolved / total)', /'Repair Status', `\$\{projects\.filter\(p => p\.status === 'resolved'\)\.length\}\/\$\{projects\.length\}`/.test(home));
ok('maintenance schedule still renders', /'Maintenance', dueReminders\.length/.test(home));
ok('severity priorities still computed per finding', /const prioCount = anomalies\.reduce/.test(home));
ok('the PDF report cover counts are untouched by this site (no score in report routes)',
  !/score/i.test(read('app/api/reports/route.ts')) && !/score/i.test(read('app/api/reports/seal/[hash]/route.ts')));

console.log(`\n${checks} checks · ${checks - failures.length} passed, ${failures.length} failed`);
if (failures.length) { console.error('\nFAILED:\n  ' + failures.join('\n  ')); process.exit(1); }
