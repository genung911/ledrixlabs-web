#!/usr/bin/env node
// verify-apple-pass-web-2 — the website Apple pass, batch 2 (owner 2026-11-25, mockup CMFDuVCHM24MyfqKZA53Qx, "Yes guided as
// drawn. Approved"): Before you start as the phone's list and one-question walk, then Guided or On my own, and the guided
// walk on the systems. Reads components/workspace/HouseFactsPanel.tsx, ScopePanel.tsx and the inspection page.
// `--mutate` proves each check can fail (in memory).
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const real = { facts: read('components/workspace/HouseFactsPanel.tsx'), scope: read('components/workspace/ScopePanel.tsx'), page: read('app/app/inspections/[id]/page.tsx') };

function checks({ facts: F, scope: S, page: P }) {
  const out = []; const ok = (n, c) => out.push([n, !!c]);
  const firstReturn = F.indexOf("if (state.kind === 'loading') return");
  const before = (t) => { const i = F.indexOf(t); return i >= 0 && i < firstReturn; };
  ok('every hook runs before the panel\'s first early return', firstReturn > 0 && before('const stepRef = useRef') && before('const [finishing, setFinishing] = useState(false);')
    && before('const [walk, setWalk] = useState'));
  ok('the list: the phone\'s groups in sentence case, one answer per row, a row opens its question', F.includes('<h3 className="px-1 pb-1.5 text-sm text-muted">{sentenceCase(g)}</h3>')
    && F.includes('onClick={() => walkFrom(v.fact.id)}') && F.includes("{v.display || 'Not answered'}"));
  ok('"Answer the n left" walks only the unanswered questions', F.includes('Answer the {left} left ›') && F.includes('const ids = views.filter(v => !v.value).map(v => v.fact.id);'));
  ok('one question a page: progress, the group, the question, "Before you start · n of m"', F.includes('<h2 className="text-2xl font-bold tracking-tight text-ink">{v.fact.question ?? v.fact.label}</h2>')
    && F.includes('bar(`Before you start · ${at + 1} of ${all.length}`'));
  ok('Continue saves only a change, and moves on only once it is saved', F.includes('if (dir === \'next\' && v && editable && needsSave(v) && visitReady(v)) { const ok = await save(v); if (!ok) return; }')
    && F.includes('const save = async (v: FactView): Promise<boolean> => {'));
  ok('Enter = Continue, ← = Back', F.includes("if (e.key === 'Enter') { e.preventDefault(); stepRef.current?.('next'); }") && F.includes("if (e.key === 'ArrowLeft') { e.preventDefault(); stepRef.current?.('back'); }"));
  ok('finishing with nothing left asks Guided or On my own', F.includes('if (left === 0 && onStart) setChoosing(true);') && F.includes('How do you want to inspect?')
    && F.includes("[['guided', 'Guided',") && F.includes("['free', 'On my own',"));
  ok('the pick is remembered in this browser and handed to the page', F.includes('localStorage.setItem(WALK_PREF, style); } catch { /* this browser */ } setChoosing(false); onStart(style);'));
  ok('the page keeps Before you start loaded, so its count shows from the start', P.includes("<div className={activeSection === 'facts' ? 'contents' : 'hidden'}>"));
  ok('Guided opens the systems at the first one not done', P.includes("onStart={findingsVisible ? (style => { setGuidedWalk(style === 'guided'); setGuidedStart(n => n + 1); setSection('scope');")
    && S.includes('const first = view.systems.find(x => x.total > 0 && x.done < x.total) ?? view.systems[0];'));
  ok('the guided bar: where you are, Back, Next: <system> ›, and Review & send at the end', S.includes('Guided · {i + 1} of {view.systems.length} · {sentence(current.node.label)}')
    && S.includes('Next: {sentence(next.node.label)} ›') && S.includes('onClick={guided.onDone}') && S.includes('aria-label="Guided" className="sticky bottom-0'));
  ok('what is still to answer is marked, and Next never blocks', S.includes("return { text: guided ? 'Not answered ●' : 'Not answered', tone:") && !/disabled=\{[^}]*left/.test(S.slice(S.indexOf('aria-label="Guided"'))));
  ok('Guided is remembered per inspection in this browser, and can be stopped', P.includes('const guidedKey = `ledrix_guided_${id}`;') && S.includes('onClick={guided.onStop}'));
  return out;
}
const MUTS = [
  ['a hook after the early returns', 'facts', '  const stepRef = useRef<((d: \'back\' | \'skip\' | \'next\') => void) | null>(null);\n', ''],
  ['Continue moves on when the save failed', 'facts', 'const ok = await save(v); if (!ok) return; }', 'await save(v); }'],
  ['the walk asks every question again', 'facts', 'const ids = views.filter(v => !v.value).map(v => v.fact.id);', 'const ids = views.map(v => v.fact.id);'],
  ['no choice at the end', 'facts', 'if (left === 0 && onStart) setChoosing(true);', ''],
  ['the count waits for the page to be opened', 'page', "<div className={activeSection === 'facts' ? 'contents' : 'hidden'}>", "<div className={activeSection === 'facts' ? 'contents' : 'contents'} data-x>"],
  ['Guided starts on the first system', 'scope', 'view.systems.find(x => x.total > 0 && x.done < x.total) ?? view.systems[0]', 'view.systems[0]'],
  ['the last system has no way to Review & send', 'scope', 'onClick={guided.onDone}', 'onClick={guided.onStop}'],
  ['nothing marked', 'scope', "return { text: guided ? 'Not answered ●' : 'Not answered', tone:", "return { text: 'Not answered', tone:"],
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
console.log(`\nverify-apple-pass-web-2 — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
