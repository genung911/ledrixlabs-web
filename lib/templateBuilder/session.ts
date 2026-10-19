// Desktop Template Builder — "Draft with Ledrix" end to end, in the browser.
//
// The same flow as the app's templateAuthoringService (ledrix-app src/core/services/templateAuthoringService.ts),
// over the same pure core (./core, byte-identical copies): the owner picks a system and says what should change;
// Ledrix answers with template operations; proposalFromResponse turns that untrusted reply into a change set of
// PROPOSED entries plus everything refused; the owner reviews (accept / decline / edit / accept all content);
// accepted entries are applied to the PRIVATE draft, all or nothing; any applied change can be undone.
//
// Two things differ from the app, and only these: the draft is kept in this browser (./draftStore), and the model
// is reached through the signed-in server route /api/template-authoring (the browser never holds a model key).
//
// WHAT THIS NEVER DOES: write company_templates, an inspection, an inspection's template snapshot, or anything on
// the server. There is no publish here — that is a later increment. (scripts/verify-template-builder.mjs)
//
// Every action is load → pure step → save, so the stored draft is the single source of truth.
import { buildAuthoringPrompt, proposalFromResponse } from './core/templateAuthoring';
import { setPending, applyToDraft, undoInDraft, liveChangedSince, type TemplateDraft } from './core/templateDraft';
import { setStatus, editEntry, acceptContentChecked, acceptedProblems, type ChangeSet, type ChangeEntry, type RefusedProposal } from './core/templateChangeSets';
import type { InspectionTemplate } from './core/InspectionTemplate';
import { DraftStoreError, type DraftStore } from './draftStore';
import { TEMPLATE_AUTHORING_MODEL } from './access';

export type ModelReply = { parsed: unknown; model: string; promptRef?: string };
/** Ask Ledrix. Resolves to the reply, or to an error the owner can read. */
export type ModelCall = (args: { templateId: string; systemId: string; request: string; tree: InspectionTemplate }) =>
  Promise<{ ok: true; reply: ModelReply } | { ok: false; error: string }>;
export type Author = ChangeSet['author'];

let seq = 0;
const newId = (prefix: string, now: number) => `${prefix}_${now.toString(36)}_${(seq++).toString(36)}`;

export type ProposeOutcome =
  | { ok: true; draft: TemplateDraft; cs: ChangeSet; refused: RefusedProposal[] }
  | { ok: false; error: string; refused: RefusedProposal[] };
type Review = { ok: true; draft: TemplateDraft } | { ok: false; error: string };
export type ApplyOutcome = { ok: true; draft: TemplateDraft } | { ok: false; code: string; error: string; entryId?: string };

