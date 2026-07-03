// ─── /api/stripe/checkout ────────────────────────────────────────────────────
// Creates a Stripe subscription Checkout session for the signed-in homeowner and
// returns its URL. DORMANT until STRIPE_SECRET_KEY + STRIPE_PRICE_ID are set — the
// UI only calls this when NEXT_PUBLIC_BILLING_ENABLED=1.
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const KEY      = process.env.STRIPE_SECRET_KEY ?? '';
const PRICE    = process.env.STRIPE_PRICE_ID ?? '';
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SITE     = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ledrixlabs.com').replace(/\/+$/, '');

export async function POST(req: NextRequest) {
  if (!KEY || !PRICE) return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 500 });

  // Require a signed-in user.
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !SUPA_URL || !SERVICE) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const admin = createClient(SUPA_URL, SERVICE);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  let returnTo = '/';
  try { const b = await req.json(); if (b?.returnTo && String(b.returnTo).startsWith('/')) returnTo = String(b.returnTo); } catch { /* default */ }

  const stripe = new Stripe(KEY);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: PRICE, quantity: 1 }],
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    metadata: { user_id: user.id },
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    success_url: `${SITE}${returnTo}?sub=success`,
    cancel_url: `${SITE}${returnTo}?sub=cancel`,
  });
  return NextResponse.json({ url: session.url });
}
