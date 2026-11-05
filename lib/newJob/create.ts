// ─── Start an inspection from the website (owner 2026-11-05: "Move all the office/admin work to be done on web as well
// as phone"; the office pages mockup, "use all recommendations") ─────────────────────────────────────────────────────
//
// The job is MADE BY THE PHONE'S OWN CODE: lib/report/newjob.mjs is ledrix-app's createNewInspection + the rows its first
// sync would send (ledrix-app scripts/report-bundle/newjob-entry.ts), run on a fresh in-memory phone. This module only
// gives that phone what the server holds — the person, their company's chosen template and hidden items, and what the
// server takes — and then writes the composed rows exactly where a phone's first sync writes them, AS THE SIGNED-IN
// PERSON (no service-role key):
//   inspections            insert … on conflict (id) do nothing   (the phone's upload; add_inspections decides)
//   inspections            assigned_inspector_id                   (pushAssignment; the assignment rules decide)
//   inspection_templates   insert                                  (the template sync's first compare-and-swap)
//   put_inspection_values  / put_inspection_documents              (the checklist and document sends)
// ledrix-app scripts/verify-new-job.mjs proves the bundle composes what the phone's files compose, and that a phone
// pulls the result back as the same job; scripts/verify-office-web.mjs holds this module to these calls.
import type * as NewJob from '../report/newjob.mjs';
import { serial } from '../report/sealedReport';

export type NewJobRequest = {
  device: string;
  templateId: string;
  record: Record<string, unknown>;
  leadId?: string | null;
  notes?: string;
  extras?: Record<string, string | undefined>;
  today?: string;
};
export type NewJobDeps = {
  supaUrl: string; anonKey: string; token: string;
  fetch?: typeof fetch;
  loadComposer?: () => Promise<Pick<typeof NewJob, 'createComposer'>>;
  newId?: () => string;
};
export type NewJobDone = { ok: true; id: string; templateName: string | null; warnings: string[] };
export type NewJobRefusal = { ok: false; status: number; code: string; error: string; id?: string };