export function createBuilderSession(args: { companyId: string; templateId: string; store: DraftStore; call: ModelCall }) {
  const { companyId, templateId, store, call } = args;

  const mustLoad = (): TemplateDraft => {
    const d = store.loadDraft(companyId, templateId);
    if (!d) throw new DraftStoreError('There is no draft for this template.');
    return d;
  };

  function startOrResume(live: InspectionTemplate, now = Date.now()): { draft: TemplateDraft; liveChanged: boolean } {
    const draft = store.openDraft(companyId, templateId, live, now);
    return { draft, liveChanged: liveChangedSince(draft, live) };
  }

  /** Ask Ledrix for changes to one system. The result replaces any unapplied proposal and is saved as `pending`. */
  async function propose(p: { systemId: string; request: string; author: Author; now?: number }): Promise<ProposeOutcome> {
    const now = p.now ?? Date.now();
    const draft = mustLoad();
    // Builds on the draft AS IT STANDS. Never throws away review work: a pending proposal holding any decision or
    // edit must be applied or dismissed first.
    if (draft.pending && draft.pending.entries.some(e => e.status !== 'proposed')) {
      return { ok: false, error: 'Apply or dismiss the changes you are reviewing first — asking again would replace them.', refused: [] };
    }
    const prompt = buildAuthoringPrompt({ tree: draft.tree, systemId: p.systemId, request: p.request });
    if ('error' in prompt) return { ok: false, error: prompt.error, refused: [] };
    let r: Awaited<ReturnType<ModelCall>>;
    try { r = await call({ templateId, systemId: p.systemId, request: p.request, tree: draft.tree }); }
    catch { return { ok: false, error: 'Ledrix could not be reached. Check the connection and try again.', refused: [] }; }
    if (!r.ok) return { ok: false, error: r.error, refused: [] };
    const res = proposalFromResponse({
      tree: draft.tree, systemId: p.systemId, request: p.request, response: r.reply.parsed,
      id: newId('ai', now), author: p.author, now, model: r.reply.model || TEMPLATE_AUTHORING_MODEL,
      promptRef: r.reply.promptRef ?? prompt.promptRef,
    });
    if (!res.ok) return res;
    // The draft may have changed in another tab while Ledrix was drafting: propose against what was sent, refuse
    // to replace a review that started meanwhile.
    const latest = mustLoad();
    if (latest.updatedAt !== draft.updatedAt) {
      return { ok: false, error: 'The draft changed in another window while Ledrix was drafting. Reload and ask again.', refused: res.refused };
    }
    const next = setPending(latest, res.cs, now);
    store.saveDraft(next);
    return { ok: true, draft: next, cs: res.cs, refused: res.refused };
  }

  function review(now: number, f: (cs: ChangeSet, d: TemplateDraft) => ChangeSet | string): Review {
    const d = mustLoad();
    if (!d.pending) return { ok: false, error: 'There is nothing waiting for review.' };
    const r = f(d.pending, d);
    if (typeof r === 'string') return { ok: false, error: r };
    const next = setPending(d, r, now);
    store.saveDraft(next);
    return { ok: true, draft: next };
  }

  /** Accept / decline / reopen one entry. Accepting is refused when the entry cannot apply over the draft with the
   *  entries already accepted before it; declining is always allowed. */
  const decide = (entryId: string, decision: 'accepted' | 'declined' | 'proposed', now = Date.now()): Review =>
    review(now, (cs, d) => {
      const next = setStatus(cs, entryId, decision);
      if (!next) return 'That change cannot be changed now.';
      if (decision === 'accepted') { const why = acceptedProblems(next, d.tree).get(entryId); if (why) return `Can't accept this yet: ${why}`; }
      return next;
    });

  const edit = (entryId: string, op: unknown, now = Date.now()): Review =>
    review(now, (cs, d) => { const r = editEntry(cs, entryId, op, d.tree); return 'error' in r ? r.error : r.cs; });

  /** Accept every proposed CONTENT entry that can apply (optionally only some, e.g. one section). Policy entries
   *  are untouched; an entry that cannot apply yet is skipped and reported, never accepted. */
  function acceptContent(filter?: (e: ChangeEntry) => boolean, now = Date.now()): Review & { skipped?: Array<{ entryId: string; reason: string }> } {
    let skipped: Array<{ entryId: string; reason: string }> = [];
    const r = review(now, (cs, d) => { const x = acceptContentChecked(cs, d.tree, filter); skipped = x.skipped; return x.cs; });
    return r.ok ? { ...r, skipped } : r;
  }

  function dismiss(now = Date.now()): Review {
    const d = mustLoad();
    const next = setPending(d, null, now);
    store.saveDraft(next);
    return { ok: true, draft: next };
  }

  /** Apply the accepted entries of the pending proposal to the draft. A draft that changed since the proposal is
   *  refused (`stale_draft`) unless `recheck` — then every entry is checked against what it would change. */
  function apply(opts: { recheck?: boolean; now?: number } = {}): ApplyOutcome {
    const now = opts.now ?? Date.now();
    const d = mustLoad();
    if (!d.pending) return { ok: false, code: 'nothing', error: 'There is nothing waiting for review.' };
    const r = applyToDraft(d, d.pending, now, { allowRebase: !!opts.recheck });
    if ('error' in r) return { ok: false, code: r.code, error: r.error, ...(r.entryId ? { entryId: r.entryId } : {}) };
    store.saveDraft(r.draft);
    return { ok: true, draft: r.draft };
  }

  function undo(changeSetId: string, author: Author, now = Date.now()): ApplyOutcome {
    const d = mustLoad();
    const r = undoInDraft(d, changeSetId, { id: newId('undo', now), author, now });
    if ('error' in r) return { ok: false, code: r.code, error: r.error };
    store.saveDraft(r.draft);
    return { ok: true, draft: r.draft };
  }

  const discard = () => store.discardDraft(companyId, templateId);

  return { startOrResume, propose, decide, edit, acceptContent, dismiss, apply, undo, discard };
}

export type BuilderSession = ReturnType<typeof createBuilderSession>;
