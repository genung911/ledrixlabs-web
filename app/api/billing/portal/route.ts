// /api/billing/portal — "Manage billing" (mockup screen 5): Stripe's customer portal for the card, invoices and
// cancelling (at the end of the month). Owner only.
import { NextRequest, NextResponse } from 'next/server';
import { SITE, caller, configured, fail, planRow, stripe } from '@/lib/billing/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!configured()) return fail('Billing is not set up yet.', 503);
  const who = await caller(req); if (who instanceof NextResponse) return who;
  if (!who.owner) return fail('Only the company owner can manage billing.', 403);
  const plan = await planRow(who.companyId);
  if (!plan?.stripe_customer_id) return fail('Add a payment method first.', 400);
  const s = stripe();
  const confs = await s.billingPortal.configurations.list({ active: true, limit: 10 });
  const conf = confs.data.find(c => c.metadata?.ledrix === 'inspect');
  const portal = await s.billingPortal.sessions.create({ customer: plan.stripe_customer_id, return_url: `${SITE}/app/company/plan`, ...(conf ? { configuration: conf.id } : {}) });
  return NextResponse.json({ url: portal.url });
}
