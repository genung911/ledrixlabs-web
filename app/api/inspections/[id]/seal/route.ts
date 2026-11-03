// ─── /api/inspections/[id]/seal — seal and send from the website ───────────────────────────────────────────────────
//
//   POST /api/inspections/<id>/seal    Authorization: Bearer <the workspace session's access token>
//        { attest: true, device: "web_…", epoch: <the edit lock's epoch>, expectNext: <the version the person saw> }
//   → 200 { version, digest, shareUrl, warnings, reSealed }
//   → 4xx/5xx { error, code, sealed? }   (not_attested · bad_request · signed_out · not_found · no_lock · changed ·
//                                         locked · seal_refused · record_failed · render_failed · pdf_failed ·
//                                         publish_failed · unavailable)
//
// 10d of ledrix-app "Seal and send on the website" (DECISIONS 2026-11-03 (fourth)). Everything as the caller
// (lib/seal/seal.ts): row-level security decides; no service-role key. The PDF is printed by /api/render-pdf, with the
// caller's session, so its render budget applies.
import { NextRequest, NextResponse } from 'next/server';
import { sealFromWebsite } from '../../../../../lib/seal/seal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const ZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!SUPA_URL || !ANON) return NextResponse.json({ error: 'Not available.', code: 'unavailable' }, { status: 503 });
  const { id } = await ctx.params;
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Reload the page and try again.', code: 'bad_request' }, { status: 400 }); }
  const tz = typeof body?.tz === 'string' && ZONE.test(body.tz) ? body.tz : null;
  const r = await sealFromWebsite(id, { attest: body?.attest === true, device: String(body?.device ?? ''), epoch: Number(body?.epoch), expectNext: Number(body?.expectNext) },
    { supaUrl: SUPA_URL, anonKey: ANON, token, timeZone: tz, origin: req.nextUrl.origin });
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code, ...(r.sealed ? { sealed: true } : {}) }, { status: r.status, headers });
  return NextResponse.json(r, { headers });
}
