import { NextRequest, NextResponse } from 'next/server';
import { SOP_SYSTEMS, systemForUnit, severityMeta, SOP_TEMPLATE_VERSION } from '../../../../../lib/sopTemplate';

// ─── /api/reports/seal/[hash] ────────────────────────────────────────────────
// Renders a FROZEN inspection report from a sealed entry in `report_seals`.
//
// Unlike /api/reports?inspectionId=… (which reads the live `inspections` /
// `anomalies` tables and reflects the latest sync), this route reads only the
// immutable payload stored at seal time. Even if the inspector later edits or
// re-syncs, this URL always renders what was sealed.
//
// Photo paths inside the payload are signed against the private Storage bucket
// the same way the live route signs them (short-lived URLs).

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

async function signPhoto(imageUri?: string | null): Promise<string | null> {
  if (!imageUri) return null;
  if (imageUri.startsWith('http')) return imageUri;
  if (imageUri.startsWith('file')) return null;
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

const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ hash: string }> }) {
  if (!SUPA_URL || !SUPA_KEY) {
    return NextResponse.json({ error: 'Supabase env not configured on Vercel' }, { status: 500 });
  }
  const { hash } = await ctx.params;
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    return NextResponse.json({ error: 'invalid seal hash' }, { status: 400 });
  }

  const seals = await rest(`report_seals?hash=eq.${encodeURIComponent(hash)}&select=hash,parent_hash,inspection_id,payload,created_at`);
  const seal = Array.isArray(seals) ? seals[0] : null;
  if (!seal) return NextResponse.json({ error: 'seal not found' }, { status: 404 });

  const payload = seal.payload ?? {};
  const inspection = payload.inspection ?? {};
  const findings: any[] = Array.isArray(payload.anomalies) ? payload.anomalies : [];

  // Sign photo paths in the frozen payload. (The paths themselves are sealed;
  // only the URL signature is regenerated each request.)
  const signed = await Promise.all(findings.map(f => signPhoto(f.image_uri ?? f.imageUri)));
  findings.forEach((f, i) => { f._photo = signed[i]; });

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

  const sealedAt = seal.created_at ? new Date(seal.created_at).toLocaleString() : '';
  const parentNote = seal.parent_hash
    ? `<span class="parent">amends <a href="/api/reports/seal/${esc(seal.parent_hash)}">${esc(shortHash(seal.parent_hash))}</a></span>`
    : '';

  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Sealed Inspection Report — ${esc(inspection.address ?? 'Property')}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#16181d;background:#f5f6f8}
  .wrap{max-width:820px;margin:0 auto;padding:24px 18px 64px}
  header{border-bottom:2px solid #16181d;padding-bottom:14px;margin-bottom:6px}
  .brand{font-size:11px;font-weight:800;letter-spacing:2px;color:#00838f}
  h1{font-size:22px;margin:6px 0 2px} .sub{color:#5b6470;font-size:13px}
  .sealbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0 4px;font-size:11px;color:#5b6470;font-family:ui-monospace,monospace}
  .sealbar .badge{font-weight:800;letter-spacing:1.5px;color:#16181d;background:#e6f7f9;border:1px solid #00838f;border-radius:4px;padding:2px 8px}
  .sealbar a{color:#00838f;text-decoration:none}
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
  .empty{color:#5b6470;margin-top:24px} footer{margin-top:40px;font-size:11px;color:#9aa3ad;text-align:center;font-family:ui-monospace,monospace;word-break:break-all}
</style></head><body><div class="wrap">
  <header>
    <div class="brand">LEDRIX · SEALED INSPECTION REPORT</div>
    <h1>${esc(inspection.address ?? 'Property')}</h1>
    <div class="sub">${[inspection.inspection_type ?? inspection.inspectionType, inspection.year_built ?? inspection.yearBuilt ? `Built ${inspection.year_built ?? inspection.yearBuilt}` : null, inspection.sqft ? `${inspection.sqft} sq ft` : null].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="sealbar">
      <span class="badge">SEAL</span>
      <span>${esc(shortHash(seal.hash))}</span>
      ${sealedAt ? `<span>· sealed ${esc(sealedAt)}</span>` : ''}
      ${parentNote ? `<span>·</span>${parentNote}` : ''}
    </div>
  </header>
  <div class="summary">${summary || '<span class="sumchip" style="--c:#22c55e">No defects logged</span>'}</div>
  ${sectionsHtml || '<p class="empty">No confirmed findings in this seal.</p>'}
  <footer>Sealed snapshot · template ${SOP_TEMPLATE_VERSION} · ${esc(seal.hash)}</footer>
</div></body></html>`;

  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
