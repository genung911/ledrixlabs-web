// ─── /api/passed-on?share=<share_id> — earlier owners' inspections of this home (hr2, SQL #155) ──────────────────────
//   GET  Authorization: Bearer <the signed-in homeowner's access token>   → 200 { ok, reports: [{ date, company, pdfUrl }] }
// The database decides who sees what (lib/passedOn.ts); the service role only signs each PDF for an hour.
import { NextRequest, NextResponse } from 'next/server';
import { loadPassedOn } from '../../../lib/passedOn';
import { signInspectionPdfsPath } from '../../../lib/storageSign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function GET(req: NextRequest) {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  const r = await loadPassedOn(req.nextUrl.searchParams.get('share') ?? '', { supaUrl: SUPA_URL, anonKey: ANON, token, sign: p => signInspectionPdfsPath(p, 60 * 60) });
  const headers = { 'Cache-Control': 'private, no-store' };
  return r.ok ? NextResponse.json(r, { headers }) : NextResponse.json({ error: r.error }, { status: r.status, headers });
}
