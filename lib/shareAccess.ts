// ─── shareAccess — the share token as the credential for report assets (Phase 0b) ─────
// SERVER-ONLY: holds the service role. Import from route handlers only.
//
// ── WHAT WAS OPEN (2026-10-10) ──────────────────────────────────────────────────────────
// /api/photo, /api/report-asset and /api/reports signed or read with the service role for ANY
// caller and ANY path. Object paths are `<inspection id>/…` and inspection ids are `insp_<ms>` —
// time-ordered, so walkable. Anyone could fetch any company's report PDF, report HTML, cover,
// finding photos and evidence photos, and /api/reports rendered any inspection's confirmed
// findings — no storage policy could stop it, because the service role bypasses them all.
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────
// The same credential /api/share and /api/portal already use: the share TOKEN, resolved
// server-side to exactly one share_id (= the inspection id). An object is reachable only if its
// path lives under that share:
//     <share_id>/…              report.pdf · report.html · cover.jpg · findings/* · reports/<v>/*
//                                (inspection-pdfs) and every evidence photo (inspection-evidence)
//     report/<share_id>/…       the PDF's hosted photos (photoStorage.uploadPublicPhoto)
// The path check is not optional even for paths the server read itself: home_records rows and
// anomaly image_uri values are written by the inspector, so a path stored on ONE share must not be
// able to name an object of another.

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Token resolution needs the service role; there is deliberately no anon fallback. */
export function shareAccessConfigured(): boolean {
  return !!SUPA_URL && !!SERVICE;
}

/** The token resolves to exactly one share_id, or to nothing. Same shape gate as /api/share. */
export async function shareIdForToken(token: string | null | undefined): Promise<string | null> {
  if (!shareAccessConfigured()) return null;
  const slug = String(token ?? '').trim();
  if (!slug || slug.length > 128 || !/^[A-Za-z0-9._-]+$/.test(slug)) return null;
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/home_records?share_token=eq.${encodeURIComponent(slug)}&select=share_id&limit=1`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }, cache: 'no-store' },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    const id = Array.isArray(rows) && rows.length ? String(rows[0]?.share_id ?? '') : '';
    // A share_id becomes a path prefix below, so it must be one plain segment.
    return id && /^[A-Za-z0-9._-]+$/.test(id) && id !== '.' && id !== '..' ? id : null;
  } catch {
    return null;
  }
}

/** True when a bucket-relative object path belongs to the share. */
export function pathInShare(path: string | null | undefined, shareId: string): boolean {
  const p = String(path ?? '');
  if (!p || !shareId) return false;
  if (p.includes('..') || p.includes('\\') || p.includes('//') || p.startsWith('/')) return false;
  if (/[\u0000-\u001f?#%]/.test(p)) return false;   // no control chars, query, fragment or re-encoding
  return p.startsWith(`${shareId}/`) || p.startsWith(`report/${shareId}/`);
}
