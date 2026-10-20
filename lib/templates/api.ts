// Desktop template management — every read and write of company templates, drafts and inspection types.
//
// The ONLY workspace module that writes. Everything runs as the signed-in user under row-level security; the rules
// are the database's (ledger #65, ledrix-app supabase_company_templates_v2.sql), this module only speaks them:
//   * every write names the version it is based on (row_version = current + 1); a stale write is REFUSED (P0409)
//     and surfaces as a TemplateApiError of kind 'conflict' — never retried over the top of someone else;
//   * the live template is written by the OWNER only, and only through publish / rename / delete;
//   * a delete is a soft delete; drafts are shared (owner + admin), one per template;
//   * nothing here touches an inspection or an inspection's template snapshot (inspection_templates).
//
// TWO MODES, decided by the database itself (detectBackend):
//   'server' — #65 is applied: shared drafts, publish, delete, inspection types.
//   'local'  — #65 is not applied yet (it must ship together with the phone build that versions template sync).
//              Templates are read-only on the server; the draft lives in this browser (lib/templateBuilder/
//              draftStore) and the owner-only actions are disabled with the reason. Nothing is written remotely.
import { workspace } from '@/lib/workspace/client';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import { createDraft, isTemplateDraft, type TemplateDraft } from '@/lib/templateBuilder/core/templateDraft';
import { templateHash } from '@/lib/templateBuilder/core/templateOps';

export type Backend = 'server' | 'local';

/** The inspection types every company has in the app even before it names its own (ledrix-app
 *  templateLibraryService STOCK types). They exist as rows only once a template is assigned to them. */
export const STOCK_TYPES = ['Full Home Inspection', '4-Point'] as const;

export type ApiErrorKind = 'conflict' | 'forbidden' | 'missing' | 'invalid' | 'failed';
export class TemplateApiError extends Error {
  constructor(public kind: ApiErrorKind, public reason: string, message: string, public current?: number) {
    super(message);
    this.name = 'TemplateApiError';
  }
}

type PgError = { code?: string; message?: string; details?: string | null };

/** What the owner reads for each refusal the database can give. */
const REASONS: Record<string, string> = {
  template_version_conflict: 'This template was changed somewhere else since you opened it.',
  template_deleted: 'This template was deleted.',
  template_in_use: 'An inspection type still uses this template. Choose another template for that type first.',
  inspection_type_version_conflict: 'This inspection type was changed somewhere else since you opened it.',
  inspection_type_deleted: 'This inspection type was removed.',
  inspection_type_template: 'That template is not one of your company’s live templates.',
  draft_version_conflict: 'This draft was saved somewhere else since you opened it.',
  draft_base: 'The live template changed while the draft was being started.',
  draft_template: 'That template is not one of your company’s live templates.',
  live_template_changed: 'The live template was changed after this draft started.',
  owner_only: 'Only the company owner can do that.',
  draft_missing: 'This draft no longer exists.',
};

function fail(what: string, e: PgError | null): never {
  const msg = e?.message ?? 'unknown error';
  const reason = /^([a-z_]+):/.exec(msg)?.[1] ?? '';
  const current = e?.details && /^\d+$/.test(e.details) ? Number(e.details) : undefined;
  const say = REASONS[reason];
  if (e?.code === 'P0409') throw new TemplateApiError('conflict', reason, say ?? `${what}: ${msg}`, current);
  if (e?.code === 'P0403' || e?.code === '42501') throw new TemplateApiError('forbidden', reason || 'rls', say ?? 'You don’t have permission to do that.');
  if (e?.code === 'P0404') throw new TemplateApiError('missing', reason, say ?? `${what}: not found`);
  if (e?.code === 'P0422' || e?.code === '23505' || e?.code === '23514') {
    throw new TemplateApiError('invalid', reason || e.code, say ?? (e.code === '23505' ? 'That name is already used.' : `${what}: ${msg}`));
  }
  throw new TemplateApiError('failed', reason, `${what}: ${msg}`);
}

/** 'server' when the versioned template tables exist, 'local' when they do not. Any OTHER error is thrown — a
 *  network failure is never mistaken for "not applied". */
export async function detectBackend(): Promise<Backend> {
  const res = await workspace.from('company_templates').select('row_version').limit(1);
  if (!res.error) return 'server';
  if (res.error.code === '42703' || res.error.code === 'PGRST204' || /row_version/.test(res.error.message ?? '')) return 'local';
  fail('Templates could not be loaded', res.error);
}

