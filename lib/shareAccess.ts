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

import { createHash } from 'node:crypto';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Token resolution needs the service role; there is deliberately no anon fallback. */
export function shareAccessConfigured(): boolean {
  return !!SUPA_URL && !!SERVICE;
}

// ── SCOPED LINKS (homeowner security pass 2, 2026-10-19) ─────────────────────────────────
// A portal link now carries a SCOPE:
//   edit     the original home_records.share_token (the link the inspector delivers and prints as
//            the report's QR code) — read the home and change what homeowners may change. Every
//            existing link keeps exactly this access; nothing about it changes.
//   read     a view-only link an edit holder mints to share the home without handing over edit.
//   repairs  a link that shows only the repair request: address, inspection date, included items.
// Minted links live in `portal_links` (supabase_portal_links.sql) as a SHA-256 hash — the token
// itself is never stored. The same table revokes: a row whose hash matches a token and whose
// revoked_at is set refuses that token, including an original share_token, so a homeowner's link
// can be withdrawn without touching home_records (the inspector's record, re-synced by the app).
//
// Possession of a link proves possession, not identity. Nothing here treats it as more.
//
// Until the table exists, PostgREST answers 404 for it and every token resolves exactly as before
// (edit via share_token, nothing else). Any OTHER failure looking it up refuses the token: a
// revocation that cannot be checked is not assumed absent.

export type PortalScope = 'edit' | 'read' | 'repairs';
export type PortalAccess = { shareId: string; scope: PortalScope; linkId: string | null };

const svcHeaders = () => ({ apikey: SERVICE, Authorization: `Bearer ${SERVICE}` });

/** Tokens are stored and matched only as this hash. */
export function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

const plainId = (id: unknown): string | null => {
  const s = String(id ?? '');
  return s && /^[A-Za-z0-9._-]+$/.test(s) && s !== '.' && s !== '..' ? s : null;
};

/** The token's share and scope, or null. Shape gate as /api/share; non-strings never coerced. */
export async function resolvePortalToken(token: unknown): Promise<PortalAccess | null> {
  if (!shareAccessConfigured()) return null;
  if (typeof token !== 'string') return null;
  const slug = token.trim();
  if (!slug || slug.length > 128 || !/^[A-Za-z0-9._-]+$/.test(slug)) return null;
  try {
    const links = await fetch(
      `${SUPA_URL}/rest/v1/portal_links?token_hash=eq.${tokenHash(slug)}&select=id,share_id,scope,revoked_at&limit=1`,
      { headers: svcHeaders(), cache: 'no-store' },
    );
    if (links.ok) {
      const rows = await links.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) {
        if (row.revoked_at) return null;
        const shareId = plainId(row.share_id);
        const scope = row.scope === 'edit' || row.scope === 'read' || row.scope === 'repairs' ? row.scope : null;
        return shareId && scope ? { shareId, scope, linkId: String(row.id) } : null;
      }
    } else if (links.status !== 404) {
      return null;                                     // fail closed: revocation state unknown
    }
    const r = await fetch(
      `${SUPA_URL}/rest/v1/home_records?share_token=eq.${encodeURIComponent(slug)}&select=share_id&limit=1`,
      { headers: svcHeaders(), cache: 'no-store' },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    const shareId = Array.isArray(rows) && rows.length ? plainId(rows[0]?.share_id) : null;
    return shareId ? { shareId, scope: 'edit', linkId: null } : null;
  } catch {
    return null;
  }
}

/**
 * The share a token may READ the home through (edit or read scope), or null. A repairs link is
 * not enough to read the home: it reaches only its own view (/api/share, /api/portal home_repairs).
 */
export async function shareIdForToken(token: unknown): Promise<string | null> {
  const access = await resolvePortalToken(token);
  return access && access.scope !== 'repairs' ? access.shareId : null;
}

/** The share a token may CHANGE, or null — edit scope only. */
export async function editShareIdForToken(token: unknown): Promise<string | null> {
  const access = await resolvePortalToken(token);
  return access && access.scope === 'edit' ? access.shareId : null;
}

/** True when a bucket-relative object path belongs to the share. */
export function pathInShare(path: string | null | undefined, shareId: string): boolean {
  const p = String(path ?? '');
  if (!p || !shareId) return false;
  if (p.includes('..') || p.includes('\\') || p.includes('//') || p.startsWith('/')) return false;
  if (/[\u0000-\u001f?#%]/.test(p)) return false;   // no control chars, query, fragment or re-encoding
  return p.startsWith(`${shareId}/`) || p.startsWith(`report/${shareId}/`);
}
