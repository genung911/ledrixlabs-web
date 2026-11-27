// /api/billing/status — what Plan & billing shows the OWNER beyond company_plan_state(): the next bill and the card
// (mockup screen 5). Opening the page also brings the subscription's seats in line with the team (someone joined or
// left), without a charge now — the next bill uses the new count.
import { NextRequest, NextResponse } from 'next/server';
import { caller, configured, fail, planRow, seatCount, stripe, syncSeats } from '@/lib/billing/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try { return await status(req); }
  catch (e) {   // say what went wrong on the page instead of hiding the rows (owner test 2026-11-26: Card / Next bill missing)
    console.error('billing status', e instanceof Error ? e.message : e);
    return NextResponse.json({ configured: true, problem: e instanceof Error ? e.message : 'unknown error' });
  }
}

async function status(req: NextRequest) {
  if (!configured()) return NextResponse.json({ configured: false });
  const who = await caller(req); if (who instanceof NextResponse) return who;
  if (!who.owner) return fail('Only the company owner sees billing.', 403);
  const plan = await planRow(who.companyId);
  const seats = await seatCount(who.companyId);
  if (!plan?.stripe_subscription_id) return NextResponse.json({ configured: true, seats, subscribed: false });
  const s = stripe();
  let synced = false;
  try { synced = await syncSeats(s, plan, seats); } catch { /* shown as-is; the next visit tries again */ }
  const sub = await s.subscriptions.retrieve(plan.stripe_subscription_id, { expand: ['default_payment_method'] });
  let next: { amount: number; date: number } | null = null; let problem: string | undefined;
  try {
    const up = await s.invoices.createPreview({ subscription: sub.id });
    next = { amount: up.amount_due, date: up.next_payment_attempt ?? sub.trial_end ?? up.period_end };
  } catch (e) { if (!sub.cancel_at_period_end) problem = `next bill: ${e instanceof Error ? e.message : e}`; }
  // The card: the subscription's own, else the customer's default (Checkout may set either).
  let pm = sub.default_payment_method && typeof sub.default_payment_method !== 'string' ? sub.default_payment_method : null;
  if (!pm && typeof sub.customer === 'string') {
    const cust = await s.customers.retrieve(sub.customer, { expand: ['invoice_settings.default_payment_method'] });
    const d = !('deleted' in cust && cust.deleted) ? (cust as any).invoice_settings?.default_payment_method : null;
    if (d && typeof d !== 'string') pm = d;
    if (!pm) { const list = await s.paymentMethods.list({ customer: sub.customer, type: 'card', limit: 1 }); pm = list.data[0] ?? null; }
  }
  return NextResponse.json({
    configured: true, subscribed: true, seats, synced,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    // A card shows its brand and last 4; Link (Stripe's saved wallet) and anything else show by name.
    payment: pm ? (pm.card ? `${pm.card.brand[0].toUpperCase()}${pm.card.brand.slice(1)} ···· ${pm.card.last4}`
      : pm.type === 'link' ? `Link${pm.link?.email ? ` · ${pm.link.email}` : ''}` : pm.type.replace(/_/g, ' ')) : null,
    next, problem,
  });
}
