// ─── /api/ethix ──────────────────────────────────────────────────────────────
// The ONLY writer to home_ethix_consent. A homeowner's data-sharing consent is a legal
// record, so it is captured server-side with the service role (tamper-proof) — never via
// the anon proxy. POST upserts the caller's OWN consent; GET returns it. Selling stays
// dormant regardless (lib/ethix.ts ethixSellingEnabled) — Phase 1 only records the
// choice; nothing is aggregated, sold, or paid.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CONSENT_VERSION, sanitizeCategories } from '../../../lib/ethix';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

async function requireUser(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !SUPA_URL || !SERVICE) return null;
  const admin = createClient(SUPA_URL, SERVICE);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return { admin, user };
}

export async function GET(req: NextRequest) {
  const ctx = await requireUser(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const { data } = await ctx.admin
    .from('home_ethix_consent')
    .select('opted_in, categories, earned_cents, updated_at')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  return NextResponse.json({ consent: data ?? { opted_in: false, categories: [], earned_cents: 0 } });
}

export async function POST(req: NextRequest) {
  const ctx = await requireUser(req);
  if (!ctx) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { /* default to opt-out */ }
  const opted_in = !!body.opted_in;
  const categories = opted_in ? sanitizeCategories(body.categories) : [];

  const { error } = await ctx.admin.from('home_ethix_consent').upsert({
    user_id: ctx.user.id,
    email: ctx.user.email ?? null,
    opted_in,
    categories,
    consent_version: CONSENT_VERSION,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: 'Could not save your choice.' }, { status: 500 });

  return NextResponse.json({ ok: true, consent: { opted_in, categories, earned_cents: 0 } });
}
