import { NextRequest, NextResponse } from 'next/server';
import { SOP_SYSTEMS, systemForUnit, severityMeta, SOP_TEMPLATE_VERSION } from '../../../lib/sopTemplate';

// ─── /api/reports?inspectionId=… ─────────────────────────────────────────────
// Stateless: pull the inspection + its HITL-confirmed anomalies from Supabase,
// sign each evidence photo (private bucket, short-lived URL), map to the generic
// InterNACHI-style SOP layout, and return a standalone HTML report. Nothing is
// stored here — the report is always live against the latest synced data.
//
// Env (Vercel): NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only;
// needed to read across RLS and to sign private-bucket objects). Falls back to
// NEXT_PUBLIC_SUPABASE_ANON_KEY for reads if the service key is absent.

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET   = 'inspection-evidence';
const SIGN_TTL = 3600; // 1h

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

async function rest(path: string) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H, cache: 'no-store' });
  return r.ok ? r.json() : null;
}

// Sign a private-bucket object path → short-lived absolute URL. Skips anything
// that isn't a storage path (legacy local file:// or an already-absolute URL).
async function signPhoto(imageUri?: string | null): Promise<string | null> {
  if (!imageUri) return null;
  if (imageUri.startsWith('http')) return imageUri;
  if (imageUri.startsWith('file')) return null;            // not yet uploaded
  try {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${imageUri}`, {
      method: 'POST', headers: H, body: JSON.stringify({ expiresIn: SIGN_TTL }),
    });
    if (!r.ok) return null;
    const { signedURL } = await r.json();
    return signedURL ? `${SUPA_URL}/storage/v1${signedURL.replace(/^\/storage\/v1/, '')}` : null;
  } catch { return null; }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function GET(req: NextRequest) {
  if (!SUPA_URL || !SUPA_KEY) {
    return NextResponse.json({ error: 'Supabase env not configured on Vercel' }, { status: 500 });
  }
  const id = req.nextUrl.searchParams.get('inspectionId');
  if (!id) return NextResponse.json({ error: 'missing inspectionId' }, { status: 400 });

  const [insps, anoms] = await Promise.all([
    rest(`inspections?id=eq.${encodeURIComponent(id)}&select=*`),
    rest(`anomalies?inspection_id=eq.${encodeURIComponent(id)}&status=eq.confirmed&select=*`),
  ]);
  const inspection = Array.isArray(insps) ? insps[0] : null;
  if (!inspection) return NextResponse.json({ error: 'inspection not found' }, { status: 404 });

  const findings: any[] = Array.isArray(anoms) ? anoms : [];
  const signed = await Promise.all(findings.map(f => signPhoto(f.image_uri)));
  findings.forEach((f, i) => { f._photo = signed[i]; });

  // Group by SOP system, ordered; severity rank within each section.
  const bySystem = new Map<string, any[]>();
  for (const f of findings) {
    const k = systemForUnit(f.unit);
    const arr = bySystem.get(k) ?? [];
    arr.push(f);
    bySystem.set(k, arr);
  }
  const counts = findings.reduce<Record<string, number>>((m, f) => {
    const s = (f.severity ?? 'deficiency').toLowerCase(); m[s] = (m[s] ?? 0) + 1; return m;
  }, {});

  const sectionsHtml = SOP_SYSTEMS
    .filter(sys => bySystem.has(sys.key))
    .map(sys => {
      const rows = (bySystem.get(sys.key) ?? [])
        .sort((a, b) => severityMeta(a.severity).rank - severityMeta(b.severity).rank)
        .map(f => {
          const m = severityMeta(f.severity);
          const loc = f.room || f.location;
          return `
          <div class="finding">
            <div class="fhead">
              <span class="chip" style="--c:${m.color}">${esc(m.label)}</span>
              ${loc ? `<span class="loc">${esc(loc)}</span>` : ''}
            </div>
            <p class="desc">${esc(f.description) || 'No description provided.'}</p>
            ${f._photo ? `<img class="photo" src="${esc(f._photo)}" alt="evidence" loading="lazy"/>` : ''}
            <div class="meta">
              ${f.estimated_cost ? `<span>Est. cost: ${esc(f.estimated_cost)}</span>` : ''}
              ${f.pros_to_call ? `<span>Recommended: ${esc(f.pros_to_call)}</span>` : ''}
            </div>
          </div>`;
        }).join('');
      return `<section><h2>${esc(sys.label)}</h2>${rows}</section>`;
    }).join('');

  const summary = ['critical', 'deficiency', 'maintenance']
    .filter(s => counts[s])
    .map(s => `<span class="sumchip" style="--c:${severityMeta(s).color}">${counts[s]} ${esc(severityMeta(s).label)}</span>`)
    .join('');

  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Inspection Report — ${esc(inspection.address ?? 'Property')}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#16181d;background:#f5f6f8}
  .wrap{max-width:820px;margin:0 auto;padding:24px 18px 64px}
  header{border-bottom:2px solid #16181d;padding-bottom:14px;margin-bottom:6px}
  .brand{font-size:11px;font-weight:800;letter-spacing:2px;color:#00838f}
  h1{font-size:22px;margin:6px 0 2px} .sub{color:#5b6470;font-size:13px}
  .summary{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
  .sumchip{font-size:12px;font-weight:800;padding:5px 10px;border-radius:99px;color:var(--c);border:1px solid var(--c);background:color-mix(in srgb,var(--c) 10%,white)}
  section{margin-top:22px} h2{font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#00838f;border-bottom:1px solid #dfe3e8;padding-bottom:6px}
  .finding{background:#fff;border:1px solid #e6e9ee;border-radius:12px;padding:14px;margin-top:12px}
  .fhead{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .chip{font-size:11px;font-weight:800;color:var(--c);border:1px solid var(--c);border-radius:6px;padding:2px 7px}
  .loc{font-size:11px;font-weight:700;color:#5b6470;letter-spacing:.5px}
  .desc{margin:6px 0;white-space:pre-line}
  .photo{display:block;width:100%;max-height:420px;object-fit:cover;border-radius:8px;margin:8px 0}
  .meta{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#5b6470;margin-top:4px}
  .empty{color:#5b6470;margin-top:24px} footer{margin-top:40px;font-size:11px;color:#9aa3ad;text-align:center}
</style></head><body><div class="wrap">
  <header>
    <div class="brand" style="display:inline-flex;align-items:center;gap:7px"><svg width="17" height="17" viewBox="0 0 100 100" fill="none" style="display:block"><mask id="rdl"><rect width="100" height="100" fill="#fff"/><rect x="29.2" y="74.64" width="20.8" height="12" fill="#000"/></mask><path d="M50 15.36 L90 84.64 L10 84.64 Z M47.40 28.86 L20.39 75.64 L74.41 75.64 Z" fill="#0b0b0b" fill-rule="evenodd" mask="url(#rdl)"/></svg><span>LEDRIX · INSPECTION REPORT</span></div>
    <h1>${esc(inspection.address ?? 'Property')}</h1>
    <div class="sub">${[inspection.inspection_type, inspection.year_built && `Built ${inspection.year_built}`, inspection.sqft && `${inspection.sqft} sq ft`].filter(Boolean).map(esc).join(' · ')}</div>
  </header>
  <div class="summary">${summary || '<span class="sumchip" style="--c:#22c55e">No defects logged</span>'}</div>
  ${sectionsHtml || '<p class="empty">No confirmed findings for this inspection yet.</p>'}
  <footer>Generated by Ledrix · ${findings.length} confirmed finding(s) · template ${SOP_TEMPLATE_VERSION}</footer>
</div></body></html>`;

  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
