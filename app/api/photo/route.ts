// ─── /api/photo?path=<storage-path> ──────────────────────────────────────────
// Evidence photos live in a PRIVATE Supabase bucket (inspection-evidence), so the
// portal can't <img src> them directly. This signs the path server-side (service
// role) and 302-redirects to the short-lived signed URL, so an <img> just works.
// Access posture matches the rest of the portal: the storage path is only known to
// someone who already has the inspection data (which requires the secret share_id),
// and the evidence filenames are unguessable. Skips absolute/local URLs.
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET   = 'inspection-evidence';
const SIGN_TTL = 3600; // 1h

export async function GET(req: NextRequest) {
  const path = (req.nextUrl.searchParams.get('path') ?? '').trim();
  if (!path) return new NextResponse(null, { status: 404 });
  if (/^https?:\/\//.test(path)) return NextResponse.redirect(path);            // already public/absolute
  if (path.startsWith('file') || path.startsWith('/') || path.includes('..')) return new NextResponse(null, { status: 404 });
  if (!SUPA_URL || !SUPA_KEY) return new NextResponse(null, { status: 500 });

  try {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGN_TTL }),
    });
    if (!r.ok) return new NextResponse(null, { status: 404 });
    const { signedURL } = await r.json();
    if (!signedURL) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(`${SUPA_URL}/storage/v1${signedURL.replace(/^\/storage\/v1/, '')}`);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
