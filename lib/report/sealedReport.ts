// A sealed report, rendered on the website from the record the phone sealed (ledrix-app DECISIONS 2026-11-02 — "Seal
// and send on the website", step 2).
//
// The phone uploads every sealed record as an immutable object, inspection-records/<inspection>/<digest>.json, whose
// bytes are exactly what the seal's digest is the SHA-256 of, and a report_versions row naming it (ledrix-app SQL #94).
// This reads the newest (or a named) version, proves the bytes are the sealed ones, and renders them with the phone's
// own report builder (./render.mjs — a bundle of ledrix-app's generateInspectionPDF, checked against the app by
// scripts/verify-report-render.mjs). The page is the phone's page: nothing here composes report content.
//
// AS THE SIGNED-IN USER. Every read — the version row, the record object, the photos it signs, the pack — goes to
// Supabase with the caller's own access token, so row-level security decides (can_read_inspection), as for every
// other workspace read. No service-role key.
//
// REFUSES rather than guessing: a record whose bytes do not hash to its digest, a path that is not
// <inspection>/<digest>.json, a record schema this build does not know, or a checklist pack the server does not have.
// Photos: each saved photo is signed (one batch); a photo that is not on the server yet is left out and counted.
//
// Dependency-free (fetch + node:crypto), so the checks run it in plain Node against a fake server.
import { createHash } from 'node:crypto';
import meta from './render.meta.json';
import type * as Render from './render.mjs';

/** The report builder's API (lib/report/render.d.mts, generated with the bundle). */
export type RenderModule = Pick<typeof Render, 'BUNDLED_PACK_VERSION' | 'packDecision' | 'serverPhotoFor' | 'renderSealedReportHtml' | 'phoneOnlyParts'>;
export type SealedRecord = Render.SealedRecord;

export type SealedReportDeps = {
  supaUrl: string;
  anonKey: string;
  /** The signed-in user's access token (the workspace session). */
  token: string;
  fetch?: typeof fetch;
  /** The report builder; defaults to ./render.mjs. */
  load?: () => Promise<RenderModule>;
};

export type SealedReport = {
  ok: true;
  html: string;
  version: number;
  digest: string;
  sealedAt: string | null;
  packVersion: string | null;
  photos: { shown: number; phoneOnly: number };
  /** The QR code to the homeowner's report is printed (the report has been published). */
  qr: boolean;
  /** Parts of this report the server does not hold yet — only the phone has them (ledrix-app serverCoverage.ts). The
   *  sealed record carries them, so this page is complete; it is what the website could not assemble itself. */
  notOnServer: { key: string; label: string; family: string }[];
};
export type SealedReportRefusal = { ok: false; status: number; code: string; error: string };

const SIGN_TTL = 3600;
const RECORDS_BUCKET = 'inspection-records';
const ID = /^[A-Za-z0-9_.-]{1,120}$/;
const refuse = (status: number, code: string, error: string): SealedReportRefusal => ({ ok: false, status, code, error });
const sha256 = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');