// ── reads ───────────────────────────────────────────────────────────────────────────────────────────────────

export type LiveTemplate = {
  id: string; name: string; base: string | null; updatedAt: string | null;
  rowVersion: number | null;            // null in 'local' mode
  tree: InspectionTemplate | null;
};
export type DraftMeta = { id: string; templateId: string | null; name: string; rowVersion: number; updatedAt: string; updatedBy: string | null };
export type InspectionType = { id: string | null; name: string; templateId: string | null; rowVersion: number | null; stock: boolean };

const asTree = (t: unknown): InspectionTemplate | null =>
  t && typeof t === 'object' && Array.isArray((t as InspectionTemplate).systems) ? (t as InspectionTemplate) : null;

export async function listTemplates(companyId: string, backend: Backend): Promise<LiveTemplate[]> {
  const cols = backend === 'server' ? 'id, name, base, updated_at, template, row_version' : 'id, name, base, updated_at, template';
  let q = workspace.from('company_templates').select(cols).eq('company_id', companyId);
  if (backend === 'server') q = q.is('deleted_at', null);
  const res = await q.order('name', { ascending: true });
  if (res.error) fail('Templates could not be loaded', res.error);
  return ((res.data ?? []) as unknown as Array<Record<string, unknown>>).map(r => ({
    id: String(r.id), name: String(r.name ?? 'Template'), base: (r.base as string) ?? null, updatedAt: (r.updated_at as string) ?? null,
    rowVersion: typeof r.row_version === 'number' ? r.row_version : r.row_version != null ? Number(r.row_version) : null,
    tree: asTree(r.template),
  }));
}

export async function loadTemplate(companyId: string, id: string, backend: Backend): Promise<LiveTemplate | null> {
  const cols = backend === 'server' ? 'id, name, base, updated_at, template, row_version, deleted_at' : 'id, name, base, updated_at, template';
  const res = await workspace.from('company_templates').select(cols).eq('company_id', companyId).eq('id', id).maybeSingle();
  if (res.error) fail('This template could not be loaded', res.error);
  const r = res.data as Record<string, unknown> | null;
  if (!r || r.deleted_at) return null;
  return {
    id: String(r.id), name: String(r.name ?? 'Template'), base: (r.base as string) ?? null, updatedAt: (r.updated_at as string) ?? null,
    rowVersion: r.row_version != null ? Number(r.row_version) : null, tree: asTree(r.template),
  };
}

export async function listDrafts(companyId: string): Promise<DraftMeta[]> {
  const res = await workspace.from('company_template_drafts')
    .select('id, template_id, name, row_version, updated_at, updated_by').eq('company_id', companyId);
  if (res.error) fail('Drafts could not be loaded', res.error);
  return ((res.data ?? []) as Array<Record<string, unknown>>).map(r => ({
    id: String(r.id), templateId: (r.template_id as string) ?? null, name: String(r.name),
    rowVersion: Number(r.row_version), updatedAt: String(r.updated_at), updatedBy: (r.updated_by as string) ?? null,
  }));
}

/** The company's inspection types: its rows, plus the stock types that have no row yet. */
export async function listInspectionTypes(companyId: string): Promise<InspectionType[]> {
  const res = await workspace.from('company_inspection_types')
    .select('id, name, template_id, row_version, sort_order').eq('company_id', companyId).is('deleted_at', null)
    .order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (res.error) fail('Inspection types could not be loaded', res.error);
  const rows: InspectionType[] = ((res.data ?? []) as Array<Record<string, unknown>>).map(r => ({
    id: String(r.id), name: String(r.name), templateId: (r.template_id as string) ?? null, rowVersion: Number(r.row_version),
    stock: (STOCK_TYPES as readonly string[]).some(s => s.toLowerCase() === String(r.name).trim().toLowerCase()),
  }));
  const have = new Set(rows.map(r => r.name.trim().toLowerCase()));
  const stock = STOCK_TYPES.filter(s => !have.has(s.toLowerCase())).map(s => ({ id: null, name: s, templateId: null, rowVersion: null, stock: true }));
  return [...stock, ...rows];
}

// ── server drafts ───────────────────────────────────────────────────────────────────────────────────────────

/** A shared draft as the editor holds it: the core TemplateDraft plus the row's identity and version. */
export type ServerDraft = { id: string; templateId: string | null; rowVersion: number; basedOnVersion: number | null; updatedAt: string; core: TemplateDraft };

