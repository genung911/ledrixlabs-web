// ─── /api/stripe/webhook ─────────────────────────────────────────────────────
// The ONLY writer to home_subscriptions. Verifies the Stripe signature, then upserts
// the user's entitlement on checkout completion + subscription updates/cancellation.
// Point a Stripe webhook here (events: checkout.session.completed,
// customer.subscription.updated, customer.subscription.deleted) and set
// STRIPE_WEBHOOK_SECRET. Dormant until configured.
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const KEY      = process.env.STRIPE_SECRET_KEY ?? '';
const WH       = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

async function upsert(row: Record<string, unknown>) {
  const admin = createClient(SUPA_URL, SERVICE);
  await admin.from('home_subscriptions').upsert(row, { onConflict: 'user_id' });
}

export async function POST(req: NextRequest) {
  if (!KEY || !WH) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  const sig = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();   // raw body is required for signature verification

  const stripe = new Stripe(KEY);
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(raw, sig, WH); }
  catch { return NextResponse.json({ error: 'bad signature' }, { status: 400 }); }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.client_reference_id || (s.metadata?.user_id ?? '');
      if (userId) await upsert({
        user_id: userId, email: s.customer_details?.email ?? null,
        stripe_customer_id: String(s.customer ?? ''), stripe_subscription_id: String(s.subscription ?? ''),
        status: 'active', updated_at: new Date().toISOString(),
      });
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id ?? '';
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status;
      const periodEnd = (sub as any).current_period_end;
      if (userId) await upsert({
        user_id: userId, stripe_customer_id: String(sub.customer ?? ''), stripe_subscription_id: sub.id,
        status, current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      });
    }
  } catch { /* best effort — Stripe retries on non-2xx, so still return 200 */ }

  return NextResponse.json({ received: true });
}
