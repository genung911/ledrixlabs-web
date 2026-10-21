// ─── /api/portal-links — view-only and repairs-only links, minted from an edit link ──────
//
// (Homeowner security pass 2, 2026-10-19.)
//
// Sharing the portal used to mean handing over the portal's ONE credential — the edit link the
// inspector delivered (and printed as the report's QR code). Anyone it was forwarded to could change
// the home record, and the repair-request link was built from the share_id, which no route accepts.
// This route lets the holder of an EDIT link mint narrower links instead:
//   read     view the home; no changes (lib/portalPolicy.ts scopeAllows).
//   repairs  view only the repair request: address, inspection date, included items.
//
//   POST {action:'create', token, scope}   → { token, id, scope }   (the new link's token, once)
//   POST {action:'list',   token}          → [{ id, scope, created_at, revoked_at }]
//   POST {action:'revoke', token, id}      → 204
//
// Only edit links may call it. A link can never mint or revoke an EDIT link here: withdrawing the
// original link is a staff action (supabase_portal_links.sql, "Revoke a homeowner's original
// link"), because the only proof an edit holder offers is possession — a leaked link must not be
// able to lock the homeowner out. Tokens are stored only as SHA-256 hashes.
//
// Until supabase_portal_links.sql is applied, `portal_links` does not exist and create/list answer
// 503 "not available yet"; nothing else changes.
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { editShareIdForToken, shareAccessConfigured, tokenHash } from '../../../lib/shareAccess';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

/** Active minted links per home. Bounds the table, not a product limit anyone should meet. */
const MAX_ACTIVE_LINKS = 25;

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });
const bad = () => NextResponse.json({ error: 'Bad request.' }, { status: 400 });
const unavailable = () => NextResponse.json({ error: 'Link sharing is not available yet.' }, { status: 503 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!shareAccessConfigured()) return notFound();
  let body: { action?: unknown; token?: unknown; scope?: unknown; id?: unknown };
  try { body = await req.json(); } catch { return bad(); }
  const shareId = await editShareIdForToken(body.token);
  if (!shareId) return notFound();
  const base = `${SUPA_URL}/rest/v1/portal_links`;
  const sid = encodeURIComponent(shareId);

  try {
    if (body.action === 'list') {
      const r = await fetch(`${base}?share_id=eq.${sid}&scope=in.(read,repairs)&select=id,scope,created_at,revoked_at&order=created_at.desc&limit=100`,
        { headers: svc, cache: 'no-store' });
      if (r.status === 404) return unavailable();
      if (!r.ok) return NextResponse.json({ error: 'Not available.' }, { status: 502 });
      return NextResponse.json(await r.json(), { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (body.action === 'create') {
      const scope = body.scope === 'read' || body.scope === 'repairs' ? body.scope : null;
      if (!scope) return bad();
      const active = await fetch(`${base}?share_id=eq.${sid}&revoked_at=is.null&scope=in.(read,repairs)&select=id`,
        { headers: svc, cache: 'no-store' });
      if (active.status === 404) return unavailable();
      if (!active.ok) return NextResponse.json({ error: 'Not available.' }, { status: 502 });
      if ((await active.json()).length >= MAX_ACTIVE_LINKS) {
        return NextResponse.json({ error: 'Too many active links — revoke one first.' }, { status: 409 });
      }
      const token = randomBytes(32).toString('base64url');          // 43 chars, [A-Za-z0-9_-]
      const ins = await fetch(base, {
        method: 'POST', headers: { ...svc, Prefer: 'return=representation' },
        body: JSON.stringify([{ share_id: shareId, token_hash: tokenHash(token), scope, created_via: 'portal' }]),
      });
      if (ins.status === 404) return unavailable();
      if (!ins.ok) return NextResponse.json({ error: 'Not available.' }, { status: 502 });
      const [row] = await ins.json();
      return NextResponse.json({ token, id: row?.id, scope }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (body.action === 'revoke') {
      if (typeof body.id !== 'string' || !UUID.test(body.id)) return notFound();
      // Confined to this home, to minted read/repairs links, and to ones still active.
      const r = await fetch(`${base}?id=eq.${encodeURIComponent(body.id)}&share_id=eq.${sid}`
        + `&scope=in.(read,repairs)&revoked_at=is.null`, {
        method: 'PATCH', headers: { ...svc, Prefer: 'return=representation' },
        body: JSON.stringify({ revoked_at: new Date().toISOString(), revoked_reason: 'revoked from portal' }),
      });
      if (r.status === 404) return unavailable();
      if (!r.ok) return NextResponse.json({ error: 'Not available.' }, { status: 502 });
      const rows = await r.json().catch(() => []);
      return Array.isArray(rows) && rows.length ? new NextResponse(null, { status: 204 }) : notFound();
    }

    return bad();
  } catch {
    return notFound();
  }
}
