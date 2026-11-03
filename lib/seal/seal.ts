// Seal and send from the website (10d of ledrix-app "Seal and send on the website", DECISIONS 2026-11-03 (fourth);
// mockup https://claude.ai/artifact/6Yz1LwcKpti2PwgGcGUupa screens 3–4, approved as drawn).
//
// What the phone's Finalize & Send does, in its order, as the signed-in user (row-level security decides every write,
// exactly as it does for the phone; no service-role key):
//   0 the person attests, and holds the job's edit lock on this browser (heartbeat_edit answers for this device + epoch)
//   1 the job is read and checked again (lib/seal/check.ts readJob → the phone's own record assembly, release gates,
//     phone-only reports, unsent work): any lock, or a version that moved since the person looked, refuses
//   2 the record, assembled with the photos' real bytes (its evidence hashes them, as a phone seal does)
//   3 the share token: the Home App link the report's QR code prints — the existing one, or a new one (never guessed)
//   4 the seal row (report_seals: the phone's payload, its SHA-256, chained to the previous seal)
//   5 the record object (inspection-records/<id>/<digest>.json, create-only) and its version (record_report_version)
//   6 the report: rendered from the record by the phone's report builder, printed to PDF by /api/render-pdf (the
//     same hosted browser and render budget the phone uses)
//   7 the Home App: finding photos and the cover copied to the public bucket, the PDF and web report staged under
//     a new version folder, then ONE home_records write switches the homeowner's record to them, then the fixed
//     report.html, then the history row — pushHomeRecord's order (S-14)
//   8 the inspection marked completed (a versioned write under the edit lock)
// Refused rather than partial: until step 4 nothing is written. After it, a failure says exactly what happened and
// a retry is safe — the same record seals to the same hash (no second seal) and the same version, and every upload is
// create-only or names a new version folder.
import { createHash, randomBytes } from 'node:crypto';
import { serial } from '../report/sealedReport';
import type * as Render from '../report/render.mjs';
import type * as Assemble from '../report/assemble.mjs';
import { readJob, type SealCheckDeps } from './check';
import { decideSeal } from './decide';
import meta from '../report/render.meta.json';

export type SealRequest = { attest: boolean; device: string; epoch: number; expectNext: number };
export type SealDone = { ok: true; version: number; digest: string; shareUrl: string; warnings: string[]; reSealed: boolean };
export type SealRefusal = { ok: false; status: number; code: string; error: string; sealed?: boolean };
export type SealDeps = SealCheckDeps & {
  /** This site's own origin, for /api/render-pdf. */
  origin: string;
  /** Prints HTML to PDF; defaults to POST <origin>/api/render-pdf as the user. */
  renderPdf?: (html: string) => Promise<Uint8Array | null>;
  now?: () => Date;
};

const refuse = (status: number, code: string, error: string, sealed = false): SealRefusal => ({ ok: false, status, code, error, ...(sealed ? { sealed: true } : {}) });
const sha256 = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const md5 = (b: Uint8Array) => createHash('md5').update(b).digest('hex');
const DEVICE = /^web_[A-Za-z0-9]{1,40}$/;
const SHARE_HOST = 'https://www.ledrixlabs.com/share/';

