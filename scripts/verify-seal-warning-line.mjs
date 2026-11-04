// verify-seal-warning-line — Seal & send's "Where this job's data is" grid is replaced by ONE warning line per phone that
// still holds part of the job (owner 2026-11-04: "yes build the warning line"); nothing phone-only → no line.
// phoneWarnings is lifted out of SealPanel.tsx and EXECUTED (node type stripping); `--mutate` proves each check can fail.
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const PANEL = readFileSync('components/workspace/SealPanel.tsx', 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'warnline-'));
let n = 0;

async function checks(src) {
  const out = []; const ok = (name, c) => out.push({ name, pass: !!c });
  const i = src.indexOf('export function phoneWarnings(');
  let fn = null;
  if (i >= 0) {
    const f = join(dir, `w${n++}.ts`);
    writeFileSync(f, src.slice(i));
    try { fn = (await import(pathToFileURL(f).href)).phoneWarnings; } catch { fn = null; }
  }
  ok('phoneWarnings exists and runs', typeof fn === 'function');
  const run = (p) => { try { return fn(p); } catch { return null; } };
  const at = '2026-11-04T20:32:00Z';
  const clear = run({ state: 'clear', phones: [{ name: 'Kelly Genung', device: 'd1', parts: [], reportedAt: at }] });
  ok('nothing phone-only → no line', Array.isArray(clear) && clear.length === 0);
  const parts = run({ state: 'parts', phones: [
    { name: 'Kelly Genung', device: 'd1', parts: ['Systems checklist state'], reportedAt: at },
    { name: 'Sam', device: 'd2', parts: [], reportedAt: at }] });
  ok('one line per phone holding parts, none for a phone holding nothing', Array.isArray(parts) && parts.length === 1);
  ok('the line names whose phone, and says it has not sent everything', parts?.[0]?.title === 'Kelly Genung’s phone hasn’t sent everything for this job yet.');
  ok('the line carries when that phone reported', parts?.[0]?.reportedAt === at);
  const none = run({ state: 'unreported', phones: [] });
  ok('no phone has reported → one line saying so', Array.isArray(none) && none.length === 1 && /No phone has reported/.test(none[0].title));
  ok('the grid of every part is gone', !/Where this job’s data is/.test(src) && !/c\.dataMap\.map/.test(src));
  ok('the panel renders the lines with the Sync instruction', /phoneWarnings\(c\.phoneOnly\)\.map\(/.test(src) && /Open the job on that phone and tap Sync\./.test(src));
  return out;
}

const MUT = [
  ['a phone with nothing phone-only still warns', "return p.phones.filter(ph => ph.parts.length > 0).map(", "return p.phones.map("],
  ['an unreported job says nothing', "if (p.state === 'unreported') return [", "if (false) return ["],
  ['the line drops the time', "reportedAt: ph.reportedAt,\n", "reportedAt: null,\n"],
  ['the grid comes back', "{phoneWarnings(c.phoneOnly).map(w => (", "{c.dataMap.map(d => null)}{phoneWarnings(c.phoneOnly).map(w => ("],
  ['the panel never renders the lines', "phoneWarnings(c.phoneOnly).map(", "([] as any[]).map("],
  ['the instruction is lost', "Open the job on that phone and tap Sync.", "Check the phone."],
];

let fail = 0;
for (const c of await checks(PANEL)) { console.log(`${c.pass ? '✓' : '✗'} ${c.name}`); if (!c.pass) fail++; }
let caught = 0;
for (const [why, from, to] of MUT) {
  if (PANEL.split(from).length !== 2) { console.log(`✗ mutation anchor present once: ${why}`); fail++; continue; }
  const hit = (await checks(PANEL.replace(from, to))).some(c => !c.pass);
  console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
}
rmSync(dir, { recursive: true, force: true });
console.log(`\nverify-seal-warning-line — ${caught}/${MUT.length} mutations caught, ${fail} failed`);
process.exit(fail ? 1 : 0);
