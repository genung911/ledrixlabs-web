// ─── /api/stripe/portal ──────────────────────────────────────────────────────
// Opens the Stripe billing portal so a subscriber can manage / cancel. Dormant
// until STRIPE_SECRET_KEY is set.
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const KEY      = process.env.STRIPE_SECRET_KEY ?? '';
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SITE     = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ledrixlabs.com').replace(/\/+$/, '');

export async function POST(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 500 });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !SUPA_URL || !SERVICE) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const admin = createClient(SUPA_URL, SERVICE);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const { data } = await admin.from('home_subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  if (!data?.stripe_customer_id) return NextResponse.json({ error: 'No subscription found.' }, { status: 404 });

  const stripe = new Stripe(KEY);
  const portal = await stripe.billingPortal.sessions.create({ customer: String(data.stripe_customer_id), return_url: `${SITE}/` });
  return NextResponse.json({ url: portal.url });
}
