// /api/billing/status — what Plan & billing shows the OWNER beyond company_plan_state(): the next bill and the card
// (mockup screen 5). Opening the page also brings the subscription's seats in line with the team (someone joined or
// left), without a charge now — the next bill uses the new count.
import { NextRequest, NextResponse } from 'next/server';
import { caller, configured, fail, planRow, seatCount, stripe, syncSeats } from '@/lib/billing/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
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
  let next: { amount: number; date: number } | null = null;
  try {
    const up = await s.invoices.createPreview({ subscription: sub.id });
    next = { amount: up.amount_due, date: up.next_payment_attempt ?? up.period_end };
  } catch { /* cancelled or nothing due */ }
  const pm = sub.default_payment_method && typeof sub.default_payment_method !== 'string' ? sub.default_payment_method : null;
  return NextResponse.json({
    configured: true, subscribed: true, seats, synced,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    card: pm?.card ? { brand: pm.card.brand, last4: pm.card.last4 } : null,
    next,
  });
}
