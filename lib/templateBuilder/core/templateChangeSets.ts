// ─── templateChangeSets — review, provenance and rollback (Template Builder, increment 1) ───────────────────
//
// A CHANGE SET is a batch of operations from one source — the owner, Ledrix's AI, an onboarding answer, a Ledrix
// default update, an inspector's suggestion, an import, or an undo. Every entry starts PROPOSED. Only entries a
// person accepted (or edited, then accepted) are ever applied, and applying is all-or-nothing.
//
// OWNER RULINGS THIS ENCODES (2026-10-17):
//   · AI may draft a whole section or template, but never silently applies to the company draft. Nothing here
//     applies an entry whose status is not `accepted` or `edited`.
//   · Batch review AND field-level inspection. `acceptAllContent` accepts CONTENT entries only; a POLICY entry
//     (what is inspected, when, what the report discloses) must be accepted on its own, by `setStatus`. The class
//     is decided by rule (templateOps.classifyOp), never by the producer.
//   · Rollback never rewrites history: it is a NEW change set of inverse ops, linked by `revertOf`, and it goes
//     through the same conflict checks as anything else.
//   · Publishing is NOT here. Applying a change set changes a DRAFT; publishing a draft is a separate, owner-
//     approved step (decision 8: owner-only by default, a company setting may authorize managers; editing a
//     draft or submitting a proposal never grants it).
//
// PURE: no store, no clock, no ids minted here — the caller passes `now` and ids, so the same inputs always give
// the same change set.
import type { InspectionTemplate } from './InspectionTemplate';
import { applyOp, classifyOp, templateHash, provenanceKeys, parseOp, storageFields, STORAGE_SOURCES, withExpect, isUnanchoredAppend, type TemplateOp, type OpClass } from './templateOps';
import { validateTemplate } from './templateValidate';

export type ChangeSource = 'manual' | 'ai' | 'onboarding' | 'ledrix_update' | 'inspector_suggestion' | 'import' | 'rollback';
export type EntryStatus = 'proposed' | 'accepted' | 'edited' | 'declined' | 'applied' | 'reverted';

export type ChangeEntry = {
  id: string;
  op: TemplateOp;                  // as proposed — kept even when edited, so review shows what was asked
  edited?: TemplateOp;             // the reviewer's version; applied instead of `op`
  rationale?: string;              // required from AI (see createChangeSet)
  status: EntryStatus;
  class: OpClass;
  classReason: string;
  inverse?: TemplateOp;            // set when applied
  warnings?: string[];             // shown in review (e.g. "inspections do not use this yet"); never block
};

/** Something a producer proposed that never became an entry — kept on the change set so review shows it and the
 *  record says what was refused and why. It can never be accepted. */
export type RefusedProposal = { index: number; error: string; rationale?: string; op?: unknown };

export type ChangeSet = {
  id: string;
  source: ChangeSource;
  author: { userId: string | null; role?: string };
  ai?: { model: string; promptRef?: string; request?: string; summary?: string; systemId?: string };
  /** `setup` is the guided setup's record of its questions (templateSetup.SetupRecord); opaque here. */
  onboarding?: { questionId: string; setup?: unknown };
  baseRevision: string;            // templateHash of the draft it was proposed against
  createdAt: number;
  entries: ChangeEntry[];
  revertOf?: string;
  refused?: RefusedProposal[];
  appliedAt?: number;
  resultRevision?: string;
};

export type ProvenanceEntry = { key: string; changeSetId: string; entryId: string; source: ChangeSource; at: number };

const ROLLBACK_ONLY = new Set(['unaddNode', 'reinsertNode']);

export type CreateResult = { ok: true; cs: ChangeSet } | { ok: false; errors: Array<{ index: number; error: string }> };

/** Build a change set from raw ops. Every op is parsed strictly; an AI change set must give a rationale per op.
 *  Classes are computed against the base, by rule. */
