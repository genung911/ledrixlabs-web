#!/usr/bin/env node
// verify-apple-pass-web-3 — the website Apple pass, batch 3 (owner 2026-11-25, mockup TYeCBzBcDZpZ2cNHRKQR1d, "Approved. One
// entry as drawn"): one Findings entry with To review · Confirmed · Rejected as a switch; rows with the photo, the priority
// and where each stands; Ledrix's priority kept only when ticked; the confirm bar pinned; Review & send's "Before you send"
// rows and a pinned Send report. Reads the inspection page, FindingEditor and SealPanel. `--mutate` proves each check.
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const real = { page: read('app/app/inspections/[id]/page.tsx'), ed: read('components/workspace/FindingEditor.tsx'), seal: read('components/workspace/SealPanel.tsx') };

function checks({ page: P, ed: E, seal: S }) {
  const out = []; const ok = (n, c) => out.push([n, !!c]);
  ok('one Findings entry in the list, counting what is to review and confirmed', P.includes("{ id: groups.review.length ? 'review' : 'findings', label: 'Findings', count: groups.review.length + groups.findings.length, show: findingsVisible },")
    && !/label: 'To review', count/.test(P) && !/label: 'Rejected', count/.test(P));
  ok('the entry stays lit on any of its three views', P.includes('const railOn = (id: Section) => isFindings(id) ? isFindings(activeSection) : activeSection === id;'));
  ok('To review · Confirmed · Rejected is a switch at the top of the list', P.includes('role="tablist" aria-label="Findings"') && P.includes("[['review', 'To review', groups.review.length], ['findings', 'Confirmed', groups.findings.length], ['rejected', 'Rejected', groups.rejected.length]]"));
  ok('each row has its photo', P.includes('<FindingThumb uri={r.image_uri} urls={thumbs} />') && P.includes('signEvidence(paths).then(u => { if (live) setThumbs(t => ({ ...t, ...u })); })'));
  ok('a row to review says where it stands: "n need attention" or "Ready"', P.includes("{n ? `${n} need${n === 1 ? 's' : ''} attention` : 'Ready'}") && P.includes('missingForConfirm(r as any, draftOf(r as any)).length + (isPrioritySuggested(r) ? 1 : 0)'));
  ok('Ledrix\'s priority is kept only when ticked (or another is picked)', E.includes('const needsTick = editable && suggested && status === \'proposed\' && draft.severity === finding.severity && !kept;')
    && E.includes("{kept ? '✓ Kept' : 'Tick to keep'}") && E.includes('const attention = missing.length + (needsTick ? 1 : 0);'));
  ok('Confirm waits for everything, and the bar is pinned with where it stands', E.includes('disabled={!!busy || attention > 0}') && E.includes('className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t')
    && E.includes("{attention ? `${attention} need${attention === 1 ? 's' : ''} attention` : 'Ready to confirm'}"));
  ok('a tick resets for the next finding', E.includes('useEffect(() => { setKept(false); }, [finding.id]);'));
  ok('Review & send: the phone\'s "Before you send" rows — Report check, Findings, Checklist, Status', S.includes('<h3 className="pb-1.5 text-sm text-muted">Before you send</h3>')
    && S.includes("{locked ? `${c.locks.length} to fix` : 'Nothing blocks'}") && S.includes("{summary.toReview ? `${summary.toReview} to review` : 'All approved'}") && S.includes('onClick={summary.onChecklist}') && S.includes('onClick={summary.onFindings}'));
  ok('Send report is pinned', S.includes('className="sticky bottom-0 mt-auto flex flex-col gap-2.5 rounded-b-xl border-t'));
  ok('the page hands Review & send its rows', P.includes('summary={findingsVisible ? { toReview: groups.review.length, onFindings:'));
  return out;
}
const MUTS = [
  ['three entries come back', 'page', "{ id: groups.review.length ? 'review' : 'findings', label: 'Findings',", "{ id: 'review', label: 'To review', count: groups.review.length, show: findingsVisible },\n    { id: 'findings', label: 'Findings',"],
  ['the entry goes dark on Confirmed', 'page', 'isFindings(id) ? isFindings(activeSection) : activeSection === id', 'activeSection === id'],
  ['rows lose their photo', 'page', '<FindingThumb uri={r.image_uri} urls={thumbs} />', ''],
  ['a suggested priority counts as ready', 'page', ' + (isPrioritySuggested(r) ? 1 : 0)', ''],
  ['Confirm accepts Ledrix\'s priority unticked', 'ed', 'const attention = missing.length + (needsTick ? 1 : 0);', 'const attention = missing.length;'],
  ['the tick carries over to the next finding', 'ed', 'useEffect(() => { setKept(false); }, [finding.id]);', ''],
  ['Findings row never opens Findings', 'seal', 'onClick={summary.onFindings}', 'onClick={summary.onChecklist}'],
  ['Send report scrolls away', 'seal', 'className="sticky bottom-0 mt-auto flex flex-col gap-2.5 rounded-b-xl', 'className="mt-auto flex flex-col gap-2.5 rounded-b-xl'],
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
console.log(`\nverify-apple-pass-web-3 — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