const refuse = (status: number, code: string, error: string, id?: string): NewJobRefusal => ({ ok: false, status, code, error, ...(id ? { id } : {}) });
const DEVICE = /^web_[A-Za-z0-9]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The Ledrix baselines a job may start from without a company template (the phone's BASELINE_TEMPLATE_IDS). */
export const BASELINE_TEMPLATES = ['internachi', 'ashi', 'trec', 'fourpoint'] as const;
/** The intake fields a phone requires before it saves (AddInspectionScreen's handleSave), keyed as its record holds them. */
export const REQUIRED: readonly [string, string][] = [
  ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['zip', 'Zip'], ['sqft', 'Sq Ft'], ['yearBuilt', 'Year Built'],
  ['homeType', 'Home Type'], ['deltas', 'Add-ons (choose None if there are none)'], ['inspectionType', 'Inspection Type'],
  ['scheduledTime', 'Time'], ['clientName', 'Client Name'],
];
/** The server columns a phone's sync probes before it sends them (versionedSync), as "<table>.<column>". */
const PROBES = ['inspections.client_name', 'inspections.weather', 'inspections.inspector_name', 'anomalies.staged_limitation', 'technical_specs.serial'];

/** What is missing from the form, in the phone's words ([] = complete). */
export function missingFields(record: Record<string, unknown>, templateId: string): string[] {
  const blank = (k: string) => !String(record[k] ?? '').trim();
  const out = REQUIRED.filter(([k]) => blank(k)).map(([, label]) => label);
  if (!templateId) out.splice(6, 0, 'Inspection Template');
  if (blank('clientPhone') && blank('clientEmail')) out.push('Client Phone or Email');
  return out;
}

const newWebId = () => `insp_${Date.now()}`;

export async function createJobFromWebsite(req: NewJobRequest, deps: NewJobDeps): Promise<NewJobDone | NewJobRefusal> {
  if (!deps.token) return refuse(401, 'signed_out', 'Sign in to start an inspection.');
  if (!DEVICE.test(String(req?.device ?? ''))) return refuse(400, 'bad_request', 'Reload the page and try again.');
  const templateId = String(req?.templateId ?? '');
  if (!(BASELINE_TEMPLATES as readonly string[]).includes(templateId) && !UUID.test(templateId)) return refuse(400, 'bad_request', 'Pick an inspection type.');
  const record = req?.record && typeof req.record === 'object' ? req.record : {};
  const missing = missingFields(record, templateId);
  if (missing.length) return refuse(400, 'missing_fields', `Missing: ${missing.join(', ')}`);
  if (req.leadId != null && !UUID.test(String(req.leadId))) return refuse(400, 'bad_request', 'Pick the inspector again.');

  const f = deps.fetch ?? fetch;
  const base = deps.supaUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const H = { apikey: deps.anonKey, Authorization: `Bearer ${deps.token}` };
  const J = { ...H, 'Content-Type': 'application/json' };
  const get = async (path: string): Promise<any[] | null> => {
    const r = await f(`${base}/rest/v1/${path}`, { headers: H, cache: 'no-store' });
    if (r.status === 401) throw Object.assign(new Error('signed_out'), { signedOut: true });
    return r.ok ? ((await r.json()) as any[]) : null;
  };
  const rpc = async (fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any }> => {
    const r = await f(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: J, body: JSON.stringify(args), cache: 'no-store' });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
  };

  try {
    // 1 · the person, their company, whether they may add inspections
    const user = await f(`${base}/auth/v1/user`, { headers: H, cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const uid = (user as any)?.id as string | undefined;
    if (!uid) return refuse(401, 'signed_out', 'Sign in to start an inspection.');
    const prof = (await get(`inspector_profiles?id=eq.${encodeURIComponent(uid)}&select=company_id,company_name,full_name&limit=1`))?.[0] ?? null;
    const companyId: string | null = prof?.company_id ?? null;
    const caps = await rpc('my_capabilities', {});
    if (companyId && caps.data?.add_inspections !== true) {
      return refuse(403, 'not_allowed', 'You don’t have “Add inspections”. Ask your company owner.');
    }

    // 2 · the template: a company template of THIS company, or a Ledrix baseline
    let template: NewJob.CompanyTemplateRow | null = null;
    if (UUID.test(templateId)) {
      if (!companyId) return refuse(404, 'template_unavailable', 'That template is not available to you.');
      const t = (await get(`company_templates?id=eq.${templateId}&company_id=eq.${companyId}&select=id,name,base,template,updated_at,deleted_at&limit=1`))?.[0];
      if (!t || t.deleted_at || !t.template) return refuse(404, 'template_unavailable', 'That template could not be loaded, so the inspection was not created. Check Templates and try again.');
      template = { id: t.id, name: t.name, base: t.base ?? null, template: t.template, updated_at: t.updated_at ?? null };
    }
    const hidden = companyId ? ((await get(`company_node_overrides?company_id=eq.${companyId}&select=hidden_ids&limit=1`))?.[0]?.hidden_ids ?? []) : [];

    // 3 · what the server takes — asked of the server, as a phone asks it
    const columns: Record<string, boolean> = {};
    await Promise.all(PROBES.map(async p => {
      const [t, c] = p.split('.');
      const r = await f(`${base}/rest/v1/${t}?select=${c}&limit=0`, { headers: H, cache: 'no-store' });
      if (r.ok) columns[p] = true; else if (r.status === 400) columns[p] = false;   // anything else: unknown, as on a phone
    }));
    const [kinds, keys] = await Promise.all([rpc('inspection_values_kinds', {}), rpc('inspection_document_keys', {})]);
    const valueKinds = kinds.ok && Array.isArray(kinds.data) ? kinds.data.map(String) : [];
    const documentKeys = keys.ok && Array.isArray(keys.data) ? keys.data.map(String) : [];

    // 4 · the phone's own create, on a fresh in-memory phone
    const id = (deps.newId ?? newWebId)();
    const C = await (deps.loadComposer ?? (async () => (await import('../report/newjob.mjs')) as any))();
    let job: NewJob.ComposedJob;
    try {
      job = await serial(() => C.createComposer().composeNewInspection({
        userId: uid, email: (user as any)?.email ?? null, companyId, companyName: prof?.company_name ?? null, device: req.device,
        template, hiddenIds: Array.isArray(hidden) ? hidden.map(String) : [], caps: { columns, valueKinds, documentKeys },
        input: { id, templateId, record, leadId: req.leadId ?? null, notes: req.notes ?? '', extras: req.extras ?? {}, today: req.today },
      }));
    } catch (e: any) {
      if (e?.name === 'NewInspectionTemplateError') return refuse(422, 'template_unavailable', 'That template could not be loaded, so the inspection was not created. Check Templates and try again.');
      throw e;
    }

    // 5 · the rows, where a phone's first sync puts them, as the signed-in person
    const ins = await f(`${base}/rest/v1/inspections?on_conflict=id`, {
      method: 'POST', headers: { ...J, Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(job.rows.inspection), cache: 'no-store',
    });
    if (ins.status === 401) return refuse(401, 'signed_out', 'Sign in to start an inspection.');
    const insRows = ins.ok ? ((await ins.json().catch(() => [])) as any[]) : null;
    if (!ins.ok) {
      const why = await ins.text().catch(() => '');
      return /row-level security|42501|permission/i.test(why)
        ? refuse(403, 'not_allowed', 'You don’t have “Add inspections”. Ask your company owner.')
        : refuse(502, 'create_failed', 'The inspection was not created. Try again.');
    }
    if (!insRows?.length) return refuse(409, 'exists', 'An inspection with this id already exists. Try again.');
    const warnings: string[] = [];
    const tpl = await f(`${base}/rest/v1/inspection_templates`, { method: 'POST', headers: { ...J, Prefer: 'return=minimal' }, body: JSON.stringify(job.rows.template), cache: 'no-store' });
    if (!tpl.ok) return refuse(502, 'template_failed', 'The inspection was created, but its checklist could not be saved. Delete it and start again.', job.id);
    if (job.rows.assignment) {
      const a = await f(`${base}/rest/v1/inspections?id=eq.${encodeURIComponent(job.id)}`, {
        method: 'PATCH', headers: { ...J, Prefer: 'return=representation' }, body: JSON.stringify(job.rows.assignment), cache: 'no-store',
      });
      const rows = a.ok ? ((await a.json().catch(() => [])) as any[]) : [];
      if (!rows.length) warnings.push('The inspector could not be assigned — assign them from the inspection.');
    }
    if (job.rows.values.length) {
      const v = await rpc('put_inspection_values', { p_inspection: job.id, p_device: req.device, p_rows: job.rows.values });
      if (!v.ok || (v.data?.refused ?? []).length) warnings.push('Some starting checklist marks were not saved.');
    }
    if (job.rows.documents.length) {
      const d = await rpc('put_inspection_documents', { p_inspection: job.id, p_device: req.device, p_docs: job.rows.documents });
      if (!d.ok || (d.data?.refused ?? []).length) warnings.push('The first order note was not saved.');
    }
    return { ok: true, id: job.id, templateName: job.templateName, warnings };
  } catch (e: any) {
    if (e?.signedOut) return refuse(401, 'signed_out', 'Sign in to start an inspection.');
    return refuse(500, 'unavailable', 'The inspection could not be started. Try again.');
  }
}
