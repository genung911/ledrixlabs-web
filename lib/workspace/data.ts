// Inspector workspace — data access. READ-ONLY by construction: this module issues SELECTs and
// storage signing only (scripts/verify-workspace.mjs refuses any insert/update/upsert/delete/rpc
// call under lib/workspace and app/app).
//
// Why read-only: the authoritative inspection lives on the phone today. Pull is insert-only for
// findings/specs and pushes are blind upserts with no version check (ledrix-app SyncService.ts), so
// a browser write would either never reach the phone or be overwritten by its next push — the
// silent loss the desktop brief forbids. Writes wait on versioned sync.
import { workspace, EVIDENCE_BUCKET } from './client';
import type { FindingCounts, InspectionRow, OrderRow, ProfileRow, ReportRow } from './model';
import { countFindings } from './model';

const INSPECTION_COLS = 'id, inspector_id, assigned_inspector_id, address, inspection_type, status, started_at, completed_at, updated_at, deleted_at';

export class WorkspaceError extends Error {
  constructor(public what: string, cause: { message?: string } | null) {
    super(`${what}: ${cause?.message ?? 'unknown error'}`);
  }
}

function must<T>(what: string, res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) throw new WorkspaceError(what, res.error);
  return (res.data ?? ([] as unknown as T));
}

export async function loadProfile(userId: string): Promise<ProfileRow | null> {
  // Own row only (inspector_profiles RLS is self-only). Named columns: the table also holds
  // secrets (stripe_secret_key) the workspace must never pull into the browser.
  const res = await workspace.from('inspector_profiles').select('id, full_name, company_id, role').eq('id', userId).maybeSingle();
  if (res.error) throw new WorkspaceError('Your profile could not be loaded', res.error);
  return (res.data as ProfileRow | null) ?? null;
}

export async function loadCompanyName(companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const res = await workspace.from('companies').select('name').eq('id', companyId).maybeSingle();
  return res.error ? null : ((res.data as { name?: string } | null)?.name ?? null);
}

/** Every inspection RLS lets this user read (own, assigned, or — for managers/office — the
 *  company's), minus tombstones. */
export async function loadInspections(): Promise<InspectionRow[]> {
  return must('Inspections could not be loaded', await workspace
    .from('inspections').select(INSPECTION_COLS).is('deleted_at', null)
    .order('updated_at', { ascending: false }).limit(500)) as InspectionRow[];
}

export async function loadInspection(id: string): Promise<InspectionRow | null> {
  const res = await workspace.from('inspections').select(INSPECTION_COLS).eq('id', id).maybeSingle();
  if (res.error) throw new WorkspaceError('This inspection could not be loaded', res.error);
  return (res.data as InspectionRow | null) ?? null;
}

/** Status counts per inspection. anomalies RLS is can_write_inspection, so an office user gets
 *  none — callers must say "not visible to your role", never "0 findings". */
export async function loadFindingCounts(inspectionIds: string[]): Promise<Record<string, FindingCounts>> {
  if (!inspectionIds.length) return {};
  const rows = must('Findings could not be counted', await workspace
    .from('anomalies').select('inspection_id, status').in('inspection_id', inspectionIds).limit(5000)) as { inspection_id: string | null; status: unknown }[];
  return countFindings(rows);
}

export async function loadOrders(fromDate: string, toDate: string): Promise<OrderRow[]> {
  return must('The schedule could not be loaded', await workspace
    .from('crm_orders').select('id, inspection_id, address, order_date, status, inspector_id')
    .gte('order_date', fromDate).lte('order_date', toDate)
    .order('order_date', { ascending: true }).limit(500)) as OrderRow[];
}

export async function loadReports(inspectionIds: string[]): Promise<ReportRow[]> {
  if (!inspectionIds.length) return [];
  return must('Report history could not be loaded', await workspace
    .from('home_reports').select('share_id, version, published_at, pdf_path, html_path')
    .in('share_id', inspectionIds).order('published_at', { ascending: false }).limit(2000)) as ReportRow[];
}

export type FindingRow = {
  id: string;
  inspection_id: string;
  status: string | null;
  severity: string | null;
  description: string | null;
  inspector_notes: string | null;
  location: string | null;
  room: string | null;
  component: string | null;
  defect_type: string | null;
  is_safety: boolean | null;
  source: string | null;
  ai_description: string | null;
  ai_severity: string | null;
  ai_confidence: number | null;
  image_uri: string | null;
  evidence: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  rejected_at: string | null;
};

