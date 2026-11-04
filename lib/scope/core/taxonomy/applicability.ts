// ─── applicability — is this checkpoint applicable right now, and if not, why ──────────
//
// STEP 2 of the Dynamic Inspection Scope Engine
// (docs/architecture/CONTRACT_2026-09-11_dynamic_scope_engine.md §13.H step 2).
//
// ── NOTHING IMPORTS THIS YET, AND THAT IS THE POINT ─────────────────────────────────
// Step 2 builds the rule and nothing else. No `requires` predicate is authored anywhere, no
// `InspectionExtras` field exists to answer a utility question, `isSpecNodeActive` is untouched,
// and no screen calls this. Wiring is Steps 4-8, each its own build.
//
// ── PURE, AND STRICTLY SO ───────────────────────────────────────────────────────────
// NO IMPORTS. No React, no stores, no I/O, no writers, no module state, no clock, no randomness.
// Same discipline and the same reason as `leafProgress`, `seenBy`, `expectedSet`, `findingScope`
// and `instances`: a guard can load this file and EXECUTE the shipping rule rather than grep for
// it or test a twin. `node --experimental-strip-types` runs it directly, which only works while
// the import count stays zero.
//
// The caller resolves the facts. Which node holds a spec, which key it is stored under, and where
// a utility state was recorded are all questions about stores and templates; this module decides
// only what the answers MEAN.
//
// ── IT HAS NO LOOKUP SITE, WHICH IS WHY IT CANNOT CARRY THE INSTANCE DEFECT ─────────
// Contract §9.6: `SystemsProvider.isSpecNodeActive` does `dependsOnSpecById.get(nodeId)` with no
// `baseIdOf`, so `plumb_wh_flue~i2` misses the map and silently returns permissive. That is a
// defect at the LOOKUP SITE. This function is handed the node object directly and never resolves
// an id to a node, so the defect has nowhere to live here — and the fix, when it comes, belongs to
// the caller. Step 2 deliberately does not implement instance-awareness (contract §5.3 still
// requires it; §13.H step 5 sequences it after a device reproduction).
//
// ── EVALUATED, NEVER APPLIED ────────────────────────────────────────────────────────
// This returns a verdict. It never trims, deletes, forks, saves or persists anything, and it never
// decides what a caller does with the answer. Deleting every authored predicate returns the
// product to today's behaviour byte for byte — which is what `verify:scope-engine` proves.

// ── The four verdicts (contract §4.2) ───────────────────────────────────────────────
//
//   applicable      normal                                   counted · rendered
//   not_applicable  this house has no such thing              EXCLUDED from the denominator
//   blocked         applies, but something prevented it       counted · rendered · PRINTS its cause
//   unknown         a predicate's input is unanswered         counted · rendered (permissive)
//
// BLOCKED IS NOT NOT_APPLICABLE. They differ in three independently observable ways — denominator
// membership, render, and print — and collapsing them is the single change this vocabulary exists
// to prevent. A blocked activity is work the inspector still owes an explanation for; a
// not-applicable one is work that was never owed.
export type Applicability = 'applicable' | 'not_applicable' | 'blocked' | 'unknown';

export type Utility = 'water' | 'gas' | 'power';

/** The authored predicate shapes (contract §13.C). Discriminated by which field is present, which
 *  is how they are written in the pack — there is no `kind` tag in authored JSON. */
/** `whenUnanswered: 'not_applicable'` (2026-10-15, type-driven condition cards) opts ONE predicate
 *  out of Rule 2: while its input is unanswered the node is not_applicable instead of active. It is
 *  for a checkpoint that cannot exist before the answer does — the condition card of a roof TYPE is
 *  not owed until a type is picked; the TYPE itself is what is owed (an unresolved fact on its own
 *  node). Rule 0 still runs first, so recorded work is never hidden by it. Absent = Rule 2, unchanged. */
/** `unlisted` (2026-10-15, the custom-type card) inverts the match: the predicate HOLDS when some entry
 *  of the stored multi-value contains NONE of these fragments — a value the inspector typed that no
 *  authored type card claims ("Rolled roofing"). Absent = the ordinary `includes` match, unchanged. */
/** `exact` + `origin` (2026-10-21, one rule model): a COMPANY rule compiled from Template Builder's `appliesWhen`
 *  (templates/templateRules.ts). `exact` matches whole entries of the stored value instead of fragments — the
 *  authored values are the field's own choices, and "gas" must not match "Natural Gas" by accident (2026-10-17
 *  decision 1). `origin: 'template'` tells typeConditions this is not a Ledrix per-type card. Absent = unchanged. */
export type SpecPredicate    = { specNodeId: string; includes: readonly string[]; whenUnanswered?: 'not_applicable'; unlisted?: readonly string[]; exact?: true; origin?: 'template' };
export type UtilityPredicate = { utility: Utility };
export type Predicate = SpecPredicate | UtilityPredicate;