export function createChangeSet(args: {
  id: string; source: ChangeSource; author: ChangeSet['author']; base: InspectionTemplate; now: number;
  ops: Array<{ op: unknown; rationale?: string; warnings?: string[] }>; ai?: ChangeSet['ai']; onboarding?: ChangeSet['onboarding']; revertOf?: string;
  refused?: RefusedProposal[];
}): CreateResult {
  const errors: Array<{ index: number; error: string }> = [];
  if (args.source === 'ai' && !args.ai?.model) errors.push({ index: -1, error: 'an AI change set must name its model' });
  if (args.source === 'onboarding' && !args.onboarding?.questionId) errors.push({ index: -1, error: 'an onboarding change set must name its question' });
  if (args.source === 'rollback' && !args.revertOf) errors.push({ index: -1, error: 'an undo must name the change set it reverts' });
  const entries: ChangeEntry[] = [];
  // Each op is ANCHORED to the draft as it will stand when that op runs (the base plus the ops before it), so a
  // later change to the same field or position is caught even when the producer gave no `expect`.
  let sim = args.base;
  args.ops.forEach((o, index) => {
    const p = parseOp(o.op);
    if ('error' in p) { errors.push({ index, error: p.error }); return; }
    if (ROLLBACK_ONLY.has(p.op.op) && args.source !== 'rollback') { errors.push({ index, error: 'only an undo can remove an added item outright or put one back verbatim' }); return; }
    if (storageFields(p.op).length && !(STORAGE_SOURCES as readonly string[]).includes(args.source)) { errors.push({ index, error: 'legacyBareKey decides where answers are stored; only Ledrix sets it' }); return; }
    if (args.source === 'ai' && !o.rationale?.trim()) { errors.push({ index, error: 'an AI proposal must say why' }); return; }
    const c = classifyOp(p.op, sim);
    const anchored = withExpect(sim, p.op);
    const step = applyOp(sim, anchored);
    if (step.ok) sim = step.tpl;
    entries.push({ id: `${args.id}:${index}`, op: anchored, ...(o.rationale ? { rationale: o.rationale } : {}), ...(o.warnings?.length ? { warnings: o.warnings } : {}), status: 'proposed', class: c.class, classReason: c.reason });
  });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    cs: {
      id: args.id, source: args.source, author: args.author, baseRevision: templateHash(args.base), createdAt: args.now, entries,
      ...(args.ai ? { ai: args.ai } : {}), ...(args.onboarding ? { onboarding: args.onboarding } : {}), ...(args.revertOf ? { revertOf: args.revertOf } : {}),
      ...(args.refused?.length ? { refused: args.refused } : {}),
    },
  };
}

const reviewable = (e: ChangeEntry) => e.status === 'proposed' || e.status === 'accepted' || e.status === 'edited' || e.status === 'declined';
const withEntry = (cs: ChangeSet, id: string, f: (e: ChangeEntry) => ChangeEntry | null): ChangeSet | null => {
  if (cs.appliedAt !== undefined) return null;
  let hit = false;
  const entries = cs.entries.map(e => { if (e.id !== id) return e; const n = f(e); if (n) hit = true; return n ?? e; });
  return hit ? { ...cs, entries } : null;
};

/** Field-level decision on ONE entry. Returns null if the entry is unknown or the set is already applied. */
export function setStatus(cs: ChangeSet, entryId: string, status: 'accepted' | 'declined' | 'proposed'): ChangeSet | null {
  return withEntry(cs, entryId, e => (!reviewable(e) ? null : { ...e, status: status === 'accepted' && e.edited ? 'edited' : status }));
}

/** The reviewer rewrites an entry. Re-parsed and RE-CLASSIFIED — editing a label into a scope change makes it
 *  policy. The edited entry counts as accepted. */
export function editEntry(cs: ChangeSet, entryId: string, op: unknown, base: InspectionTemplate): { ok: true; cs: ChangeSet } | { ok: false; error: string } {
  const p = parseOp(op);
  if ('error' in p) return { ok: false, error: p.error };
  if (ROLLBACK_ONLY.has(p.op.op)) return { ok: false, error: 'only an undo can remove an added item outright or put one back verbatim' };
  if (storageFields(p.op).length) return { ok: false, error: 'legacyBareKey decides where answers are stored; only Ledrix sets it' };
  // Anchor the edit to the draft as it will stand when this entry runs: the base plus the entries before it.
  let sim = base;
  for (const e of cs.entries) { if (e.id === entryId) break; const r = applyOp(sim, e.edited ?? e.op); if (r.ok) sim = r.tpl; }
  const anchored = withExpect(sim, p.op);
  const c = classifyOp(anchored, sim);
  const next = withEntry(cs, entryId, e => (!reviewable(e) ? null : { ...e, edited: anchored, status: 'edited', class: c.class, classReason: c.reason }));
  return next ? { ok: true, cs: next } : { ok: false, error: 'that entry cannot be edited' };
}

/** Batch review: accept every PROPOSED content entry (optionally only those matching `filter`, e.g. one
 *  section). Policy entries are left exactly as they are — each needs its own decision. */
