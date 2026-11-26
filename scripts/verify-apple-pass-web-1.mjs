#!/usr/bin/env node
// verify-apple-pass-web-1 — the website Apple pass, batch 1 (owner 2026-11-25, approval pack item 9): the inspection page
// opens on its systems in the phone's style — the list from Before you start to Review & send, each system with where it
// stands in words, the open system as Details (type first) and Condition, one answer per row, sentence case.
// Reads components/workspace/ScopePanel.tsx and the inspection page; runs `sentence`. `--mutate` proves each check fails.
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const real = {
  panel: readFileSync(new URL('../components/workspace/ScopePanel.tsx', import.meta.url), 'utf8'),
  page: readFileSync(new URL('../app/app/inspections/[id]/page.tsx', import.meta.url), 'utf8'),
};
function sentenceOf(P) {
  const m = P.match(/const ACRONYMS = [^\n]*\nconst sentence = [^\n]*/);
  if (!m) return null;
  return new Function(ts.transpileModule(m[0], { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText + '; return sentence;')();
}
function checks({ panel: P, page: G }) {
  const out = []; const ok = (n, c) => out.push([n, !!c]);
  ok('the inspection opens on its systems (deep links still open their section)', G.includes("const [section, setSection] = useState<Section>('scope');"));
  ok('Before you start on top, with what is left', P.includes("listRow('facts', 'Before you start',") && P.includes('{around.factsLeft} to answer') && G.includes('around={{ factsLeft: factsLeftN, onFacts:'));
  ok('Findings and Review & send below, Findings with what is to review', P.includes("listRow('findings', 'Findings',") && P.includes("listRow('seal', 'Review & send', null, around.onSeal)")
    && G.includes('findings: { total: groups.findings.length + groups.review.length, review: groups.review.length },'));
  ok('each system says where it stands: findings, then what is left, else All OK', /if \(f\) return \{ text: `\$\{f\} finding\$\{f === 1 \? '' : 's'\}`, tone: 'warn' \};/.test(P)
    && P.includes("return left > 0 ? { text: `${left} to answer`, tone: 'todo' } : { text: 'All OK', tone: 'ok' };"));
  ok('the open system is two groups, Details and Condition', P.includes('<section aria-label="Details">') && P.includes('<section aria-label="Condition">'));
  ok('Details puts the type rows first', P.includes('.sort((a, b) => typeFirst(a.f) - typeFirst(b.f) || a.n - b.n)') && P.includes('const typeFirst = (f: SpecField) => (/\\btype\\b/i.test('));
  ok('a condition row answers in words: findings, Limited · reason, Satisfactory, Not answered', P.includes("return { text: `Limited · ${limitationReasonOf(lim)}`, tone: 'limit' };")
    && P.includes("if (v.includes(CONDITION_OK)) return { text: 'Satisfactory', tone: 'ok' };") && P.includes("return { text: 'Not answered', tone: 'todo' };"));
  ok('one answer per row: a row opens its choices in place', (P.match(/onClick=\{\(\) => (?:\{ )?setRowOpen\(isOpen \? null : id\)/g) ?? []).length === 2);
  ok('the phone\'s words on the choices (sentence case, no capitals)', P.includes("{ok ? '✓ Satisfactory' : 'Satisfactory'}") && P.includes('>Limitation ▾</button>') && !/SATISFACTORY|LIMITATION ▾/.test(P));
  const sentence = sentenceOf(P);
  ok('sentence case, acronyms kept', !!sentence && sentence('WATER HEATER') === 'Water heater' && sentence('Supply Connections') === 'Supply connections' && sentence('HVAC SYSTEM') === 'HVAC system');
  ok('the Seal & send item is still marked', P.includes("const markCls = (id: string) => marked === id ? 'ring-2 ring-inset ring-accent' : '';") && (P.match(/\$\{markCls\(row\.node\.id\)\}/g) ?? []).length === 2);
  return out;
}
const MUTS = [
  ['opens on To review again', 'page', "useState<Section>('scope');", "useState<Section>('review');"],
  ['no Before you start in the list', 'panel', "listRow('facts', 'Before you start',", "listRow('facts', 'Start',"],
  ['Findings forgets what is to review', 'page', 'findings: { total: groups.findings.length + groups.review.length, review: groups.review.length },', 'findings: { total: groups.findings.length, review: 0 },'],
  ['a system with findings says All OK', 'panel', "if (f) return { text: `${f} finding${f === 1 ? '' : 's'}`, tone: 'warn' };", ''],
  ['a finished system shows a fraction', 'panel', ": { text: 'All OK', tone: 'ok' };", ": { text: `${sys.done}/${sys.total}`, tone: 'ok' };"],
  ['one flat list again', 'panel', '<section aria-label="Condition">', '<section>'],
  ['type rows not first', 'panel', '.sort((a, b) => typeFirst(a.f) - typeFirst(b.f) || a.n - b.n)', '.sort((a, b) => a.n - b.n)'],
  ['a limitation reads as Not answered', 'panel', "if (lim) return { text: `Limited · ${limitationReasonOf(lim)}`, tone: 'limit' };", ''],
  ['capitals come back', 'panel', "{ok ? '✓ Satisfactory' : 'Satisfactory'}", "{ok ? '✓ SATISFACTORY' : 'SATISFACTORY'}"],
  ['acronyms lowered', 'panel', 'replace(ACRONYMS, m => m.toUpperCase())', 'replace(ACRONYMS, m => m)'],
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
console.log(`\nverify-apple-pass-web-1 — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
