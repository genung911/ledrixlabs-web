// The Seal & send check for one inspection — read-only (10c of ledrix-app "Seal and send on the website",
// DECISIONS 2026-11-03 (fourth); mockup screens 1–2, approved).
//
// AS THE SIGNED-IN USER: every read goes to Supabase with the caller's own access token, so row-level security decides,
// exactly as lib/report/sealedReport.ts does. No service-role key. Nothing is written — not a row, not a file, not a
// lease (10d seals).
//
//   1 the job's server rows (the shape ledrix-app's record assembly takes: ServerJobRows) and the person checking
//   2 what else the decision needs from the server: blocking conflicts (#97's rule), whether a version is sealed
//     already (a re-seal), each phone's phone-only report (#102, job_phone_only), each teammate's unsent count (#87, job_team)
//   3 the record, assembled from those rows by the phone's own code (lib/report/assemble.mjs), and the release gates
//     decided on it by the phone's own rules (no photo bytes are read: a check, not a seal)
//   4 the preview, rendered from that record by the phone's own report builder (lib/report/render.mjs)
//   5 the decision (lib/seal/decide.ts)
//
// Dependency-free apart from the two bundles, so the checks run it in plain Node against a fake server.
import { serial, signAll, walkStrings } from '../report/sealedReport';
import type * as Render from '../report/render.mjs';
import type * as Assemble from '../report/assemble.mjs';
import { BLOCKING_RELEVANCE } from '../conflicts/rules';
import { decideSeal, type PhoneReport, type SealDecision, type TeamPerson } from './decide';

export type SealCheckDeps = {
  supaUrl: string;
  anonKey: string;
  token: string;
  fetch?: typeof fetch;
  loadRender?: () => Promise<Pick<typeof Render, 'serverPhotoFor' | 'renderSealedReportHtml' | 'RECORD_PARTS'>>;
  loadAssemble?: () => Promise<Pick<typeof Assemble, 'createAssembler'>>;
  /** The IANA zone of the person checking (their browser), as a seal would freeze it. */
  timeZone?: string | null;
};

export type SealCheck = SealDecision & {
  ok: true;
  isFinalized: boolean;
  nextVersion: number;
  conflicts: number | null;
  /** Where this job's data is: each report part and whether a phone says it holds it. */
  dataMap: { label: string; where: 'server' | 'phone' }[];
  preview: { html: string; photos: { shown: number; missing: number } } | null;
  assembledAt: string;
  /** The client the report is for (the record's), for "goes live on <client>'s Home App". */
  clientName: string | null;
};
export type SealCheckRefusal = { ok: false; status: number; code: string; error: string };

const ID = /^[A-Za-z0-9_.-]{1,120}$/;
const refuse = (status: number, code: string, error: string): SealCheckRefusal => ({ ok: false, status, code, error });
/** The keys phoneOnlyParts adds beyond RECORD_PARTS (ledrix-app serverCoverage.ts). */
const EXTRA_LABELS: Record<string, string> = {
  'specInventory.serial': 'Serial and model numbers', 'inspection.intake': 'Client and intake details', coverImageUris: 'Cover photos',
};
/** The server-held parts shown first in "Where this job's data is". */
const SERVER_PARTS = ['Findings', 'Checklist answers', 'Equipment and specs', 'Readings', 'Photos', 'Client and intake details'];

/** The server's view of one job, read as the signed-in user: the rows the record assembly takes, and what the decision
 *  needs besides. Shared by the check and the seal (lib/seal/seal.ts), so both read the job the same way. */