export function acceptAllContent(cs: ChangeSet, filter?: (e: ChangeEntry) => boolean): ChangeSet {
  if (cs.appliedAt !== undefined) return cs;
  return { ...cs, entries: cs.entries.map(e => (e.status === 'proposed' && e.class === 'content' && (!filter || filter(e)) ? { ...e, status: 'accepted' } : e)) };
}

/**
 * BATCH ACCEPT THAT NEVER ACCEPTS WHAT CANNOT APPLY (2026-10-17, increment 2). Walks the entries in order over a
 * preview of the draft with the already-accepted entries applied; each PROPOSED content entry (matching `filter`)
 * is accepted only if it applies there and introduces no validation error — e.g. guidance on a card whose own
 * addition (policy) is still undecided is SKIPPED, with the reason. Policy entries are never touched.
 */
export function acceptContentChecked(cs: ChangeSet, base: InspectionTemplate, filter?: (e: ChangeEntry) => boolean):
  { cs: ChangeSet; accepted: string[]; skipped: Array<{ entryId: string; reason: string }> } {
  if (cs.appliedAt !== undefined) return { cs, accepted: [], skipped: [] };
  const keyOf = (i: { code: string; nodeId?: string; message: string }) => `${i.code}|${i.nodeId ?? ''}|${i.message}`;
  let sim = base;
  let errs = new Set(validateTemplate(base).filter(i => i.severity === 'error').map(keyOf));
  const accepted: string[] = []; const skipped: Array<{ entryId: string; reason: string }> = [];
  const entries = cs.entries.map(e => {
    const chosen = e.status === 'accepted' || e.status === 'edited';
    const candidate = e.status === 'proposed' && e.class === 'content' && (!filter || filter(e));
    if (!chosen && !candidate) return e;
    const r = applyOp(sim, e.edited ?? e.op);
    let reason = 'error' in r ? r.error.message : null;
    let nextErrs = errs;
    if (!reason && r.ok) {
      const after = validateTemplate(r.tpl).filter(i => i.severity === 'error');
      const mine = after.filter(i => !errs.has(keyOf(i)));
      if (mine.length) reason = mine.map(i => i.message).join(' ');
      else nextErrs = new Set(after.map(keyOf));
    }
    if (reason) { if (candidate) skipped.push({ entryId: e.id, reason }); return e; }
    if (r.ok) { sim = r.tpl; errs = nextErrs; }
    if (candidate) { accepted.push(e.id); return { ...e, status: 'accepted' as const }; }
    return e;
  });
  return { cs: { ...cs, entries }, accepted, skipped };
}

/** For review: every accepted/edited entry that cannot apply right now (in order, over the draft), with why. */
export function acceptedProblems(cs: ChangeSet, base: InspectionTemplate): Map<string, string> {
  const out = new Map<string, string>();
  const keyOf = (i: { code: string; nodeId?: string; message: string }) => `${i.code}|${i.nodeId ?? ''}|${i.message}`;
  let sim = base;
  let errs = new Set(validateTemplate(base).filter(i => i.severity === 'error').map(keyOf));
  for (const e of cs.entries) {
    if (e.status !== 'accepted' && e.status !== 'edited') continue;
    const r = applyOp(sim, e.edited ?? e.op);
    if ('error' in r) { out.set(e.id, r.error.message); continue; }
    const after = validateTemplate(r.tpl).filter(i => i.severity === 'error');
    const mine = after.filter(i => !errs.has(keyOf(i)));
    if (mine.length) { out.set(e.id, mine.map(i => i.message).join(' ')); continue; }
    sim = r.tpl; errs = new Set(after.map(keyOf));
  }
  return out;
}

export type ApplyCsResult =
  | { ok: true; tpl: InspectionTemplate; cs: ChangeSet; provenance: ProvenanceEntry[]; rebased: boolean }
  | { ok: false; code: 'stale_draft' | 'conflict' | 'invalid' | 'nothing' | 'applied'; entryId?: string; error: string };

/** Apply the accepted/edited entries to `draft`, in order, all or nothing. Refuses on a conflict (an `expect`
 *  that no longer matches), on any op that fails, and on any NEW validation error — the draft is never left
 *  half-changed or invalid. Proposed and declined entries are not applied (and stay as they were). */
/**
 * STALE DRAFTS (remediation 2026-10-17). If the draft is no longer the one the change set was proposed against,
 * it is refused (`stale_draft`) — the reviewer saw a before/after that no longer exists. A caller may pass
 * `allowRebase` to apply it anyway, and then EVERY chosen op must carry an `expect` (createChangeSet stamps one
 * on each), so each op is checked against what it would change; an append is the only op allowed without one.
 * A change set built by hand, with unanchored ops, is never rebased.
 */
