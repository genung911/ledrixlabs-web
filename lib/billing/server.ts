// Ledrix billing — SERVER ONLY, imported by the /api/billing/* routes and nothing else (verify-billing checks). Ledrix's OWN Stripe account: LEDRIX_STRIPE_SECRET_KEY and
// LEDRIX_STRIPE_WEBHOOK_SECRET (Vercel, Sensitive). Deliberately NOT STRIPE_SECRET_KEY, which would wake the dormant
// Home-subscription routes under /api/stripe/*. company_plans (SQL #158) has no client privileges: only these routes,
// with the service role, write it.
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { PRICE_KEY, planStatusFromStripe, startPriceKey, stepDate, stepsUp, type PlanKind } from './model';

const KEY = process.env.LEDRIX_STRIPE_SECRET_KEY ?? '';
export const WEBHOOK_SECRET = process.env.LEDRIX_STRIPE_WEBHOOK_SECRET ?? '';
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.ledrixlabs.com').replace(/\/+$/, '');

export const configured = () => !!KEY && !!SUPA_URL && !!SERVICE;
export const stripe = () => new Stripe(KEY);
export const admin = (): SupabaseClient => createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
export const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export type PlanRow = {
  company_id: string; kind: PlanKind; status: string; trial_ends_at: string | null; past_due_since: string | null;
  stripe_customer_id: string | null; stripe_subscription_id: string | null; seats_billed: number | null;
};

/** The signed-in caller (their workspace JWT), their company, and whether they own it. */
export async function caller(req: Request): Promise<{ userId: string; email: string | null; companyId: string; companyName: string; owner: boolean } | NextResponse> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail('Sign in first.', 401);
  const db = admin();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return fail('Sign in first.', 401);
  const { data: prof } = await db.from('inspector_profiles').select('company_id').eq('id', user.id).maybeSingle();
  if (!prof?.company_id) return fail('Your account has no company yet.', 400);
  const { data: co } = await db.from('companies').select('id, name, owner_id').eq('id', prof.company_id).maybeSingle();
  if (!co) return fail('Your company could not be found.', 404);
  return { userId: user.id, email: user.email ?? null, companyId: co.id, companyName: co.name ?? 'Your company', owner: co.owner_id === user.id };
}

export async function planRow(companyId: string): Promise<PlanRow | null> {
  const { data } = await admin().from('company_plans').select('*').eq('company_id', companyId).maybeSingle();
  return (data as PlanRow | null) ?? null;
}

export async function seatCount(companyId: string): Promise<number> {
  const { data, error } = await admin().rpc('company_seat_count', { p_company: companyId });
  if (error) throw new Error(error.message);
  return Math.max(1, Number(data) || 1);
}

const priceCache = new Map<string, string>();
export async function priceId(s: Stripe, lookupKey: string): Promise<string> {
  const hit = priceCache.get(lookupKey); if (hit) return hit;
  const list = await s.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const id = list.data[0]?.id; if (!id) throw new Error(`Stripe price ${lookupKey} is missing`);
  priceCache.set(lookupKey, id); return id;
}

/** Write the plan from a Stripe subscription (the webhook and the sync both use it). */
export async function applySubscription(sub: Stripe.Subscription, companyIdHint?: string | null): Promise<string | null> {
  const db = admin();
  let companyId = (sub.metadata?.company_id as string | undefined) || companyIdHint || null;
  if (!companyId) {
    const { data } = await db.from('company_plans').select('company_id').eq('stripe_subscription_id', sub.id).maybeSingle();
    companyId = data?.company_id ?? null;
  }
  if (!companyId) return null;
  const cur = await planRow(companyId);
  const status = planStatusFromStripe(sub.status);
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  const periodEnd = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const patch: Record<string, unknown> = {
    company_id: companyId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.id,
    seats_billed: item?.quantity ?? null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (status) {
    patch.status = status;
    patch.past_due_since = status === 'past_due' ? (cur?.past_due_since ?? new Date().toISOString()) : null;
  }
  const { error } = await db.from('company_plans').upsert(patch, { onConflict: 'company_id' });
  if (error) throw new Error(error.message);
  return companyId;
}

/** Launch window: $79 now, $119 six months after billing starts — set once, as a Stripe schedule on the subscription. */
export async function scheduleLaunchStep(s: Stripe, sub: Stripe.Subscription, kind: PlanKind): Promise<void> {
  if (!stepsUp(kind) || sub.schedule) return;
  const qty = sub.items.data[0]?.quantity ?? 1;
  const [intro, full] = await Promise.all([priceId(s, PRICE_KEY.intro), priceId(s, PRICE_KEY.full)]);
  const sched = await s.subscriptionSchedules.create({ from_subscription: sub.id });
  const start = sched.phases[0]?.start_date ?? Math.floor(Date.now() / 1000);
  const billingStarts = sub.trial_end ?? start;
  await s.subscriptionSchedules.update(sched.id, {
    end_behavior: 'release',
    phases: [
      { items: [{ price: intro, quantity: qty }], start_date: start, end_date: stepDate(billingStarts), ...(sub.trial_end ? { trial_end: sub.trial_end } : {}) },
      { items: [{ price: full, quantity: qty }] },
    ],
    metadata: { company_id: String(sub.metadata?.company_id ?? '') },
  });
}

/** Seats changed (someone joined or left): set the subscription's quantity — on every phase when it has a schedule. */
export async function syncSeats(s: Stripe, plan: PlanRow, seats: number): Promise<boolean> {
  if (!plan.stripe_subscription_id) return false;
  const sub = await s.subscriptions.retrieve(plan.stripe_subscription_id);
  const item = sub.items.data[0];
  if (!item || item.quantity === seats || planStatusFromStripe(sub.status) === 'canceled') return false;
  const schedId = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id;
  if (schedId) {
    const sched = await s.subscriptionSchedules.retrieve(schedId);
    const now = Math.floor(Date.now() / 1000);
    const phases = sched.phases.filter(p => (p.end_date ?? Infinity) > now).map(p => ({
      items: p.items.map(i => ({ price: typeof i.price === 'string' ? i.price : i.price.id, quantity: seats })),
      start_date: p.start_date, end_date: p.end_date ?? undefined, ...(p.trial_end ? { trial_end: p.trial_end } : {}),
    }));
    await s.subscriptionSchedules.update(schedId, { phases, proration_behavior: 'none' });
  } else {
    await s.subscriptions.update(sub.id, { items: [{ id: item.id, quantity: seats }], proration_behavior: 'none' });
  }
  await admin().from('company_plans').update({ seats_billed: seats, updated_at: new Date().toISOString() }).eq('company_id', plan.company_id);
  return true;
}

export { startPriceKey };