/** pushHomeRecord's version folder name (ShareService.reportVersionId), in UTC. */
export function reportVersionId(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}-${randomBytes(3).toString('hex')}`;
}

export async function sealFromWebsite(inspectionId: string, req: SealRequest, deps: SealDeps): Promise<SealDone | SealRefusal> {
  // 0 · attestation and the lock
  if (req?.attest !== true) return refuse(400, 'not_attested', 'Confirm that you inspected this property and that this report is your professional opinion.');
  if (!DEVICE.test(String(req.device ?? '')) || !Number.isInteger(req.epoch) || !Number.isInteger(req.expectNext) || req.expectNext < 1) return refuse(400, 'bad_request', 'Reload the page and try again.');
  const job = await readJob(inspectionId, deps);
  if (!job.ok) return job;
  const { f, base, H, rpc } = job.io;
  const json = { ...H, 'Content-Type': 'application/json' };
  const hb = await f(`${base}/rest/v1/rpc/heartbeat_edit`, { method: 'POST', headers: json, body: JSON.stringify({ p_inspection: inspectionId, p_device: req.device, p_epoch: req.epoch }), cache: 'no-store' });
  if (!hb.ok) return refuse(409, 'no_lock', 'This browser doesn’t hold the edit lock for this job any more. Take it again (Edit here) and seal.');

  // 1–2 · read, check and assemble — with the photos' bytes
  const lastVersion = job.lastVersion;
  if (lastVersion + 1 !== req.expectNext) return refuse(409, 'changed', `This report was sealed again (version ${lastVersion}) since you opened this page. Check again before sealing.`);
  const isFinalized = lastVersion > 0;
  const bytes = new Map<string, Uint8Array>();
  const readPhoto = async (uri: string): Promise<string | null> => {
    if (!uri || /^[a-z]+:/i.test(uri)) return null;   // a stored path only
    const r = await f(`${base}/storage/v1/object/authenticated/inspection-evidence/${uri}`, { headers: H, cache: 'no-store' });
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    bytes.set(uri, b);
    return Buffer.from(b).toString('base64');
  };
  const pubUrl = (path: string) => `${base}/storage/v1/object/public/inspection-pdfs/${path}`;
  const findingPath = (uri: string) => { const b = bytes.get(uri); return b ? `${inspectionId}/findings/${md5(b)}.jpg` : null; };
  const A = await (deps.loadAssemble ?? (async () => (await import('../report/assemble.mjs')) as any))();
  const R = await (deps.loadRender ?? (async () => (await import('../report/render.mjs')) as any))() as Pick<typeof Render, 'serverPhotoFor' | 'renderSealedReportHtml' | 'RECORD_PARTS'>;
  let rec: Assemble.AssembledRecord;
  try {
    rec = await serial(() => A.createAssembler().assembleServerRecord({
      rows: job.rows, timeZone: deps.timeZone ?? null, readPhoto,
      gates: { isFinalized, openConflicts: job.conflicts },
      publish: { inspectorId: job.uid, photoUrl: (u: string) => { const p = findingPath(u); return p ? pubUrl(p) : undefined; } },
    }));
  } catch { return refuse(502, 'unavailable', 'The report record could not be assembled. Nothing was sealed — try again.'); }
  const decision = decideSeal({ gates: rec.gates ?? null, reports: job.reports, team: job.team, labels: {} });
  if (!decision.sealable) return refuse(409, 'locked', `Not sealed: ${decision.locks.map(l => l.title).join(' · ')}.`);
  if (!rec.seal || !rec.homeRecord) return refuse(502, 'unavailable', 'The report record could not be assembled. Nothing was sealed — try again.');

  // 3 · the share token (found, or minted only when the server says there is none)
  let shareToken: string;
  {
    const r = await f(`${base}/rest/v1/home_records?share_id=eq.${encodeURIComponent(inspectionId)}&select=share_token`, { headers: H, cache: 'no-store' });
    if (!r.ok) return refuse(502, 'unavailable', 'Couldn’t confirm this report’s Home App link. Nothing was sealed — try again.');
    const t = ((await r.json()) as any[])[0]?.share_token;
    shareToken = typeof t === 'string' && t.length > 0 ? t : randomBytes(16).toString('hex');
  }

  // 4 · the seal row
  const hash = sha256(rec.seal.canonical);
  const pr = await f(`${base}/rest/v1/report_seals?inspection_id=eq.${encodeURIComponent(inspectionId)}&select=hash&order=created_at.desc&limit=1`, { headers: H, cache: 'no-store' });
  if (!pr.ok) return refuse(502, 'unavailable', 'Couldn’t read this report’s seals. Nothing was sealed — try again.');
  const parent = ((await pr.json()) as any[])[0]?.hash ?? null;
  const reSealed = parent === hash;
  if (!reSealed) {
    const ins = await f(`${base}/rest/v1/report_seals`, { method: 'POST', headers: { ...json, Prefer: 'return=minimal' },
      body: JSON.stringify({ hash, parent_hash: parent, inspection_id: inspectionId, inspector_id: job.uid, payload: rec.seal.payload }) });
    if (!ins.ok && ins.status !== 409) {
      const t = await ins.text().catch(() => '');
      if (!/23505|duplicate/i.test(t)) return refuse(ins.status === 403 ? 403 : 502, 'seal_refused', ins.status === 403 ? 'The server refused the seal (your account can’t seal this job, or two devices still disagree).' : 'The seal could not be written. Nothing was sealed — try again.');
    }
  }

  // 5 · the record object and its version
  const up = await f(`${base}/storage/v1/object/inspection-records/${inspectionId}/${rec.digest}.json`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', 'x-upsert': 'false' }, body: rec.canonical });
  if (!up.ok && up.status !== 409 && !(up.status === 400 && /Duplicate|exists/i.test(await up.text().catch(() => '')))) {
    return refuse(502, 'record_failed', 'Sealed, but the sealed record didn’t upload. Seal again to finish — it won’t seal twice.', true);
  }
  const rv = await rpc('record_report_version', { p_inspection: inspectionId, p_digest: rec.digest, p_sealed_hash: hash, p_schema: meta.frozenRecordSchema }) as { version?: number } | null;
  const version = Number(rv?.version ?? 0);
  if (!version) return refuse(502, 'record_failed', 'Sealed, but its version wasn’t recorded. Seal again to finish — it won’t seal twice.', true);

  // 6 · the report and its PDF
  const record = { inputs: rec.inputs, refs: rec.refs, evidence: rec.evidence };
  const signed = new Map<string, string>();
  {
    const paths = new Set<string>();
    const walk = (v: unknown, d = 0): void => { if (d > 40 || v == null) return; if (typeof v === 'string') { if (v.length < 2048) { const p = R.serverPhotoFor(v, inspectionId); if (p.kind === 'stored') paths.add(p.path); } return; }
      if (Array.isArray(v)) { for (const x of v) walk(x, d + 1); return; } if (typeof v === 'object') for (const x of Object.values(v as object)) walk(x, d + 1); };
    walk(record.inputs);
    const list = [...paths];
    for (let i = 0; i < list.length; i += 100) {
      const r = await f(`${base}/storage/v1/object/sign/inspection-evidence`, { method: 'POST', headers: json, body: JSON.stringify({ expiresIn: 3600, paths: list.slice(i, i + 100) }) });
      if (r.ok) for (const x of (await r.json()) as any[]) if (x?.path && x?.signedURL && !x?.error) signed.set(x.path, `${base}/storage/v1${String(x.signedURL).replace(/^\/storage\/v1/, '')}`);
    }
  }
  const photoUrl = (uri: string): string | null => { const p = R.serverPhotoFor(uri, inspectionId); return p.kind === 'url' ? p.url : p.kind === 'stored' ? (signed.get(p.path) ?? null) : null; };
  let html: string;
  try { html = await serial<string>(() => R.renderSealedReportHtml({ inspectionId, record, revision: { version, digest: rec.digest }, photoUrl, shareToken })); }
  catch { return refuse(502, 'render_failed', `Sealed (version ${version}), but the report couldn’t be rendered, so nothing was sent. Seal again to send it.`, true); }
  const renderPdf = deps.renderPdf ?? (async (h: string) => {
    const r = await f(`${deps.origin.replace(/\/+$/, '')}/api/render-pdf`, { method: 'POST', headers: { Authorization: H.Authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ html: h, inspectionId }) });
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  });
  const pdf = await renderPdf(html).catch(() => null);
  if (!pdf || pdf.length < 100) return refuse(502, 'pdf_failed', `Sealed (version ${version}), but the PDF couldn’t be made, so nothing was sent. Seal again to send it.`, true);

  // 7 · the Home App — stage, then one commit
  const warnings: string[] = [];
  const store = async (path: string, body: Uint8Array | string, type: string, overwrite = false): Promise<'ok' | 'exists' | 'failed'> => {
    const r = await f(`${base}/storage/v1/object/inspection-pdfs/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': type, 'x-upsert': overwrite ? 'true' : 'false' }, body: body as any });
    if (r.ok) return 'ok';
    const t = await r.text().catch(() => '');
    return r.status === 409 || (r.status === 400 && /Duplicate|exists/i.test(t)) ? 'exists' : 'failed';
  };
  for (const uri of rec.findingPhotos ?? []) {
    const p = findingPath(uri); const b = bytes.get(uri);
    if (p && b && (await store(p, b, 'image/jpeg')) === 'failed') warnings.push('A finding photo didn’t publish.');
  }
  let coverUrl: string | null = null;
  const cover = (rec.inputs as any)?.inspection?.heroImageUri as string | undefined;
  if (cover && bytes.get(cover)) {
    const p = `${inspectionId}/cover/${md5(bytes.get(cover)!)}.jpg`;
    if ((await store(p, bytes.get(cover)!, 'image/jpeg')) !== 'failed') coverUrl = pubUrl(p); else warnings.push('The cover photo didn’t publish — the previous cover is still shown.');
  }
  const vid = reportVersionId((deps.now ?? (() => new Date()))());
  const pdfPath = `${inspectionId}/reports/${vid}/report.pdf`, htmlPath = `${inspectionId}/reports/${vid}/report.html`;
  if ((await store(pdfPath, pdf, 'application/pdf')) !== 'ok') return refuse(502, 'publish_failed', `Sealed (version ${version}), but the PDF didn’t upload — nothing on the Home App changed. Seal again to send it.`, true);
  if ((await store(htmlPath, html, 'text/html')) !== 'ok') return refuse(502, 'publish_failed', `Sealed (version ${version}), but the web report didn’t upload — nothing on the Home App changed. Seal again to send it.`, true);
  const commit = { ...rec.homeRecord, share_token: shareToken, pdf_url: pubUrl(pdfPath), ...(coverUrl ? { cover_url: coverUrl } : {}) };
  const cr = await f(`${base}/rest/v1/home_records?on_conflict=share_id`, { method: 'POST', headers: { ...json, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(commit) });
  if (!cr.ok) return refuse(502, 'publish_failed', `Sealed (version ${version}), but the Home App record couldn’t be saved — nothing on it changed. Seal again to send it.`, true);
  if ((await store(`${inspectionId}/report.html`, html, 'text/html', true)) !== 'ok') warnings.push('The Home App’s web report didn’t refresh. Seal again to retry.');
  const ar = await f(`${base}/rest/v1/home_reports`, { method: 'POST', headers: { ...json, Prefer: 'return=minimal' },
    body: JSON.stringify({ share_id: inspectionId, version: vid, inspection_date: (rec.homeRecord as any).inspection_date ?? null, pdf_path: pdfPath, html_path: htmlPath }) });
  if (!ar.ok) warnings.push('The report history didn’t record this version.');

  // 8 · completed, under the lock (the server's versioned write rules)
  const insp = job.rows.inspection as any;
  if (insp.status !== 'completed') {
    const u = await f(`${base}/rest/v1/inspections?id=eq.${encodeURIComponent(inspectionId)}`, { method: 'PATCH', headers: { ...json, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'completed', completed_at: insp.completed_at ?? new Date().toISOString(), sync_base_version: insp.row_version, sync_device: req.device, lease_epoch: req.epoch }) });
    if (!u.ok) warnings.push('The inspection wasn’t marked completed — it shows as in progress until it is.');
  }
  return { ok: true, version, digest: rec.digest, shareUrl: `${SHARE_HOST}${shareToken}`, warnings, reSealed };
}
