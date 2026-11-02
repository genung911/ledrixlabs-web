// ─── Is this leaf answered? One function, so no two counters can disagree ───────────
//
// This module exists because the same bug shipped three times in one week, each time as a
// count that disagreed with the drawer sitting directly under it:
//
//   · Openings tile 7/8   vs  7/7 REVIEWED + 4/4 SPECS SET   (Window Type takes no condition)
//   · Drain·Waste·Vent 5/6 vs  6/6 REVIEWED                   (finding matched by label, not id)
//   · AC System Type 0/1  vs  1/1 SPECS SET, value on screen  (see LOGGED IS NOT A VERDICT)
//
// Every one of them was a leaf that HAD been answered being measured by a test it could not
// pass. Keeping the rule in a React callback is what let it drift — a callback can't be
// exercised, so each fix was verified by building the app and looking at it.
//
// ── LOGGED IS NOT A VERDICT ────────────────────────────────────────────────────────
//
// The 2026-08-15 case is the one worth remembering. Picking a spec chip emits a `logged`
// systems event, so choosing "Split System" put the node on status 'logged'. The old branch
// order tested status FIRST, matched 'logged', and short-circuited past the spec check —
// which is the ONLY route a description-only component has to completion. ANSWERING THE
// COMPONENT IS WHAT STOPPED IT COUNTING, and every description-only leaf in the app was
// permanently one short.
//
// So: 'logged' means "Ledrix has touched this", never "this is unanswered." It can only ever
// break a tie among leaves with NO answer. Evidence of an answer outranks it.
//
// Pure: no React, no stores, no I/O. The caller resolves the three facts (which nodes to read
// is its problem — a component's condition and its spec can live on two different nodes) and
// this decides what they mean.

/** What the caller has already established about one leaf. */
export type LeafFacts = {
  /** The reducer's own status for this node, if it has one. */
  status?: string | null;
  /** Has a condition state been recorded against it (an OK, a limitation, a state pick)? */
  assessed: boolean;
  /** Is EVERY one of its spec fields filled with a real value? A component with nothing to
   *  describe is `false` here — it must reach a verdict some other way, not by vacuous truth. */
  described: boolean;
};

/** `verified` counts toward done · `logged` is Ledrix-touched-but-open · `open` is untouched. */
export type LeafVerdict = 'verified' | 'logged' | 'open';

const TERMINAL = new Set(['verified', 'defect', 'limitation']);

export function leafVerdict(f: LeafFacts): LeafVerdict {
  // A terminal status is an explicit human verdict — it wins outright.
  if (f.status && TERMINAL.has(f.status)) return 'verified';
  // EVIDENCE OF AN ANSWER OUTRANKS A TOUCH MARKER. This line is the whole fix: it sits ABOVE
  // the 'logged' test, so a described spec or a recorded condition can never be short-circuited
  // by the very event that recorded it.
  if (f.assessed || f.described) return 'verified';
  if (f.status === 'logged') return 'logged';
  return 'open';
}