export function isUtilityPredicate(p: Predicate): p is UtilityPredicate {
  return typeof (p as UtilityPredicate).utility === 'string';
}
export function isSpecPredicate(p: Predicate): p is SpecPredicate {
  return typeof (p as SpecPredicate).specNodeId === 'string';
}

/** Only the fields this module reads. Deliberately NOT `TaxonomyNode` — importing the pack's type
 *  would end the zero-import property for no gain, and a structural shape keeps the module usable
 *  against a template node, a pack node, or a fixture. */
export type ApplicabilityNode = {
  id: string;
  /** Schema 3, not yet authored anywhere. Absent = universal. */
  requires?: readonly Predicate[];
  /** The shipped one-predicate spec case, read as-is. 19 nodes carry it. Never rewritten. */
  dependsOnSpec?: { nodeId: string; includes: readonly string[] };
};

/**
 * Everything the resolver needs to know about the world, injected.
 *
 * `hasRecordedAssessment` is how RULING 2 reaches this module WITHOUT a store. Step 2 is
 * storage-agnostic by construction: the caller decides what counts as an assessment (today that is
 * a `conditionStateStore` entry or a finding on the node) and answers the question. Nothing here
 * knows a store exists, and nothing here may ever open one.
 *
 * `nodeExists` from contract §5.1 is deliberately ABSENT: no Step 2 rule consults it. It belongs to
 * coverage scoring, which is excluded from this step. Adding an unused fact would invite a rule to
 * grow into it quietly.
 */
export type ApplicabilityFacts = {
  /** The current value at a spec key, or undefined/null/'' when unanswered. The CALLER owns key
   *  resolution — `<id>` or `<id>::<attrId>` is a template question, not this module's. */
  specValue: (specKey: string) => string | undefined | null;
  /** The recorded availability of a utility THIS inspection, verbatim. Absent = never asked. */
  utilityState?: (utility: Utility) => string | undefined | null;
  /** RULING 2 / Rule 0. Absent = "the caller is not tracking assessments", which is treated as
   *  no assessment — the permissive reading, since Rule 0 can only move a verdict toward
   *  applicable and its absence therefore cannot hide or block anything. */
  hasRecordedAssessment?: (nodeId: string) => boolean;
};

/** Why the resolver answered as it did. Present on every result; a caller may ignore it. */
export type ApplicabilityReason =
  | 'recorded-assessment'   // Rule 0
  | 'no-predicates'         // Rule 1
  | 'spec-excluded'         // Rule 3
  | 'utility-unavailable'   // Rule 4
  | 'input-unanswered'      // Rule 2, nothing determined
  | 'input-required'        // Rule 2 opted out (whenUnanswered) — nothing to assess until answered
  | 'all-predicates-hold';

export type ApplicabilityResult = {
  state: Applicability;
  reason: ApplicabilityReason;
  /** Set only on `blocked` — which utility, so the disclosure can name it (contract §4.2:
   *  "prints with its cause"). A verdict that cannot say why must never reach a report. */
  cause?: Utility;
  /** Predicates ignored under Rule 2 because their input was unanswered. Reported rather than
   *  discarded so a caller can distinguish a FULLY DETERMINED verdict from one taken while
   *  something was still unknown. See OPEN QUESTION below — this is the field that makes that
   *  question answerable later without changing the rule now. */
  pending?: readonly Predicate[];
};

// ── UTILITY VOCABULARY (contract §1.2) ──────────────────────────────────────────────
//
// 'On' | 'Off at meter' | 'Off — vacant' | 'Not determined'
//
// THREE CLASSES, AND THE THIRD IS THE ONE WORTH ARGUING ABOUT:
//
//   available    'On'                          — the predicate holds
//   unavailable  'Off at meter' · 'Off — vacant' — the predicate FAILS, and that is a blocked cause
//   unanswered   everything else, INCLUDING 'Not determined' and any value this module does not
//                recognise — Rule 2 ignores it
//
// 'Not determined' is a recorded NON-ANSWER, not a recorded absence. The inspector is saying they
// could not establish the state, which is not evidence that anything prevented work. Blocking on it
// would put "could not be tested — water off" into a client report on the strength of a shrug.
//
// AND AN UNRECOGNISED VALUE IS UNANSWERED, NEVER UNAVAILABLE. If the vocabulary grows and this
// module has not been taught the new value, the conservative failure is to do nothing. The
// alternative — "anything that is not 'On' means off" — would make every future vocabulary
// addition silently start blocking scope. Same convention as every other applicability mechanism
// in this codebase: absent, unset or unrecognised is permissive, never the new behaviour.
const UTILITY_AVAILABLE = ['on'];
const UTILITY_UNAVAILABLE = ['off at meter', 'off — vacant', 'off - vacant', 'off vacant'];

