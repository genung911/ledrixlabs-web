#!/usr/bin/env node
// verify-claim-buying-web — "Is this home yours yet?" on the share page (owner 2026-11-25, SQL #153 applied; DECISIONS
// "who holds a home's data": a buyer's claim waits for closing, no repair marking before it).
//   1 the answer is asked BEFORE any claim, and recorded (set_claim_intent) before claim_my_reports / claim_by_link
//   2 a home already held (state home) or waiting (state buying) is never asked again
//   3 buying = look-only: the link's scope goes to read, the band says so with the closing date (a LOCAL day)
//   4 on or after the date: "Did you close?" → confirm_closing; "Not yet" / Change date → set_closing_date
//   5 the claim sheet asks first when not signed in; someone signed in who hasn't answered gets it on Home
// Executes closingLabel; the rest is source checks. Mutants: in-memory. Nothing on disk is edited.
import { readFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
import { shareSource } from './lib/shareSource.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = shareSource(ROOT);
function labelFn(src) {
  const m = /const closingLabel = \(iso: string \| null \| undefined\): string => \{([\s\S]*?)\n\};/.exec(src);
  if (!m) return null;
  try { return new Function('iso', m[1]); } catch { return null; }
}
function checks(S) {
  const out = []; const ok = (n, v) => out.push([n, !!v]);
  const eff = S.slice(S.indexOf("const st0 = await supabase.rpc('my_claim_state'"), S.indexOf("const confirmClosed = async () => {"));
  const iIntent = eff.indexOf("supabase.rpc('set_claim_intent'"), iMine = eff.indexOf("supabase.rpc('claim_my_reports')"), iLink = eff.indexOf("supabase.rpc('claim_by_link'");
  ok('1 the answer is recorded before any claim', iIntent > 0 && iMine > iIntent && iLink > iIntent);
  ok('1 no answer yet → ask, and claim nothing', eff.includes('if (!claimAnswer) { setNeedAnswer(true); claimTried.current = false; return; }'));
  ok('2 a home already held or waiting is not asked again', eff.indexOf("if (st0.data?.state === 'home')") >= 0 && eff.indexOf("if (st0.data?.state === 'buying')") >= 0
    && eff.indexOf("if (st0.data?.state === 'buying')") < eff.indexOf('if (!claimAnswer)'));
  ok('3 buying makes the page look-only', S.includes("const markBuying = (closesOn: string | null) => { setPortalScope('read'); setBuying({ closesOn }); setClaim(null); };"));
  ok('3 the band names the closing date', S.includes("You&apos;re buying this home{buying.closesOn ? ` · closes ${closingLabel(buying.closesOn)}` : ''}"));
  const f = labelFn(S);
  ok('3 the date is the LOCAL day (Dec 18 stays Dec 18)', !!f && f('2026-12-18') === 'Dec 18, 2026' && f('') === '');
  ok('4 on or after the date: Did you close? → confirm_closing', S.includes("const due = !!buying.closesOn && buying.closesOn <= isoIn(0);") && S.includes("supabase.rpc('confirm_closing', { p_share_id: shareId })"));
  ok('4 confirmed → editable and on their account; a seller still holding → waiting', S.includes("if (r.data) { setPortalScope('edit'); setBuying(null);") && S.includes("The seller still holds this home on Ledrix"));
  ok('4 a new closing date goes to the server', S.includes("supabase.rpc('set_closing_date', { p_share_id: shareId, p_closes_on: d })"));
  ok('5 the sheet asks first when not signed in', S.includes('{!signedIn && onAnswer && !answer ? (') && S.includes('answer={claimAnswer} onAnswer={canEdit() && PORTAL_TOKEN ? setClaimAnswer : undefined}'));
  ok('5 signed in but unanswered → the question on Home', S.includes('needAnswer ? <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14 }}><ClaimQuestion cta="Claim my home" onAnswer={setClaimAnswer} /></div>'));
  ok('5 "not yet" needs a closing date', S.includes("const ok = owned === true || (owned === false && /^\\d{4}-\\d{2}-\\d{2}$/.test(date));"));
  return out;
}
const base = checks(SRC); let fail = 0;
for (const [n, v] of base) { console.log(`${v ? '✓' : '✗'} ${n}`); if (!v) fail++; }
const mutants = [
  ['the claim runs before the answer is recorded', s => s.replace("      const mine = await supabase.rpc('claim_my_reports');", "      const pre = await supabase.rpc('claim_my_reports');\n      const mine = pre;").replace("      if (canEdit() && PORTAL_TOKEN) {\n        if (!claimAnswer)", "      await supabase.rpc('claim_my_reports');\n      if (canEdit() && PORTAL_TOKEN) {\n        if (!claimAnswer)")],
  ['no answer → claims anyway', s => s.replace('if (!claimAnswer) { setNeedAnswer(true); claimTried.current = false; return; }', 'if (!claimAnswer) { setNeedAnswer(true); }')],
  ['a buyer asked again on every visit', s => s.replace("      if (st0.data?.state === 'buying') { markBuying(st0.data.closes_on ?? null); return; }\n", '')],
  ['buying stays editable', s => s.replace("const markBuying = (closesOn: string | null) => { setPortalScope('read');", "const markBuying = (closesOn: string | null) => {")],
  ['the date read as UTC', s => s.replace("return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });", "return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });")],
  ['"I closed" asked before the date', s => s.replace('const due = !!buying.closesOn && buying.closesOn <= isoIn(0);', 'const due = true;')],
  ['confirming keeps it look-only', s => s.replace("if (r.data) { setPortalScope('edit'); setBuying(null);", "if (r.data) { setBuying(null);")],
  ['the sheet skips the question', s => s.replace('{!signedIn && onAnswer && !answer ? (', '{false ? (')],
  ['"not yet" without a date', s => s.replace("const ok = owned === true || (owned === false && /^\\d{4}-\\d{2}-\\d{2}$/.test(date));", 'const ok = owned !== null;')],
];
let caught = 0;
for (const [label, f] of mutants) {
  const m = f(SRC);
  if (m === SRC) { console.log(`!! anchor missing: ${label}`); continue; }
  const dead = checks(m).some(r => !r[1]);
  console.log(`${dead ? '☠' : '!!'} mutant: ${label}`); if (dead) caught++;
}
console.log(`\n${base.length - fail}/${base.length} checks · ${caught}/${mutants.length} mutants caught`);
if (fail || caught !== mutants.length) process.exit(1);
