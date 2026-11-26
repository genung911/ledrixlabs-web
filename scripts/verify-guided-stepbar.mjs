#!/usr/bin/env node
// verify-guided-stepbar — approval pack item 11 (owner 2026-11-24: "The next button jumps around, can that be stationary?"):
// the Template Builder's guided walk keeps Back / Skip / Next in ONE bar pinned to the bottom, with where you are on the
// left — on every question and on a system's summary. Reads components/templates/GuidedSetup.tsx. `--mutate` proves it.
import { readFileSync } from 'node:fs';
const real = readFileSync(new URL('../components/templates/GuidedSetup.tsx', import.meta.url), 'utf8');
function checks(S) {
  const out = []; const ok = (n, c) => out.push([n, !!c]);
  ok('one bar, pinned to the bottom of the walk', /function StepBar\(/.test(S) && S.includes('className="sticky bottom-0 z-10 -mx-6 mt-auto flex min-h-[60px]'));
  ok('where you are on the left', S.includes('<span className="mr-auto min-w-0 truncate text-sm text-muted">{where}'));
  ok('a question uses it: "Foundation · 3 of 14", Back · Skip · Next', S.includes('<StepBar where={`${displayLabel(system.label)} · ${(at as number) + 1} of ${steps.length}`}'));
  ok('a system\'s summary uses it: "3 of 14 · Foundation", Back · Next: Roof ›', S.includes('<StepBar where={`${i + 1} of ${systems.length} · ${displayLabel(system.label)}`}>')
    && S.includes("{after ? `Next: ${displayLabel(after.label)} ›` : 'Done ›'}</button>"));
  ok('no Next button left floating under the content (the start screen\'s Continue too)', !/mt-auto pt-4/.test(S) && (S.match(/<StepBar /g) ?? []).length === 3);
  return out;
}
const MUTS = [
  ['the bar scrolls away', 'className="sticky bottom-0 z-10 -mx-6', 'className="z-10 -mx-6'],
  ['the question keeps its own row', '<StepBar where={`${displayLabel(system.label)} · ${(at as number) + 1} of ${steps.length}`} hint="Enter = Next · ← key = Back">', '<div className="mt-auto pt-4" data-x={`${(at as number) + 1}`}>'],
  ['the summary\'s Next floats again', '<StepBar where={`${i + 1} of ${systems.length} · ${displayLabel(system.label)}`}>', '<div className="mt-auto pt-4">'],
  ['no position shown', '{where}{hint ?', '{hint ?'],
];
let fail = 0;
for (const [n, v] of checks(real)) { console.log(`${v ? '✓' : '✗'} ${n}`); if (!v) fail++; }
if (process.argv.includes('--mutate')) {
  let caught = 0;
  for (const [why, a, b] of MUTS) {
    if (real.split(a).length !== 2) { console.log(`✗ anchor present once: ${why}`); fail++; continue; }
    const hit = checks(real.replace(a, b)).some(([, v]) => !v);
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  console.log(`${caught}/${MUTS.length} mutations caught`);
}
console.log(`\nverify-guided-stepbar — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
