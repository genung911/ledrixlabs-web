'use client';

// The template editor's draft: load it, keep it, save it, publish or discard it.
//
// One working copy (the core TemplateDraft) is the single source of truth for the editor, Ledrix and the phone
// preview. Every change replaces it and is saved:
//   server mode — to the shared draft row, debounced, over the version it was loaded at; a stale save is refused
//                 and shown as a conflict (reload), never merged or retried over the top;
//   local mode  — to this browser (lib/templateBuilder/draftStore), until ledger #65 is applied.
// The draft is created on the FIRST change, so opening a template to look at it leaves nothing behind.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import { createDraft, liveChangedSince, type TemplateDraft } from '@/lib/templateBuilder/core/templateDraft';
import { createDraftStore, DraftStoreError } from '@/lib/templateBuilder/draftStore';
import { validateStructureTypes } from '@/lib/templateBuilder/core/structureTypes';
import {
  TemplateApiError, detectBackend, discardDraft, loadDraft, loadTemplate, publishDraft, saveDraft, startDraft,
  type Backend, type LiveTemplate, type ServerDraft,
} from './api';

export type SaveState = { kind: 'clean' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'saved'; at: number } | { kind: 'error'; message: string };
export type Conflict = null | 'draft' | 'base' | 'gone';

export type DraftModel = {
  backend: Backend;
  live: LiveTemplate | null;          // null for a template that is not published yet
  server: ServerDraft | null;         // the shared draft row, once one exists (server mode)
  core: TemplateDraft;
  hasDraft: boolean;                  // a saved draft exists (server row or browser copy)
};

const SAVE_DELAY_MS = 1200;

export function useDraft(args: { companyId: string; templateId: string; draftId: string | null }) {
  const { companyId, templateId, draftId } = args;
  const [model, setModel] = useState<DraftModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'clean' });
  const [conflict, setConflict] = useState<Conflict>(null);
  const ref = useRef<DraftModel | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const store = useRef(createDraftStore());

  const commit = (m: DraftModel) => { ref.current = m; setModel(m); };

  const load = useCallback(async () => {
    setLoadError(null); setConflict(null); setSave({ kind: 'clean' });
    try {
      const backend = await detectBackend();
      if (templateId === 'new') {
        if (backend !== 'server' || !draftId) throw new Error('This new template could not be found.');
        const server = await loadDraft(companyId, { draftId });
        if (!server) throw new Error('This draft no longer exists — it may have been published or discarded.');
        commit({ backend, live: null, server, core: server.core, hasDraft: true });
        return;
      }
      const live = await loadTemplate(companyId, templateId, backend);
      if (!live) throw new Error('This template could not be found. It may have been deleted.');
      if (!live.tree) throw new Error('This template has no systems on the server yet. Open it once in the Ledrix app to sync it.');
      if (backend === 'server') {
        const server = await loadDraft(companyId, { templateId });
        commit({ backend, live, server, core: server?.core ?? createDraft({ companyId, templateId, live: live.tree, now: Date.now() }), hasDraft: !!server });
      } else {
        const saved = store.current.loadDraft(companyId, templateId);
        commit({ backend, live, server: null, core: saved ?? createDraft({ companyId, templateId, live: live.tree, now: Date.now() }), hasDraft: !!saved });
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'This template could not be opened.');
    }
  }, [companyId, templateId, draftId]);
  useEffect(() => { load(); }, [load]);

  /** Write the working copy now. Resolves when saved; a refusal sets the conflict instead of throwing. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current) await inFlight.current;
    const m = ref.current;
    if (!m) return false;
    if (m.backend === 'local') {
      try { store.current.saveDraft(m.core); commit({ ...m, hasDraft: true }); setSave({ kind: 'saved', at: Date.now() }); return true; }
      catch (e) { setSave({ kind: 'error', message: e instanceof DraftStoreError ? e.message : 'The draft could not be saved in this browser.' }); return false; }
    }
    setSave({ kind: 'saving' });
    let ok = false;
    const p = (async () => {
      try {
        let server = m.server;
        if (!server) {
          if (!m.live) throw new TemplateApiError('missing', 'draft_missing', 'This draft no longer exists.');
          server = await startDraft(companyId, m.live);
        }
        const saved = await saveDraft(server, m.core);
        // Only adopt the saved row if nothing changed meanwhile; otherwise keep the newer working copy, dirty.
        const now = ref.current!;
        commit({ ...now, server: { ...saved, core: now.core }, hasDraft: true });
        setSave(now.core === m.core ? { kind: 'saved', at: Date.now() } : { kind: 'dirty' });
        ok = true;
      } catch (e) {
        if (e instanceof TemplateApiError && e.reason === 'draft_base') setConflict('base');
        else if (e instanceof TemplateApiError && e.kind === 'conflict') setConflict('draft');
        else if (e instanceof TemplateApiError && e.kind === 'missing') setConflict('gone');
        setSave({ kind: 'error', message: e instanceof Error ? e.message : 'The draft could not be saved.' });
      }
    })();
    inFlight.current = p;
    await p;
    inFlight.current = null;
    if (ok && ref.current && ref.current.core !== m.core) schedule();
    return ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; flush(); }, ref.current?.backend === 'local' ? 0 : SAVE_DELAY_MS);
  }, [flush]);

  /** Replace the working copy (every editor change and every Ledrix decision comes through here). */
  const change = useCallback((core: TemplateDraft) => {
    const m = ref.current;
    if (!m || conflict) return;
    commit({ ...m, core });
    setSave({ kind: 'dirty' });
    schedule();
  }, [schedule, conflict]);

  // Save before the tab closes when something is pending.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (timer.current || inFlight.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const discard = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const m = ref.current; if (!m) return;
    if (m.backend === 'server' && m.server) await discardDraft(m.server.id);
    if (m.backend === 'local') store.current.discardDraft(companyId, templateId);
    if (m.live?.tree) commit({ ...m, server: null, hasDraft: false, core: createDraft({ companyId, templateId, live: m.live.tree, now: Date.now() }) });
    setSave({ kind: 'clean' }); setConflict(null);
  }, [companyId, templateId]);

  /** Owner-only (the database refuses anyone else). Saves first; refuses if the live template moved unless
   *  `replaceLive`. Returns the published version. */
  const publish = useCallback(async (replaceLive: boolean) => {
    const m0 = ref.current;
    if (!m0 || m0.backend !== 'server') throw new TemplateApiError('invalid', 'local', 'Publishing turns on with the next Ledrix app update.');
    // Building types are judged again here, not only by the button (2026-10-24): an error never reaches inspections.
    const bad = validateStructureTypes(m0.core.tree).find(i => i.severity === 'error');
    if (bad) throw new TemplateApiError('invalid', 'structure_types', `Not published — fix the building types first: ${bad.message}`);
    if (!(await flush())) throw new TemplateApiError('failed', 'save', 'The draft could not be saved, so it was not published.');
    const m = ref.current!;
    if (!m.server) throw new TemplateApiError('missing', 'draft_missing', 'There is nothing to publish yet — make a change first.');
    return publishDraft(m.server.id, m.server.rowVersion, replaceLive);
  }, [flush]);

  const liveMoved = !!model && !!model.live && (model.backend === 'server'
    ? !!model.server && model.server.basedOnVersion != null && model.live.rowVersion !== model.server.basedOnVersion
    : !!model.live.tree && model.hasDraft && liveChangedSince(model.core, model.live.tree as InspectionTemplate));

  return { model, loadError, save, conflict, liveMoved, change, flush, discard, publish, reload: load };
}