type History = { log: TemplateDraft['log']; provenance: TemplateDraft['provenance']; pending: TemplateDraft['pending']; sourceRevision?: string; createdAt?: number };

function toServerDraft(r: Record<string, unknown>, companyId: string): ServerDraft {
  const h = (r.history ?? {}) as History;
  const tree = asTree(r.template);
  if (!tree) throw new TemplateApiError('invalid', 'draft_shape', 'This draft could not be read.');
  const core: TemplateDraft = {
    v: 1, companyId, templateId: (r.template_id as string) ?? `new:${r.id}`, name: String(r.name),
    createdAt: h.createdAt ?? (Date.parse(String(r.created_at)) || Date.now()), updatedAt: Date.parse(String(r.updated_at)) || Date.now(),
    sourceRevision: h.sourceRevision ?? templateHash(tree), tree,
    log: Array.isArray(h.log) ? h.log : [], provenance: Array.isArray(h.provenance) ? h.provenance : [], pending: h.pending ?? null,
  };
  if (!isTemplateDraft(core)) throw new TemplateApiError('invalid', 'draft_shape', 'This draft is from a version this workspace cannot read.');
  return {
    id: String(r.id), templateId: (r.template_id as string) ?? null, rowVersion: Number(r.row_version),
    basedOnVersion: r.based_on_version != null ? Number(r.based_on_version) : null, updatedAt: String(r.updated_at), core,
  };
}
const historyOf = (d: TemplateDraft): History => ({ log: d.log, provenance: d.provenance, pending: d.pending, sourceRevision: d.sourceRevision, createdAt: d.createdAt });
const DRAFT_COLS = 'id, template_id, name, base, template, based_on_version, row_version, history, created_at, updated_at';

export async function loadDraft(companyId: string, by: { draftId: string } | { templateId: string }): Promise<ServerDraft | null> {
  let q = workspace.from('company_template_drafts').select(DRAFT_COLS).eq('company_id', companyId);
  q = 'draftId' in by ? q.eq('id', by.draftId) : q.eq('template_id', by.templateId);
  const res = await q.maybeSingle();
  if (res.error) fail('The draft could not be loaded', res.error);
  return res.data ? toServerDraft(res.data as Record<string, unknown>, companyId) : null;
}

/** Start the shared draft of a live template, copied from it as it stands at `live.rowVersion`. */
export async function startDraft(companyId: string, live: LiveTemplate): Promise<ServerDraft> {
  if (!live.tree || live.rowVersion == null) throw new TemplateApiError('invalid', 'no_tree', 'This template has no systems to edit yet.');
  const core = createDraft({ companyId, templateId: live.id, live: live.tree, now: Date.now() });
  const res = await workspace.from('company_template_drafts').insert({
    company_id: companyId, template_id: live.id, name: live.name, base: live.base, template: core.tree,
    based_on_version: live.rowVersion, history: historyOf(core),
  }).select(DRAFT_COLS).single();
  if (res.error) fail('The draft could not be started', res.error);
  return toServerDraft(res.data as Record<string, unknown>, companyId);
}

/** A draft for a template that does not exist yet (new, or a duplicate). It becomes live only when published. */
export async function startNewTemplateDraft(companyId: string, args: { name: string; base: string | null; tree: InspectionTemplate }): Promise<ServerDraft> {
  const tree: InspectionTemplate = { ...JSON.parse(JSON.stringify(args.tree)), name: args.name };
  const core = createDraft({ companyId, templateId: 'new', live: tree, now: Date.now() });
  const res = await workspace.from('company_template_drafts').insert({
    company_id: companyId, template_id: null, name: args.name, base: args.base, template: core.tree,
    based_on_version: null, history: historyOf(core),
  }).select(DRAFT_COLS).single();
  if (res.error) fail('The new template could not be created', res.error);
  return toServerDraft(res.data as Record<string, unknown>, companyId);
}

/** Save the whole draft over the version it was loaded at. A stale save is refused, never merged. */
export async function saveDraft(d: ServerDraft, core: TemplateDraft): Promise<ServerDraft> {
  const res = await workspace.from('company_template_drafts')
    .update({ name: core.name, template: core.tree, history: historyOf(core), row_version: d.rowVersion + 1 })
    .eq('id', d.id).select('row_version, updated_at').maybeSingle();
  if (res.error) fail('The draft could not be saved', res.error);
  if (!res.data) throw new TemplateApiError('missing', 'draft_missing', REASONS.draft_missing);
  const r = res.data as { row_version: number; updated_at: string };
  return { ...d, rowVersion: Number(r.row_version), updatedAt: r.updated_at, core };
}

