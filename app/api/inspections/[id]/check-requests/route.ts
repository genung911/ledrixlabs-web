// ─── /api/inspections/[id]/check-requests — repairs the homeowner fixed and asked you to check ───────────────────────
//
//   GET /api/inspections/<id>/check-requests    Authorization: Bearer <the workspace session's access token>
//   → 200 { ok: true, requests: CheckRequest[] }   → 4xx/5xx { error }
//
// Approval pack item 3 (owner 2026-11-25). Row-level security decides who sees them (the caller's own token reads first;
// lib/checkRequests.ts); the service role only adds the finding's words and the asking homeowner's email. Mark verified
// is not here: the page calls mark_finding_verified (#154) as the signed-in inspector.
import { NextRequest, NextResponse } from 'next/server';
import { loadCheckRequests } from '../../../../../lib/checkRequests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  const r = await loadCheckRequests(id, { supaUrl: SUPA_URL, anonKey: ANON, serviceKey: SERVICE, token });
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers });
  return NextResponse.json(r, { headers });
}