/** Exposed so a guard can assert the vocabulary this module actually recognises, rather than
 *  restating it and drifting. */
export const UTILITY_VOCABULARY = {
  available: UTILITY_AVAILABLE,
  unavailable: UTILITY_UNAVAILABLE,
} as const;

const norm = (v: string | undefined | null): string => (v == null ? '' : String(v).trim().toLowerCase());

type UtilityReading = 'available' | 'unavailable' | 'unanswered';

function readUtility(raw: string | undefined | null): UtilityReading {
  const v = norm(raw);
  if (!v) return 'unanswered';
  if (UTILITY_AVAILABLE.includes(v)) return 'available';
  if (UTILITY_UNAVAILABLE.includes(v)) return 'unavailable';
  return 'unanswered';
}

/** The shipped matching rule, unchanged: case-insensitive SUBSTRING containment of any include.
 *  Lifted in behaviour from `SystemsProvider.isSpecNodeActive` — "Tank — Natural Gas" contains
 *  "gas". Substring, not equality, is deliberate and load-bearing: the authored includes are
 *  fragments ('crawlspace', 'pier & beam', 'gas') matched against whole picker values. */
export function specHolds(value: string, includes: readonly string[]): boolean {
  const lower = norm(value);
  for (const inc of includes) {
    if (lower.includes(norm(inc))) return true;
  }
  return false;
}

/** The entries of a stored multi-value (SPEC_DELIM ', ') that contain none of `claimed` — what an
 *  `unlisted` predicate is about. Same substring rule as specHolds, applied per entry. */
export function unlistedEntries(value: string | null | undefined, claimed: readonly string[]): string[] {
  return String(value ?? '').split(',').map(v => v.trim()).filter(v => v && !specHolds(v, claimed));
}

/** Does one spec predicate hold for an answered value? `includes`, or — when authored — `unlisted`. */
export function specPredicateHolds(value: string, p: { includes?: readonly string[]; unlisted?: readonly string[]; exact?: true }): boolean {
  if (p.exact === true) {
    // WHOLE ENTRIES, either way round: an entry equal to a listed value, or (when `unlisted` is authored) an entry
    // equal to none of the field's choices — what the inspector typed under Other. Same SPEC_DELIM split as
    // unlistedEntries, same case/space normalisation as everything else here.
    const entries = String(value ?? '').split(',').map(norm).filter(Boolean);
    const inc = (p.includes ?? []).map(norm);
    if (entries.some(e => inc.includes(e))) return true;
    if (Array.isArray(p.unlisted)) { const opts = p.unlisted.map(norm); return entries.some(e => !opts.includes(e)); }
    return false;
  }
  if (Array.isArray(p.unlisted)) return unlistedEntries(value, p.unlisted).length > 0;
  return specHolds(value, p.includes ?? []);
}

/** Every predicate on a node, in one list: authored `requires` first, then the shipped
 *  `dependsOnSpec` normalised into the same shape. `dependsOnSpec` is READ, never rewritten and
 *  never migrated — contract §9.7: "generalize the mechanism; leave the 19 authored entries exactly
 *  where they are." */
export function predicatesOf(node: ApplicabilityNode | null | undefined): Predicate[] {
  const out: Predicate[] = [];
  for (const p of node?.requires ?? []) out.push(p);
  const dep = node?.dependsOnSpec;
  if (dep && typeof dep.nodeId === 'string' && Array.isArray(dep.includes)) {
    out.push({ specNodeId: dep.nodeId, includes: dep.includes });
  }
  return out;
}

