// ─── templateDraft — a company's PRIVATE template draft (Template Builder, increment 2, 2026-10-17) ─────────
//
// A draft is a full copy of one company template that only the Template Builder reads. Inspections, Scope,
// snapshots, reports and cloud sync never see it — they keep reading the LIVE template, which nothing here
// writes. Owner ruling 2026-10-17: AI applies approved changes to a DRAFT and never publishes; publishing is a
// later increment, so in this one a draft has no path back into the live template at all.
//
// Every change reaches the draft as a CHANGE SET (templateChangeSets): proposed → reviewed → applied, all or
// nothing, validated, anchored, provenance recorded, undoable. The proposal under review (`pending`) is kept in
// the draft too, so a review survives the app closing.
//
// PURE — no store, no clock, no ids minted. templateDraftStore persists it; templateAuthoringService fills
// `pending`.
import type { InspectionTemplate } from './InspectionTemplate';
import { templateHash } from './templateOps';
import {
  applyChangeSet, rollbackChangeSet, markReverted, latestProvenance,
  type ChangeSet, type ProvenanceEntry, type ApplyCsResult,
} from './templateChangeSets';

export const DRAFT_VERSION = 1;

export type TemplateDraft = {
  v: typeof DRAFT_VERSION;
  companyId: string;
  templateId: string;              // the live template this was copied from
  name: string;
  createdAt: number;
  updatedAt: number;
  /** templateHash of the LIVE template when the draft was made. If the live template moves on (manual edits
   *  still go live until publishing exists), the draft says so; nothing is merged automatically. */
  sourceRevision: string;
  tree: InspectionTemplate;
  /** Applied change sets in order, undos included. */
  log: ChangeSet[];
  provenance: ProvenanceEntry[];
  /** The change set under review, not yet applied. */
  pending: ChangeSet | null;
};

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function createDraft(args: { companyId: string; templateId: string; live: InspectionTemplate; now: number }): TemplateDraft {
  return {
    v: DRAFT_VERSION, companyId: args.companyId, templateId: args.templateId, name: args.live.name || 'Template',
    createdAt: args.now, updatedAt: args.now, sourceRevision: templateHash(args.live),
    tree: clone(args.live), log: [], provenance: [], pending: null,
  };
}

export const draftRevision = (d: TemplateDraft): string => templateHash(d.tree);

/** Has the live template changed since this draft was copied from it? */
export const liveChangedSince = (d: TemplateDraft, live: InspectionTemplate): boolean => templateHash(live) !== d.sourceRevision;

/** Is `x` a draft this version can read? Anything else is refused, never coerced. */
export function isTemplateDraft(x: unknown): x is TemplateDraft {
  const d = x as TemplateDraft;
  return !!d && typeof d === 'object' && d.v === DRAFT_VERSION && typeof d.companyId === 'string' && typeof d.templateId === 'string'
    && typeof d.sourceRevision === 'string' && !!d.tree && Array.isArray(d.tree.systems) && Array.isArray(d.log)
    && Array.isArray(d.provenance) && (d.pending === null || (typeof d.pending === 'object' && Array.isArray(d.pending.entries)));
}

export function setPending(d: TemplateDraft, cs: ChangeSet | null, now: number): TemplateDraft {
  if (cs && cs.appliedAt !== undefined) throw new Error('an applied change set cannot be pending');
  return { ...d, pending: cs, updatedAt: now };
}

export type DraftResult = { ok: true; draft: TemplateDraft } | Extract<ApplyCsResult, { ok: false }>;

/** Apply a reviewed change set to the draft (normally `pending`). Only accepted/edited entries apply, all or
 *  nothing; a draft that changed since the proposal is refused unless `allowRebase` (templateChangeSets). */
export function applyToDraft(d: TemplateDraft, cs: ChangeSet, now: number, opts: { allowRebase?: boolean } = {}): DraftResult {
  if (cs.source === 'rollback') return { ok: false, code: 'invalid', error: 'an undo is applied with undoInDraft' };
  const r = applyChangeSet(d.tree, cs, now, opts);
  if ('error' in r) return r;
  return {
    ok: true,
    draft: {
      ...d, tree: r.tpl, log: [...d.log, r.cs], provenance: [...d.provenance, ...r.provenance], updatedAt: now,
      pending: d.pending && d.pending.id === cs.id ? null : d.pending,
    },
  };
}

/** Undo one applied change set: a NEW change set of its inverses, refused if later work touched the same items. */
export function undoInDraft(d: TemplateDraft, changeSetId: string, args: { id: string; author: ChangeSet['author']; now: number }): DraftResult {
  const i = d.log.findIndex(c => c.id === changeSetId);
  if (i < 0) return { ok: false, code: 'invalid', error: 'that change is not in this draft' };
  const original = d.log[i];
  if (original.source === 'rollback') return { ok: false, code: 'invalid', error: 'an undo cannot be undone from history; ask for the change again' };
  if (!original.entries.some(e => e.status === 'applied')) return { ok: false, code: 'invalid', error: 'that change was already undone' };
  const undo = rollbackChangeSet(original, { id: args.id, author: args.author, base: d.tree, now: args.now });
  if ('errors' in undo) return { ok: false, code: 'invalid', error: undo.errors.map(e => e.error).join(' ') };
  const r = applyChangeSet(d.tree, undo.cs, args.now);
  if ('error' in r) return r;
  const log = d.log.map((c, k) => (k === i ? markReverted(c, r.cs) : c));
  return { ok: true, draft: { ...d, tree: r.tpl, log: [...log, r.cs], provenance: [...d.provenance, ...r.provenance], updatedAt: args.now } };
}

export type HistoryItem = { id: string; source: ChangeSet['source']; at: number; applied: number; reverted: boolean; revertOf?: string; systems: string[] };

/** The draft's history, newest first, for the Draft screen. */
export function draftHistory(d: TemplateDraft): HistoryItem[] {
  const sysOf = (id: string): string | null => {
    for (const s of d.tree.systems) { const w = (n: any): boolean => n.id === id || (n.children ?? []).some(w) || (n.trimmed ?? []).some(w); if (w(s)) return s.label; }
    return null;
  };
  return [...d.log].reverse().map(c => ({
    id: c.id, source: c.source, at: c.appliedAt ?? c.createdAt,
    applied: c.entries.filter(e => e.status === 'applied' || e.status === 'reverted').length,
    reverted: c.entries.some(e => e.status === 'reverted'),
    ...(c.revertOf ? { revertOf: c.revertOf } : {}),
    systems: [...new Set(c.entries.map(e => { const op: any = e.edited ?? e.op; return sysOf(op.nodeId ?? op.parentId ?? op.pointerId ?? ''); }).filter((x): x is string => !!x))],
  }));
}

/** Who last set each item/field in the draft. */
export const draftProvenance = (d: TemplateDraft) => latestProvenance(d.provenance);
