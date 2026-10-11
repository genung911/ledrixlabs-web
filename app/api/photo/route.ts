// ─── /api/photo?path=<storage-path>&t=<share token> ──────────────────────────
// Evidence photos live in a PRIVATE Supabase bucket (inspection-evidence), so the
// portal can't <img src> them directly. This signs the path server-side (service
// role) and 302-redirects to the short-lived signed URL, so an <img> just works.
//
// Phase 0b (2026-10-10): this used to sign ANY path for ANY caller, on the theory that only a
// share holder knows the path. Evidence paths are `<inspection id>/…` and inspection ids are
// `insp_<ms>`, so that theory did not hold. The share token is now REQUIRED and the path must
// belong to the share it names (lib/shareAccess.ts). The absolute-URL passthrough is gone too:
// the portal never sends one (photoUrl() returns absolute URLs directly), so it was only ever an
// open redirect. Every miss is the same opaque 404.
import { NextRequest, NextResponse } from 'next/server';
import { shareIdForToken, pathInShare, shareAccessConfigured } from '../../../lib/shareAccess';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET   = 'inspection-evidence';
const SIGN_TTL = 3600; // 1h

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET(req: NextRequest) {
  const path = (req.nextUrl.searchParams.get('path') ?? '').trim();
  if (!path) return notFound();
  if (!shareAccessConfigured()) return new NextResponse(null, { status: 500 });
  const shareId = await shareIdForToken(req.nextUrl.searchParams.get('t'));
  if (!shareId || !pathInShare(path, shareId)) return notFound();

  try {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGN_TTL }),
    });
    if (!r.ok) return notFound();
    const { signedURL } = await r.json();
    if (!signedURL) return notFound();
    return NextResponse.redirect(`${SUPA_URL}/storage/v1${signedURL.replace(/^\/storage\/v1/, '')}`,
      { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch {
    return notFound();
  }
}
