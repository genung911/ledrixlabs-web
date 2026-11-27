// /api/billing/checkout — the company OWNER adds a payment method (mockup screen 4): a Stripe-hosted Checkout for a
// per-inspector monthly subscription. Quantity = seats (members who aren't Office, #158). The trial carries over (Stripe
// bills at its end). The launch $79 → $119 step is set by the webhook once the subscription exists.
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SITE, admin, caller, configured, fail, planRow, priceId, seatCount, startPriceKey, stripe } from '@/lib/billing/server';
import { checkoutTrialEnd } from '@/lib/billing/model';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!configured()) return fail('Billing is not set up yet.', 503);
  const who = await caller(req); if (who instanceof NextResponse) return who;
  if (!who.owner) return fail('Only the company owner can add a payment method.', 403);
  const plan = await planRow(who.companyId);
  if (!plan) return fail('Your company has no plan yet.', 400);
  const key = startPriceKey(plan.kind);
  if (!key) return fail('Your plan is free; there is nothing to pay.', 400);
  if (plan.stripe_subscription_id && plan.status !== 'canceled') return fail('You already have a plan. Use Manage billing.', 409);

  const s = stripe();
  const [price, seats] = await Promise.all([priceId(s, key), seatCount(who.companyId)]);
  let customer = plan.stripe_customer_id;
  if (!customer) {
    const c = await s.customers.create({ email: who.email ?? undefined, name: who.companyName, metadata: { company_id: who.companyId } });
    customer = c.id;
    await admin().from('company_plans').update({ stripe_customer_id: customer, updated_at: new Date().toISOString() }).eq('company_id', who.companyId);
  }
  const trialEnd = plan.status === 'trialing' ? checkoutTrialEnd(plan.trial_ends_at, Date.now()) : undefined;
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: who.companyId,
    line_items: [{ price, quantity: seats }],
    subscription_data: { metadata: { company_id: who.companyId, kind: plan.kind }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    metadata: { company_id: who.companyId },
    success_url: `${SITE}/app/company/plan?paid=1`,
    cancel_url: `${SITE}/app/company/plan`,
  });
  return NextResponse.json({ url: session.url });
}