export type JobRead = {
  ok: true;
  rows: Assemble.ServerJobRows;
  uid: string;
  conflicts: number | null;
  lastVersion: number;
  reports: PhoneReport[];
  team: TeamPerson[];
  io: { f: typeof fetch; base: string; H: Record<string, string>; get: (path: string) => Promise<any[] | null>; rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
};

export async function readJob(inspectionId: string, deps: Pick<SealCheckDeps, 'supaUrl' | 'anonKey' | 'token' | 'fetch'>): Promise<JobRead | SealCheckRefusal> {
  if (!ID.test(inspectionId)) return refuse(400, 'bad_request', 'Not an inspection.');
  if (!deps.token) return refuse(401, 'signed_out', 'Sign in to check this report.');
  const f = deps.fetch ?? fetch;
  const base = deps.supaUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const H = { apikey: deps.anonKey, Authorization: `Bearer ${deps.token}` };
  const q = encodeURIComponent(inspectionId);
  const get = async (path: string): Promise<any[] | null> => {
    const r = await f(`${base}/rest/v1/${path}`, { headers: H, cache: 'no-store' });
    if (r.status === 401) throw Object.assign(new Error('signed_out'), { signedOut: true });
    return r.ok ? ((await r.json()) as any[]) : null;
  };
  /** A table that may not exist yet (#104 inspection_documents before it is applied): missing (404) = no rows; any other
   *  failure = null (unreadable — the job is not sealed on a partial read). */
  const getIfThere = async (path: string): Promise<any[] | null> => {
    const r = await f(`${base}/rest/v1/${path}`, { headers: H, cache: 'no-store' });
    if (r.status === 401) throw Object.assign(new Error('signed_out'), { signedOut: true });
    return r.ok ? ((await r.json()) as any[]) : r.status === 404 ? [] : null;
  };
  const rpc = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const r = await f(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(args), cache: 'no-store' });
    return r.ok ? r.json() : null;
  };
  try {
    // 1 · the rows
    const [insp, anomalies, specs, values, templates, measurements, photos, user, documents] = await Promise.all([
      get(`inspections?id=eq.${q}&select=*&limit=1`),
      get(`anomalies?inspection_id=eq.${q}&select=*`),
      get(`technical_specs?inspection_id=eq.${q}&select=*`),
      get(`inspection_values?inspection_id=eq.${q}&select=structure_id,node_key,kind,value,updated_by,updated_at,seq`),
      get(`inspection_templates?inspection_id=eq.${q}&select=*&limit=1`),
      get(`measurements?inspection_id=eq.${q}&select=*`),
      get(`inspection_photos?inspection_id=eq.${q}&select=*`),
      f(`${base}/auth/v1/user`, { headers: H, cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      getIfThere(`inspection_documents?inspection_id=eq.${q}&select=doc_key,payload,updated_by,updated_at,seq`),
    ]);
    const inspection = insp?.[0];
    if (!insp) return refuse(502, 'unavailable', 'The inspection could not be loaded. Try again.');
    if (!inspection || inspection.deleted_at) return refuse(404, 'not_found', 'This inspection is not on the server.');
    if (!anomalies || !specs || !values || !templates || !measurements || !photos || !documents) return refuse(502, 'unavailable', 'Part of this inspection could not be loaded. Try again.');
    const uid = (user as any)?.id as string | undefined;
    if (!uid) return refuse(401, 'signed_out', 'Sign in to check this report.');
    const prof = (await get(`inspector_profiles?id=eq.${encodeURIComponent(uid)}&select=full_name,company_name,license_number&limit=1`))?.[0] ?? {};

    // 2 · conflicts, versions, phone reports, team
    const [conf, versions, reports, team] = await Promise.all([
      get(`inspection_conflicts?inspection_id=eq.${q}&status=eq.open&report_relevance=in.(${BLOCKING_RELEVANCE.join(',')})&select=id`),
      get(`report_versions?inspection_id=eq.${q}&select=version&order=version.desc&limit=1`),
      rpc('job_phone_only', { p_inspection: inspectionId }),
      rpc('job_team', { p_inspection: inspectionId }),
    ]);
    const rows: Assemble.ServerJobRows = {
      inspection, anomalies, technicalSpecs: specs, values: values as any, template: templates[0] ?? null, measurements, photos, documents,
      sealer: { id: uid, email: (user as any)?.email ?? null, full_name: prof.full_name ?? null, company_name: prof.company_name ?? null, license_number: prof.license_number ?? null },
    };
    return {
      ok: true, rows, uid,
      conflicts: conf ? conf.length : null,
      lastVersion: Number(versions?.[0]?.version ?? 0),
      reports: Array.isArray(reports) ? (reports as PhoneReport[]) : [],
      team: Array.isArray((team as any)?.people) ? (team as any).people : [],
      io: { f, base, H, get, rpc },
    };
  } catch (e) {
    if ((e as any)?.signedOut) return refuse(401, 'signed_out', 'Sign in to check this report.');
    return refuse(502, 'unavailable', 'The report check could not run. Try again.');
  }
}

export async function loadSealCheck(inspectionId: string, deps: SealCheckDeps): Promise<SealCheck | SealCheckRefusal> {
  const job = await readJob(inspectionId, deps);
  if (!job.ok) return job;
  const { rows, conflicts, lastVersion, io: { f, base, H } } = job;
  const isFinalized = lastVersion > 0;
  try {
    // 3 · assemble + gates, one at a time (the assembler holds module state)
    const R = await (deps.loadRender ?? (async () => (await import('../report/render.mjs')) as any))();
    const A = await (deps.loadAssemble ?? (async () => (await import('../report/assemble.mjs')) as any))();
    let rec: Awaited<ReturnType<Assemble.Assembler['assembleServerRecord']>> | null = null;
    try {
      rec = await serial(() => A.createAssembler().assembleServerRecord({ rows, timeZone: deps.timeZone ?? null, gates: { isFinalized, openConflicts: conflicts } }));
    } catch { rec = null; }

    // 4 · the preview (not sealed)
    let preview: SealCheck['preview'] = null;
    if (rec) {
      const record = { inputs: rec.inputs, refs: rec.refs, evidence: rec.evidence };
      const stored = new Set<string>();
      walkStrings(record.inputs, (s) => { const p = R.serverPhotoFor(s, inspectionId); if (p.kind === 'stored') stored.add(p.path); });
      const signed = await signAll(f, base, H, [...stored]);
      const counted = new Set<string>(); let shown = 0, missing = 0;
      const photoUrl = (uri: string): string | null => {
        const p = R.serverPhotoFor(uri, inspectionId);
        const url = p.kind === 'url' ? p.url : p.kind === 'stored' ? (signed.get(p.path) ?? null) : null;
        if (!counted.has(uri)) { counted.add(uri); if (url) shown++; else missing++; }
        return url;
      };
      try {
        const html: string = await serial<string>(() => R.renderSealedReportHtml({ inspectionId, record, revision: { version: lastVersion + 1, digest: rec!.digest }, photoUrl }));
        preview = { html, photos: { shown, missing } };
      } catch { preview = null; }
    }

    // 5 · decide
    const labels: Record<string, string> = { ...EXTRA_LABELS };
    for (const [k, p] of Object.entries(R.RECORD_PARTS)) labels[k] = (p as any).label;
    const decision = decideSeal({ gates: rec?.gates ?? null, reports: job.reports, team: job.team, labels });
    const onPhones = new Set(decision.phoneOnly.phones.flatMap(p => p.parts));
    const dataMap: SealCheck['dataMap'] = [
      ...SERVER_PARTS.filter(l => !onPhones.has(l)).map(label => ({ label, where: 'server' as const })),
      ...[...onPhones].map(label => ({ label, where: 'phone' as const })),
    ];
    return { ok: true, ...decision, isFinalized, nextVersion: lastVersion + 1, conflicts, dataMap, preview, assembledAt: new Date().toISOString(),
      clientName: ((rec?.inputs as any)?.inspection?.clientName as string | undefined)?.trim() || null };
  } catch (e) {
    if ((e as any)?.signedOut) return refuse(401, 'signed_out', 'Sign in to check this report.');
    return refuse(502, 'unavailable', 'The report check could not run. Try again.');
  }
}