export function applyChangeSet(draft: InspectionTemplate, cs: ChangeSet, now: number, opts: { allowRebase?: boolean } = {}): ApplyCsResult {
  if (cs.appliedAt !== undefined) return { ok: false, code: 'applied', error: 'this change set was already applied' };
  const chosen = cs.entries.filter(e => e.status === 'accepted' || e.status === 'edited');
  if (!chosen.length) return { ok: false, code: 'nothing', error: 'nothing has been accepted' };
  const rebased = templateHash(draft) !== cs.baseRevision;
  if (rebased) {
    if (!opts.allowRebase) return { ok: false, code: 'stale_draft', error: 'The draft changed after this was proposed. Review it again before applying.' };
    const loose = chosen.find(e => { const op = e.edited ?? e.op; return (op as { expect?: string }).expect === undefined && !isUnanchoredAppend(op); });
    if (loose) return { ok: false, code: 'stale_draft', entryId: loose.id, error: 'The draft changed after this was proposed, and this change cannot be checked against it. Review it again.' };
  }
  const before = new Set(validateTemplate(draft).filter(i => i.severity === 'error').map(i => `${i.code}|${i.nodeId ?? ''}|${i.message}`));
  let cur = draft;
  const inverses = new Map<string, TemplateOp>();
  for (const e of chosen) {
    const op = e.edited ?? e.op;
    if (ROLLBACK_ONLY.has(op.op) && cs.source !== 'rollback') return { ok: false, code: 'invalid', entryId: e.id, error: 'only an undo can remove an added item outright or put one back verbatim' };
    const r = applyOp(cur, op);
    if ('error' in r) return { ok: false, code: r.error.code === 'conflict' ? 'conflict' : 'invalid', entryId: e.id, error: r.error.message };
    cur = r.tpl; inverses.set(e.id, r.inverse);
  }
  const introduced = validateTemplate(cur).filter(i => i.severity === 'error' && !before.has(`${i.code}|${i.nodeId ?? ''}|${i.message}`));
  if (introduced.length) return { ok: false, code: 'invalid', error: introduced.map(i => i.message).join(' ') };
  const provenance: ProvenanceEntry[] = chosen.flatMap(e => provenanceKeys(e.edited ?? e.op).map(key => ({ key, changeSetId: cs.id, entryId: e.id, source: cs.source, at: now })));
  return {
    ok: true, tpl: cur, provenance, rebased,
    cs: { ...cs, appliedAt: now, resultRevision: templateHash(cur), entries: cs.entries.map(e => (inverses.has(e.id) ? { ...e, status: 'applied', inverse: inverses.get(e.id) } : e)) },
  };
}

/** An undo of an applied change set: a NEW change set of its inverses, last first, already accepted (asking to
 *  undo is the decision). Applying it is still checked — if a later change touched the same field, the undo is
 *  refused with the reason instead of overwriting that later work. */
export function rollbackChangeSet(cs: ChangeSet, args: { id: string; author: ChangeSet['author']; base: InspectionTemplate; now: number }): CreateResult {
  if (cs.appliedAt === undefined) return { ok: false, errors: [{ index: -1, error: 'this change set was never applied' }] };
  const applied = cs.entries.filter(e => e.status === 'applied' && e.inverse);
  const r = createChangeSet({
    id: args.id, source: 'rollback', author: args.author, base: args.base, now: args.now, revertOf: cs.id,
    ops: applied.reverse().map(e => ({ op: e.inverse, rationale: `undo ${e.id}` })),
  });
  if ('errors' in r) return r;
  return { ok: true, cs: { ...r.cs, entries: r.cs.entries.map(e => ({ ...e, status: 'accepted' as const })) } };
}

/** Mark the original's entries reverted once its undo has applied. */
export function markReverted(original: ChangeSet, undo: ChangeSet): ChangeSet {
  if (undo.revertOf !== original.id || undo.appliedAt === undefined) return original;
  return { ...original, entries: original.entries.map(e => (e.status === 'applied' ? { ...e, status: 'reverted' } : e)) };
}

/** Fold provenance entries into "who last set this": latest wins. */
export function latestProvenance(entries: readonly ProvenanceEntry[]): Map<string, ProvenanceEntry> {
  const out = new Map<string, ProvenanceEntry>();
  for (const e of entries) { const prev = out.get(e.key); if (!prev || prev.at <= e.at) out.set(e.key, e); }
  return out;
}
