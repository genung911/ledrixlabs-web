// ─── /api/inspections/[id]/report — the sealed report, rendered on the website ──────────────────────────────────────
//
//   GET /api/inspections/<id>/report[?version=N]    Authorization: Bearer <the workspace session's access token>
//   → 200 { html, version, digest, sealedAt, packVersion, photos: { shown, phoneOnly } }
//   → 4xx/5xx { error, code }   (signed_out · not_sealed · record_missing · record_mismatch · record_schema ·
//                                pack_missing · pack_mismatch · unavailable · render_failed)
//
// ledrix-app DECISIONS 2026-11-02, "Seal and send on the website", step 2: the newest (or named) sealed version,
// rendered from its record by the phone's own report builder — the same page the phone produced. Everything is read
// as the caller (lib/report/sealedReport.ts): row-level security decides who may see it; this route holds no
// service-role key. The page is returned as data, for the workspace to show in a sandboxed frame.
import { NextRequest, NextResponse } from 'next/server';
import { loadSealedReport } from '../../../../../lib/report/sealedReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!SUPA_URL || !ANON) return NextResponse.json({ error: 'Not available.', code: 'unavailable' }, { status: 503 });
  const { id } = await ctx.params;
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  const v = req.nextUrl.searchParams.get('version');
  const version = v == null || v === '' ? null : Number(v);
  const r = await loadSealedReport(id, version, { supaUrl: SUPA_URL, anonKey: ANON, token });
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status, headers });
  return NextResponse.json(r, { headers });
}
