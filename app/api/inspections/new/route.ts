// ─── /api/inspections/new — start an inspection from the website ───────────────────────────────────────────────────
//
//   POST /api/inspections/new    Authorization: Bearer <the workspace session's access token>
//        { device: "web_…", templateId, record: {…the intake, as the phone's record holds it}, leadId?, notes?, extras?, today? }
//   → 200 { ok: true, id, templateName, warnings }
//   → 4xx/5xx { error, code, id? }   (signed_out · bad_request · missing_fields · not_allowed · template_unavailable ·
//                                     exists · create_failed · template_failed · unavailable)
//
// Owner 2026-11-05 (office pages, "use all recommendations"): the job is made by the phone's own create on the server
// (lib/newJob/create.ts → lib/report/newjob.mjs), written as the caller — row-level security and the add_inspections
// permission decide; no service-role key.
import { NextRequest, NextResponse } from 'next/server';
import { createJobFromWebsite } from '../../../../lib/newJob/create';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function POST(req: NextRequest) {
  if (!SUPA_URL || !ANON) return NextResponse.json({ error: 'Not available.', code: 'unavailable' }, { status: 503 });
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Reload the page and try again.', code: 'bad_request' }, { status: 400 }); }
  const r = await createJobFromWebsite({
    device: String(body?.device ?? ''), templateId: String(body?.templateId ?? ''),
    record: body?.record && typeof body.record === 'object' ? body.record : {},
    leadId: typeof body?.leadId === 'string' && body.leadId ? body.leadId : null,
    notes: typeof body?.notes === 'string' ? body.notes.slice(0, 4000) : '',
    extras: body?.extras && typeof body.extras === 'object' ? body.extras : {},
    today: typeof body?.today === 'string' && /^\d{4}-\d\d-\d\d$/.test(body.today) ? body.today : undefined,
  }, { supaUrl: SUPA_URL, anonKey: ANON, token });
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code, ...(r.id ? { id: r.id } : {}) }, { status: r.status, headers });
  return NextResponse.json(r, { headers });
}
