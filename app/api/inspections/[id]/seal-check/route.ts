// ─── /api/inspections/[id]/seal-check — what stands between this job and a seal (read-only) ─────────────────────────
//
//   GET /api/inspections/<id>/seal-check    Authorization: Bearer <the workspace session's access token>
//   → 200 { locks, notes, phoneOnly, sealable, isFinalized, nextVersion, conflicts, dataMap, preview }
//   → 4xx/5xx { error, code }   (bad_request · signed_out · not_found · unavailable)
//
// 10c of ledrix-app "Seal and send on the website" (DECISIONS 2026-11-03 (fourth)): the Seal & send panel's data. The
// job is assembled from the server's rows by the phone's own code and checked by the phone's own release gates; the
// phones' own reports say what is still only on them. Read as the caller (lib/seal/check.ts) — row-level security
// decides; no service-role key; nothing is written. The preview is returned as data, for a sandboxed frame.
import { NextRequest, NextResponse } from 'next/server';
import { loadSealCheck } from '../../../../../lib/seal/check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const ZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!SUPA_URL || !ANON) return NextResponse.json({ error: 'Not available.', code: 'unavailable' }, { status: 503 });
  const { id } = await ctx.params;
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  const tz = req.nextUrl.searchParams.get('tz') ?? '';
  const r = await loadSealCheck(id, { supaUrl: SUPA_URL, anonKey: ANON, token, timeZone: ZONE.test(tz) ? tz : null });
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status, headers });
  return NextResponse.json(r, { headers });
}