export async function loadFindings(inspectionId: string): Promise<FindingRow[]> {
  return must('Findings could not be loaded', await workspace.from('anomalies')
    .select('id, inspection_id, status, severity, description, inspector_notes, location, room, component, defect_type, is_safety, source, ai_description, ai_severity, ai_confidence, image_uri, evidence, created_at, updated_at, rejected_at')
    .eq('inspection_id', inspectionId).order('created_at', { ascending: true }).limit(2000)) as FindingRow[];
}

export type SpecRow = {
  id: string;
  category: string | null;
  material: string | null;
  attributes: Record<string, unknown> | null;
  status: string | null;
  system: string | null;
  room: string | null;
  instance_label: string | null;
  image_uri: string | null;
  updated_at: string | null;
};

export async function loadSpecs(inspectionId: string): Promise<SpecRow[]> {
  return must('Specs could not be loaded', await workspace.from('technical_specs')
    .select('id, category, material, attributes, status, system, room, instance_label, image_uri, updated_at')
    .eq('inspection_id', inspectionId).limit(2000)) as SpecRow[];
}

export type SealRow = { hash: string; parent_hash: string | null; created_at: string | null };

export async function loadSeals(inspectionId: string): Promise<SealRow[]> {
  const res = await workspace.from('report_seals').select('hash, parent_hash, created_at')
    .eq('inspection_id', inspectionId).order('created_at', { ascending: false }).limit(50);
  return res.error ? [] : ((res.data ?? []) as SealRow[]);
}

export type MemberRow = { id: string; full_name: string | null; email: string | null; phone: string | null; role: string | null };

export async function loadMembers(): Promise<MemberRow[]> {
  return must('The team could not be loaded', await workspace.from('company_members')
    .select('id, full_name, email, phone, role').order('full_name', { ascending: true })) as MemberRow[];
}

export type TemplateRow = { id: string; name: string; base: string | null; is_default: boolean | null; updated_at: string | null };

export async function loadTemplates(companyId: string): Promise<TemplateRow[]> {
  // Metadata only — the list never needs the systems tree.
  return must('Templates could not be loaded', await workspace.from('company_templates')
    .select('id, name, base, is_default, updated_at').eq('company_id', companyId)
    .order('name', { ascending: true })) as TemplateRow[];
}

export type TemplateTreeRow = TemplateRow & { template: unknown };

/** One company template WITH its systems tree — the live template the Template Builder copies into a private
 *  draft. Read only: the builder never writes company_templates. Null when the row is not visible or absent. */
export async function loadTemplateTree(companyId: string, id: string): Promise<TemplateTreeRow | null> {
  const res = await workspace.from('company_templates')
    .select('id, name, base, is_default, updated_at, template').eq('company_id', companyId).eq('id', id).maybeSingle();
  if (res.error) throw new WorkspaceError('This template could not be loaded', res.error);
  return (res.data as TemplateTreeRow | null) ?? null;
}

/** Short-lived signed URL for an evidence photo, as the signed-in user — the Phase 0 scoped storage
 *  policies decide. Null when the object is gone or the user may not read it. */
export async function signEvidence(paths: string[]): Promise<Record<string, string>> {
  const uniq = Array.from(new Set(paths)).filter(Boolean);
  if (!uniq.length) return {};
  const res = await workspace.storage.from(EVIDENCE_BUCKET).createSignedUrls(uniq, 600);
  const out: Record<string, string> = {};
  for (const r of res.data ?? []) if (r.signedUrl && r.path && !r.error) out[r.path] = r.signedUrl;
  return out;
}

const REPORTS_BUCKET = 'inspection-pdfs';

/** Signed URL for a published report file (home_reports.pdf_path / html_path), as the user. */
export async function signReportFile(path: string): Promise<string | null> {
  const res = await workspace.storage.from(REPORTS_BUCKET).createSignedUrl(path.replace(/^\/+/, ''), 600);
  return res.error ? null : (res.data?.signedUrl ?? null);
}

/** The client Home Portal link for a delivered inspection. home_records RLS returns the row only
 *  to the user it allows (today: the publisher); anyone else simply gets no link. */
export async function loadPortalLink(inspectionId: string): Promise<string | null> {
  const res = await workspace.from('home_records').select('share_token').eq('share_id', inspectionId).maybeSingle();
  const token = (res.data as { share_token?: string | null } | null)?.share_token;
  return !res.error && token ? `https://www.ledrixlabs.com/share/${encodeURIComponent(token)}` : null;
}