/**
 * The resolver.
 *
 * ── THE RULES, IN THE CONTRACT'S ORDER (§5.2) ───────────────────────────────────────
 *
 *   0. A RECORDED INSPECTOR ASSESSMENT OUTRANKS THE DERIVATION. Checked first; returns
 *      `applicable` and stops. (RULING 2, 2026-09-11.)
 *   1. No predicates                     -> applicable
 *   2. A predicate whose input is unanswered -> IGNORED (never hide or block prematurely)
 *      — unless that predicate opts out with `whenUnanswered: 'not_applicable'` (2026-10-15)
 *   3. Any spec predicate failing        -> not_applicable
 *   4. Any utility predicate failing     -> blocked, carrying the failing utility as `cause`
 *   5. not_applicable OUTRANKS blocked
 *
 * Rule 5 is why every predicate is evaluated before anything is returned: a short-circuit on the
 * first failing utility would report `blocked` for a component this house does not have, which is
 * the page of spurious disclosures the rule exists to prevent.
 *
 * Rule 0 can only ever move a verdict TOWARD applicable. It cannot manufacture a `blocked` and it
 * cannot hide a node, so it cannot suppress scope — the direction this engine is allowed to fail
 * in. Its absence (a caller that does not supply `hasRecordedAssessment`) is therefore safe.
 *
 * ── A PROVISIONAL BLOCK — RULED 2026-09-12, and the rule is NOT in this file ─────────
 * A node with BOTH an unanswered spec predicate AND a failing utility predicate resolves to
 * `blocked` under the rules exactly as approved: Rule 2 ignores the unanswered spec, and Rule 4
 * fires. Concretely: gas is off, and nobody has yet recorded whether the range is gas or electric.
 *
 * That was carried here as an open question, because suppressing it would have been a SIXTH rule
 * and inventing one would be exactly the silent scope change this design forbids. It is now
 * settled (owner ruling, `DECISIONS.md` 2026-09-12):
 *
 *   THE RESOLVER STAYS LITERAL. It returns `blocked` and names what is still unanswered in
 *   `result.pending`. THE PROPOSAL SHEET decides disclosability, filtering on
 *   `pending.length === 0`. A provisional block stays blocked everywhere else — in the
 *   denominator, visible in Scope — it is simply not yet printable in front of a client.
 *
 * "Is this activity prevented?" is a question about the house, and it is this module's. "Is this
 * ready to print?" is a question about evidence sufficiency, and it is policy. Two questions, two
 * layers, and only one of them lives here.
 *
 * ⚠ `result.pending` IS THEREFORE LOAD-BEARING, NOT DIAGNOSTIC. It is the sheet's filter input.
 * Failing to populate it silently makes every provisional block disclosable.
 */
export function resolveApplicability(
  node: ApplicabilityNode | null | undefined,
  facts: ApplicabilityFacts,
): ApplicabilityResult {
  // ── Rule 0 ──
  if (node?.id && facts.hasRecordedAssessment?.(node.id) === true) {
    return { state: 'applicable', reason: 'recorded-assessment' };
  }

  const predicates = predicatesOf(node);

  // ── Rule 1 ──
  if (predicates.length === 0) {
    return { state: 'applicable', reason: 'no-predicates' };
  }

  const pending: Predicate[] = [];
  let excluded = false;                     // Rule 3 fired
  let blockedBy: Utility | undefined;       // Rule 4 fired
  let required = false;                     // an opted-out predicate is unanswered

  for (const p of predicates) {
    if (isSpecPredicate(p)) {
      const raw = facts.specValue(p.specNodeId);
      const val = norm(raw);
      if (!val) {
        if (p.whenUnanswered === 'not_applicable') { required = true; continue; }  // Rule 2, opted out
        pending.push(p); continue;                                                // Rule 2
      }
      if (!specPredicateHolds(val, p)) excluded = true;  // Rule 3
      continue;
    }
    if (isUtilityPredicate(p)) {
      const reading = readUtility(facts.utilityState?.(p.utility));
      if (reading === 'unanswered') { pending.push(p); continue; }  // Rule 2
      // FIRST failing utility names the cause. A node depending on two unavailable utilities is
      // blocked once, by the first authored subject — contract §14.6 owns whether a multi-cause
      // verdict is needed, and answering it here would pre-empt that ruling.
      if (reading === 'unavailable' && blockedBy === undefined) blockedBy = p.utility;  // Rule 4
      continue;
    }
    // A predicate shape this module does not understand is IGNORED, not guessed at. Same
    // conservative default as an unrecognised utility value: a malformed or future predicate must
    // never be the reason scope narrowed.
    pending.push(p);
  }

  // ── Rule 5 — not_applicable outranks blocked ──
  if (excluded) {
    return { state: 'not_applicable', reason: 'spec-excluded', ...(pending.length ? { pending } : {}) };
  }
  if (required) {
    return { state: 'not_applicable', reason: 'input-required', ...(pending.length ? { pending } : {}) };
  }
  if (blockedBy !== undefined) {
    return { state: 'blocked', reason: 'utility-unavailable', cause: blockedBy, ...(pending.length ? { pending } : {}) };
  }
  if (pending.length > 0) {
    return { state: 'unknown', reason: 'input-unanswered', pending };
  }
  return { state: 'applicable', reason: 'all-predicates-hold' };
}

/**
 * The collapse onto today's boolean (contract §4.2): `state !== 'not_applicable'`.
 *
 * This is the whole of the backward-compatibility claim, written once so the Step 6 wrapper and
 * every guard read the same rule. `blocked` and `unknown` both collapse to ACTIVE: a blocked
 * checkpoint is still in the denominator and still on screen, and an unanswered predicate has
 * never hidden anything.
 *
 * Nothing imports it yet.
 */
export function collapseToActive(state: Applicability): boolean {
  return state !== 'not_applicable';
}