// One render at a time: the builder keeps its page and its pack in module state (a Node server, one bundle).
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export async function loadSealedReport(inspectionId: string, version: number | null, deps: SealedReportDeps): Promise<SealedReport | SealedReportRefusal> {
  if (!ID.test(inspectionId)) return refuse(400, 'bad_request', 'Not an inspection.');
  if (version != null && !(Number.isInteger(version) && version > 0)) return refuse(400, 'bad_request', 'Not a report version.');
  if (!deps.token) return refuse(401, 'signed_out', 'Sign in to see this report.');
  const f = deps.fetch ?? fetch;
  const base = deps.supaUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const H = { apikey: deps.anonKey, Authorization: `Bearer ${deps.token}` };

  // 1 · the version row (RLS: can_read_inspection)
  const q = `inspection_id=eq.${encodeURIComponent(inspectionId)}&select=version,digest,object_path,input_schema_version,created_at`
    + (version != null ? `&version=eq.${version}` : '&order=version.desc') + '&limit=1';
  const vr = await f(`${base}/rest/v1/report_versions?${q}`, { headers: H, cache: 'no-store' });
  if (vr.status === 401) return refuse(401, 'signed_out', 'Sign in to see this report.');
  if (!vr.ok) return refuse(502, 'unavailable', 'The sealed report could not be loaded. Try again.');
  const row = ((await vr.json()) as any[])[0];
  if (!row) return refuse(404, 'not_sealed', version != null ? `There is no version ${version} of this report.` : 'This inspection has no sealed report on the server yet.');
  const digest = String(row.digest ?? '');
  if (!/^[0-9a-f]{64}$/.test(digest) || row.object_path !== `${inspectionId}/${digest}.json`) {
    return refuse(409, 'record_mismatch', 'The sealed record on the server does not match its version. It was not shown.');
  }
  if (Number(row.input_schema_version) !== meta.frozenRecordSchema) {
    return refuse(409, 'record_schema', `This report was sealed in a newer record format (${row.input_schema_version}). Open it on the phone.`);
  }

  // 2 · the record — its bytes must be the sealed ones
  const or = await f(`${base}/storage/v1/object/authenticated/${RECORDS_BUCKET}/${row.object_path}`, { headers: H, cache: 'no-store' });
  if (or.status === 400 || or.status === 404) return refuse(404, 'record_missing', 'The sealed record is not on the server yet. The phone uploads it after sealing — try again shortly.');
  if (!or.ok) return refuse(502, 'unavailable', 'The sealed report could not be loaded. Try again.');
  const bytes = new Uint8Array(await or.arrayBuffer());
  if (sha256(bytes) !== digest) return refuse(409, 'record_mismatch', 'The sealed record on the server does not match its seal. It was not shown.');
  let record: SealedRecord;
  try { record = JSON.parse(new TextDecoder().decode(bytes)); } catch { return refuse(409, 'record_mismatch', 'The sealed record could not be read. It was not shown.'); }
  if (!record || typeof record.inputs !== 'object' || record.inputs === null) return refuse(409, 'record_mismatch', 'The sealed record could not be read. It was not shown.');

  const R = await (deps.load ?? defaultLoad)();

  // 3 · the checklist pack it was sealed with
  let pack: Record<string, unknown> | undefined;
  const d = R.packDecision(record);
  if (d.kind === 'load') {
    const pr = await f(`${base}/rest/v1/taxonomy_packs?pack_id=eq.ledrix.core&pack_version=eq.${encodeURIComponent(d.version)}&select=pack_json,checksum&limit=1`, { headers: H, cache: 'no-store' });
    const p = pr.ok ? ((await pr.json()) as any[])[0] : null;
    if (!p || typeof p.pack_json !== 'string') return refuse(409, 'pack_missing', `This report was sealed with checklist pack ${d.version}, which the website does not have yet. Open it on the phone.`);
    if (`sha256:${sha256(p.pack_json)}` !== p.checksum) return refuse(409, 'pack_mismatch', `Checklist pack ${d.version} on the server does not match its checksum. The report was not shown.`);
    try { pack = JSON.parse(p.pack_json); } catch { return refuse(409, 'pack_mismatch', `Checklist pack ${d.version} could not be read.`); }
  }

  // 4 · photos: every saved photo the record names, signed in one batch as this user
  const stored = new Set<string>();
  walkStrings(record.inputs, (s) => { const p = R.serverPhotoFor(s, inspectionId); if (p.kind === 'stored') stored.add(p.path); });
  const signed = await signAll(f, base, H, [...stored]);
  const counted = new Set<string>(); let shown = 0, phoneOnly = 0;
  const photoUrl = (uri: string): string | null => {
    const p = R.serverPhotoFor(uri, inspectionId);
    const url = p.kind === 'url' ? p.url : p.kind === 'stored' ? (signed.get(p.path) ?? null) : null;
    if (!counted.has(uri)) { counted.add(uri); if (url) shown++; else phoneOnly++; }
    return url;
  };

  // 5 · the homeowner link the report's QR code encodes — not part of the record: the phone reads it from home_records
  //     at seal (ShareService.lookupShareToken, visible to accounts that may publish the job) and so does this. None
  //     yet (never published) → no QR, which is what the phone prints for an unpublished report too.
  let shareToken: string | undefined;
  try {
    const sr = await f(`${base}/rest/v1/home_records?share_id=eq.${encodeURIComponent(inspectionId)}&select=share_token&limit=1`, { headers: H, cache: 'no-store' });
    const t = sr.ok ? ((await sr.json()) as any[])[0]?.share_token : null;
    if (typeof t === 'string' && t.length > 0) shareToken = t;
  } catch { /* no QR */ }

  // 6 · render — the phone's own builder, from the record alone
  try {
    const html = await serial(() => R.renderSealedReportHtml({ inspectionId, record, revision: { version: Number(row.version), digest }, photoUrl, shareToken, ...(pack ? { pack } : {}) }));
    return {
      ok: true, html, version: Number(row.version), digest, sealedAt: row.created_at ?? null,
      packVersion: (record.refs?.taxonomyPackVersion as string | undefined) ?? null, photos: { shown, phoneOnly }, qr: !!shareToken,
      notOnServer: R.phoneOnlyParts(record.inputs),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/checklist pack/.test(msg)) return refuse(409, 'pack_missing', `This report was sealed with a checklist pack the website does not have. Open it on the phone.`);
    return refuse(500, 'render_failed', 'The report could not be rendered.');
  }
}

async function defaultLoad(): Promise<RenderModule> {
  return (await import('./render.mjs')) as unknown as RenderModule;
}

function walkStrings(v: unknown, fn: (s: string) => void, depth = 0): void {
  if (depth > 40 || v == null) return;
  if (typeof v === 'string') { if (v.length < 2048) fn(v); return; }
  if (Array.isArray(v)) { for (const x of v) walkStrings(x, fn, depth + 1); return; }
  if (typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) walkStrings(x, fn, depth + 1);
}

async function signAll(f: typeof fetch, base: string, H: Record<string, string>, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    try {
      const r = await f(`${base}/storage/v1/object/sign/inspection-evidence`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: SIGN_TTL, paths: chunk }),
      });
      if (!r.ok) continue;   // unsigned photos are left out and counted, never shown as a device path
      for (const x of (await r.json()) as any[]) {
        if (x?.path && x?.signedURL && !x?.error) out.set(x.path, `${base}/storage/v1${String(x.signedURL).replace(/^\/storage\/v1/, '')}`);
      }
    } catch { /* same */ }
  }
  return out;
}
