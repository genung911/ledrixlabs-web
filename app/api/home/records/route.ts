// /api/home/records — the inspection reports a signed-in homeowner holds for one home, for the Ledrix Home app
// (h8 phase 2b, owner 2026-11-27; the "/api/home/records" step planned as h3 in DECISIONS 2026-11-12 "One Home").
//
// home_records is readable only by the inspector's company, and its stored findings can still hold inspector-only fields,
// so the app cannot read it directly. This route returns EXACTLY what the share page does — publishedFindings /
// publishedSpecs (lib/publishedRecord.ts, the allow-list) — for each report of the home whose tenure THIS PERSON can
// read. That decision is the database's own: tenure_access(), called AS the person (their JWT), never re-derived here.
// The repair statuses (home_finding_status) are read as the person too, so RLS decides those as well.
//
//   POST { homeId }   Authorization: Bearer <the person's access token>   →   { reports: [...] }
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publishedFindings, publishedSpecs } from '@/lib/publishedRecord';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
/** The header a report shows (never share_token, inspector_id or id). */
const RECORD_FIELDS = 'share_id, address, inspection_date, inspection_type, inspector, company, year_built, sqft, anomalies, specs';

export async function POST(req: NextRequest) {
  if (!SUPA_URL || !ANON || !SERVICE) return fail('Not set up.', 503);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token === ANON) return fail('Sign in first.', 401);
  const homeId = String((await req.json().catch(() => ({})))?.homeId ?? '').trim();
  if (!homeId || homeId.length > 200) return fail('Which home?', 400);

  const asPerson = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
  const { data: who } = await asPerson.auth.getUser();
  if (!who?.user) return fail('Sign in first.', 401);

  // Every report filed under this home's tenures…
  const { data: links, error } = await admin.from('home_tenure_reports')
    .select('share_id, tenure_id, home_tenures!inner(home_id)').eq('home_tenures.home_id', homeId);
  if (error) return fail('Could not read this home.', 500);
  // …kept only where the DATABASE says this person may read that tenure (as them, not as the server).
  const tenures = [...new Set((links ?? []).map((l: any) => String(l.tenure_id)))];
  const allowed = new Set<string>();
  for (const t of tenures) {
    const { data: ok } = await asPerson.rpc('tenure_access', { t, need: 'viewer', for_write: false });
    if (ok === true) allowed.add(t);
  }
  const shareIds = (links ?? []).filter((l: any) => allowed.has(String(l.tenure_id))).map((l: any) => String(l.share_id));
  if (!shareIds.length) return NextResponse.json({ reports: [] });

  const { data: recs } = await admin.from('home_records').select(RECORD_FIELDS).in('share_id', shareIds);
  const { data: statuses } = await asPerson.from('home_finding_status')
    .select('share_id, anomaly_ref, status, check_requested_at, verified_at, verified_name').in('share_id', shareIds);

  const reports = (recs ?? []).map((r: any) => ({
    shareId: r.share_id, address: r.address ?? null, date: r.inspection_date ?? null, type: r.inspection_type ?? null,
    inspector: r.inspector ?? null, company: r.company ?? null, yearBuilt: r.year_built ?? null, sqft: r.sqft ?? null,
    findings: publishedFindings(r.anomalies), specs: publishedSpecs(r.specs),
    statuses: (statuses ?? []).filter((s: any) => s.share_id === r.share_id).map((s: any) => ({
      ref: s.anomaly_ref, status: s.status, checkRequested: !!s.check_requested_at, verified: !!s.verified_at, verifiedBy: s.verified_name ?? null,
    })),
  })).sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  return NextResponse.json({ reports });
}
