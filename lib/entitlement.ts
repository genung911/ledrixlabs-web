// ─── entitlement — server-side "is this user's premium unlocked?" ───────────────
// Used by the AI route so the gate can't be bypassed from the client. KEY behavior:
// when Stripe isn't configured yet (no STRIPE_SECRET_KEY), billing is DORMANT and
// every signed-in user is entitled — so the app runs exactly as it did pre-paywall.
// Once Stripe is live, an active subscription is required.
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function billingEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && process.env.BILLING_ENABLED === '1';
}

export async function isEntitled(userId: string): Promise<boolean> {
  if (!billingEnabled()) return true;                    // dormant → sign-in alone unlocks
  if (!userId || !SUPA_URL || !SERVICE) return false;
  try {
    const admin = createClient(SUPA_URL, SERVICE);
    const { data } = await admin.from('home_subscriptions').select('status').eq('user_id', userId).maybeSingle();
    return !!data && ['active', 'trialing', 'past_due'].includes(String(data.status));
  } catch { return false; }
}
