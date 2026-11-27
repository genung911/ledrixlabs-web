// /api/billing/webhook — Ledrix's own Stripe account → company_plans (SQL #158). The ONLY way a plan becomes paid:
// every event's signature is checked with LEDRIX_STRIPE_WEBHOOK_SECRET before anything is read. Events (Stripe →
// Webhooks → "Ledrix billing"): checkout.session.completed, customer.subscription.created / updated / deleted,
// invoice.paid, invoice.payment_failed. A failure returns 500 so Stripe retries.
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { WEBHOOK_SECRET, applySubscription, configured, planRow, scheduleLaunchStep, stripe } from '@/lib/billing/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!configured() || !WEBHOOK_SECRET) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  const s = stripe();
  const raw = await req.text();                      // the raw body: the signature is over these exact bytes
  let event: Stripe.Event;
  try { event = s.webhooks.constructEvent(raw, req.headers.get('stripe-signature') ?? '', WEBHOOK_SECRET); }
  catch { return NextResponse.json({ error: 'bad signature' }, { status: 400 }); }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const cs = event.data.object as Stripe.Checkout.Session;
        if (cs.mode !== 'subscription' || !cs.subscription) break;
        const sub = await s.subscriptions.retrieve(String(typeof cs.subscription === 'string' ? cs.subscription : cs.subscription.id));
        const companyId = await applySubscription(sub, cs.client_reference_id);
        const plan = companyId ? await planRow(companyId) : null;
        if (plan) await scheduleLaunchStep(s, sub, plan.kind);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null; parent?: { subscription_details?: { subscription?: string } } };
        const subId = inv.parent?.subscription_details?.subscription ?? (typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id);
        if (!subId) break;
        await applySubscription(await s.subscriptions.retrieve(subId));
        break;
      }
      default: break;
    }
  } catch (e) {
    console.error('billing webhook', event.type, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