export async function discardDraft(draftId: string): Promise<void> {
  const res = await workspace.from('company_template_drafts').delete().eq('id', draftId);
  if (res.error) fail('The draft could not be discarded', res.error);
}

/** Owner-only. Publishes the draft at exactly `draftVersion`; refuses if the live template moved since the draft
 *  started, unless `replaceLive` — the owner's explicit choice to replace those changes. */
export async function publishDraft(draftId: string, draftVersion: number, replaceLive = false): Promise<{ templateId: string; rowVersion: number }> {
  const res = await workspace.rpc('publish_company_template_draft', { p_draft_id: draftId, p_draft_version: draftVersion, p_replace_live: replaceLive });
  if (res.error) fail('The template could not be published', res.error);
  const r = (Array.isArray(res.data) ? res.data[0] : res.data) as { template_id: string; row_version: number } | undefined;
  if (!r) throw new TemplateApiError('failed', 'publish_empty', 'The template could not be published.');
  return { templateId: r.template_id, rowVersion: Number(r.row_version) };
}

// ── owner-only changes to the live template ────────────────────────────────────────────────────────────────

export async function renameTemplate(t: LiveTemplate, name: string): Promise<void> {
  if (t.rowVersion == null) throw new TemplateApiError('invalid', 'local', 'Renaming waits on the server update.');
  const res = await workspace.from('company_templates').update({ name: name.trim(), row_version: t.rowVersion + 1 })
    .eq('id', t.id).select('id').maybeSingle();
  if (res.error) fail('The template could not be renamed', res.error);
  if (!res.data) throw new TemplateApiError('forbidden', 'rls', REASONS.owner_only);
}

/** Soft delete. Refused while an inspection type uses it. Inspections that used it keep their own copy. */
export async function deleteTemplate(t: LiveTemplate): Promise<void> {
  if (t.rowVersion == null) throw new TemplateApiError('invalid', 'local', 'Deleting waits on the server update.');
  const res = await workspace.from('company_templates').update({ deleted_at: new Date().toISOString(), row_version: t.rowVersion + 1 })
    .eq('id', t.id).select('id').maybeSingle();
  if (res.error) fail('The template could not be deleted', res.error);
  if (!res.data) throw new TemplateApiError('forbidden', 'rls', REASONS.owner_only);
}

// ── owner-only inspection types ────────────────────────────────────────────────────────────────────────────

export async function assignTemplate(companyId: string, type: InspectionType, templateId: string | null): Promise<void> {
  const res = type.id
    ? await workspace.from('company_inspection_types').update({ template_id: templateId, row_version: (type.rowVersion ?? 0) + 1 })
        .eq('id', type.id).select('id').maybeSingle()
    : await workspace.from('company_inspection_types').insert({ company_id: companyId, name: type.name, template_id: templateId })
        .select('id').maybeSingle();
  if (res.error) fail('The inspection type could not be changed', res.error);
  if (!res.data) throw new TemplateApiError('forbidden', 'rls', REASONS.owner_only);
}

export async function addInspectionType(companyId: string, name: string, templateId: string | null, sortOrder: number): Promise<void> {
  const res = await workspace.from('company_inspection_types')
    .insert({ company_id: companyId, name: name.trim(), template_id: templateId, sort_order: sortOrder }).select('id').maybeSingle();
  if (res.error) fail('The inspection type could not be added', res.error);
}

export async function removeInspectionType(type: InspectionType): Promise<void> {
  if (!type.id) return;   // a stock type with no row has nothing to remove
  const res = await workspace.from('company_inspection_types')
    .update({ deleted_at: new Date().toISOString(), row_version: (type.rowVersion ?? 0) + 1 }).eq('id', type.id).select('id').maybeSingle();
  if (res.error) fail('The inspection type could not be removed', res.error);
  if (!res.data) throw new TemplateApiError('forbidden', 'rls', REASONS.owner_only);
}

// ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────

/** Systems a new inspection covers by default, as the template defines them. */
export const systemCount = (tree: InspectionTemplate | null): number =>
  (tree?.systems ?? []).filter(s => s.defaultActive !== false).length;

export const BASE_LABEL: Record<string, string> = { internachi: 'Ledrix Default', fourpoint: '4-Point', custom: 'Custom', blank: 'Blank' };
export const baseLabel = (b: string | null) => (b ? BASE_LABEL[b] ?? b.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Custom');
