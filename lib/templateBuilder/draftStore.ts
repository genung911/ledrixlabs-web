// Desktop Template Builder — where a PRIVATE template draft lives in the browser.
//
// The desktop twin of the app's templateDraftStore (ledrix-app src/core/services/templateDraftStore.ts): one key
// per company template, holding the WHOLE draft (templateDraft.TemplateDraft) as JSON. Like the app's, it is
// local by design — this browser only, no cloud draft, no remote write. A draft made here is not the draft on the
// phone, and neither is ever seen by an inspection.
//
// ISOLATION IS THE POINT. This module writes one key family and nothing else. The live template is the
// company_templates row, which the workspace only ever SELECTs; inspection snapshots are never touched.
import { createDraft, isTemplateDraft, type TemplateDraft } from './core/templateDraft';
import type { InspectionTemplate } from './core/InspectionTemplate';

export const DRAFT_KEY_PREFIX = 'ledrix_desktop_template_draft_v1_';
export const draftKey = (companyId: string, templateId: string) => `${DRAFT_KEY_PREFIX}${companyId}_${templateId}`;

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class DraftStoreError extends Error {
  constructor(message: string) { super(message); this.name = 'DraftStoreError'; }
}

const UNAVAILABLE = 'This browser is not letting Ledrix save drafts (private browsing or blocked site data). Nothing was saved.';

function browserStorage(): DraftStorage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* blocked */ }
  throw new DraftStoreError(UNAVAILABLE);
}

export function createDraftStore(storage: DraftStorage | (() => DraftStorage) = browserStorage) {
  const s = (): DraftStorage => (typeof storage === 'function' ? storage() : storage);

  /** The saved draft, or null when there is none. A stored value this version cannot read is an ERROR, never
   *  silently replaced by a fresh draft (that would discard the owner's work). */
  function loadDraft(companyId: string, templateId: string): TemplateDraft | null {
    let raw: string | null;
    try { raw = s().getItem(draftKey(companyId, templateId)); }
    catch (e) { if (e instanceof DraftStoreError) throw e; throw new DraftStoreError(UNAVAILABLE); }
    if (raw == null) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new DraftStoreError('The saved draft could not be read.'); }
    if (!isTemplateDraft(parsed)) throw new DraftStoreError('The saved draft is from a version this workspace cannot read.');
    if (parsed.companyId !== companyId || parsed.templateId !== templateId) throw new DraftStoreError('The saved draft belongs to a different template.');
    return parsed;
  }

  /** Save the whole draft. Throws if it cannot be written — the caller keeps its last good state and says so. */
  function saveDraft(d: TemplateDraft): void {
    if (!isTemplateDraft(d)) throw new DraftStoreError('Refusing to save something that is not a draft.');
    const json = JSON.stringify(d);
    if (!isTemplateDraft(JSON.parse(json))) throw new DraftStoreError('The draft does not survive saving.');
    try { s().setItem(draftKey(d.companyId, d.templateId), json); }
    catch (e) {
      if (e instanceof DraftStoreError) throw e;
      throw new DraftStoreError('The draft could not be saved in this browser (storage is full or blocked). Your last saved state is unchanged.');
    }
  }

  /** The saved draft, or a new one copied from the live template (and saved). The live template is only READ. */
  function openDraft(companyId: string, templateId: string, live: InspectionTemplate, now: number): TemplateDraft {
    const existing = loadDraft(companyId, templateId);
    if (existing) return existing;
    const d = createDraft({ companyId, templateId, live, now });
    saveDraft(d);
    return d;
  }

  function discardDraft(companyId: string, templateId: string): void {
    try { s().removeItem(draftKey(companyId, templateId)); }
    catch (e) { if (e instanceof DraftStoreError) throw e; throw new DraftStoreError(UNAVAILABLE); }
  }

  return { loadDraft, saveDraft, openDraft, discardDraft };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
