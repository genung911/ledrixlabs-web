// Ledrix billing — the pure rules (b7; owner 2026-11-25 DECISIONS "How inspectors pay Ledrix", plan mockup
// 13QNuHGzRGv2t2GdyextR4 "Approved"; SQL #158 company_plans). No I/O: the API routes, the Plan & billing page and the
// workspace banner all read these, and scripts/verify-billing.mjs runs them directly.
//
//   $119 per inspector per month. Launch window: $79 for 6 months, then $119 (a Stripe schedule steps it).
//   Early adopters (an invite code): 60 days free, then $79 for as long as they stay. 'comp' = Ledrix's own, free.
//   Seats = members whose role isn't Office. Unpaid: 7 days of grace, then read-only (the server enforces it, #158).

export type PlanKind = 'launch' | 'standard' | 'early' | 'comp';
export type PlanStateName = 'trial' | 'active' | 'grace' | 'read_only' | 'comp' | 'none';
export type PlanState = {
  state: PlanStateName; kind?: PlanKind | null; trial_ends_at?: string | null; grace_ends_at?: string | null;
  subscribed?: boolean; seats?: number; is_owner?: boolean;
};

export const PRICE_KEY = { full: 'ledrix_inspect_monthly_119', intro: 'ledrix_inspect_monthly_79' } as const;
export const FULL_CENTS = 11900;
export const INTRO_CENTS = 7900;
export const LAUNCH_INTRO_MONTHS = 6;

/** Which Stripe price a company starts on. Comp never checks out. */
export function startPriceKey(kind: PlanKind | null | undefined): string | null {
  if (kind === 'comp') return null;
  if (kind === 'standard') return PRICE_KEY.full;
  return PRICE_KEY.intro;                       // launch (steps to full after 6 months) and early (stays)
}

/** Does this kind step from $79 to $119? Only the launch window. */
export const stepsUp = (kind: PlanKind | null | undefined) => kind === 'launch';

/** The date the launch price steps up: 6 months after billing starts (the trial's end, else now). */
export function stepDate(billingStartsSec: number): number {
  const d = new Date(billingStartsSec * 1000);
  d.setUTCMonth(d.getUTCMonth() + LAUNCH_INTRO_MONTHS);
  return Math.floor(d.getTime() / 1000);
}

/** Stripe asks a Checkout trial to end at least 48 hours away; closer than that, billing starts now. */
export function checkoutTrialEnd(trialEndsAt: string | null | undefined, nowMs: number): number | undefined {
  if (!trialEndsAt) return undefined;
  const t = Date.parse(trialEndsAt);
  if (!Number.isFinite(t) || t - nowMs < 48 * 3600 * 1000) return undefined;
  return Math.floor(t / 1000);
}

/** A Stripe subscription status → company_plans.status (null = leave it as it is). */
export function planStatusFromStripe(status: string | null | undefined): 'active' | 'past_due' | 'canceled' | null {
  switch (status) {
    case 'trialing': case 'active': return 'active';     // a card is on file: the company is paying (or will at trial end)
    case 'past_due': case 'unpaid': return 'past_due';
    case 'canceled': case 'incomplete_expired': return 'canceled';
    default: return null;                                // incomplete, paused: the first payment is still being tried
  }
}

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export function daysLeft(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso); if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - nowMs) / 864e5));
}

/** The price line on Plan & billing. */
export function priceLine(kind: PlanKind | null | undefined): string {
  if (kind === 'comp') return 'Free (Ledrix)';
  if (kind === 'early') return `${money(INTRO_CENTS)} per inspector / month, for as long as you stay`;
  if (kind === 'standard') return `${money(FULL_CENTS)} per inspector / month`;
  return `${money(INTRO_CENTS)} per inspector / month for ${LAUNCH_INTRO_MONTHS} months, then ${money(FULL_CENTS)}`;
}

/** The short value on the Price row (fits a phone); priceLine says it in full under the group. */
export function shortPrice(kind: PlanKind | null | undefined): string {
  if (kind === 'comp') return 'Free';
  if (kind === 'early') return `${money(INTRO_CENTS)} / mo`;
  if (kind === 'standard') return `${money(FULL_CENTS)} / mo`;
  return `${money(INTRO_CENTS)}, then ${money(FULL_CENTS)}`;
}

export type Band = { tone: 'blue' | 'yellow' | 'red'; title: string; body: string; action?: { label: string; href: string } } | null;

/** The band at the top of every workspace page (mockup screen 6). Owners get the action; everyone else is told who can. */
export function planBand(p: PlanState | null | undefined, nowMs: number): Band {
  if (!p) return null;
  const owner = !!p.is_owner;
  const plan = { label: owner ? 'Restart my plan' : '', href: '/app/company/plan' };
  if (p.state === 'read_only') return {
    tone: 'red', title: 'Your plan has ended, so Ledrix is read-only.',
    body: owner ? 'Your sealed reports and your clients’ Home Records keep working. Restart your plan to inspect again.'
                : 'Your sealed reports and your clients’ Home Records keep working. Ask your company owner to restart the plan.',
    action: owner ? plan : undefined,
  };
  if (p.state === 'grace') {
    const d = daysLeft(p.grace_ends_at, nowMs);
    return {
      tone: 'yellow', title: 'Your payment didn’t go through.',
      body: owner ? `Update your card${d != null ? ` within ${d} day${d === 1 ? '' : 's'}` : ''} to keep inspecting.` : 'Ask your company owner to update billing.',
      action: owner ? { label: 'Update card', href: '/app/company/plan' } : undefined,
    };
  }
  if (p.state === 'trial' && owner && !p.subscribed) {
    const d = daysLeft(p.trial_ends_at, nowMs);
    if (d != null && d <= 3) return {
      tone: 'blue', title: d === 0 ? 'Your free trial ends today.' : `Your free trial ends in ${d} day${d === 1 ? '' : 's'}.`,
      body: 'Add a payment method to keep inspecting without a break.', action: { label: 'Add a payment method', href: '/app/company/plan' },
    };
  }
  return null;
}

/** The status pill on Plan & billing. */
export function statusPill(p: PlanState | null | undefined, nowMs: number): { label: string; tone: 'blue' | 'ok' | 'warn' | 'bad' } {
  switch (p?.state) {
    case 'trial': { const d = daysLeft(p.trial_ends_at, nowMs); return { label: p.subscribed ? 'Trial · card on file' : `Trial · ${d ?? '?'} day${d === 1 ? '' : 's'} left`, tone: 'blue' }; }
    case 'active': return { label: 'Active', tone: 'ok' };
    case 'grace': return { label: 'Payment failed', tone: 'warn' };
    case 'read_only': return { label: 'Read-only', tone: 'bad' };
    case 'comp': return { label: 'Free', tone: 'ok' };
    default: return { label: 'No plan', tone: 'bad' };
  }
}

/** An invite code as typed → the stored shape (#158: ^[A-Z0-9-]{6,32}$), or null. */
export function cleanInviteCode(raw: string | null | undefined): string | null {
  const c = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z0-9-]{6,32}$/.test(c) ? c : null;
}

export function planError(message: string | null | undefined): string {
  const m = String(message ?? '');
  if (/code_not_found/.test(m)) return 'That invite code isn’t one we know. Check it and try again.';
  if (/code_used/.test(m)) return 'That invite code has already been used.';
  if (/plan_already_set/.test(m)) return 'Your plan is already set, so a code can’t be added now.';
  if (/owner_only/.test(m)) return 'Only the company owner can do this.';
  if (/plan_read_only/.test(m)) return 'Your company’s plan has ended, so Ledrix is read-only.';
  return m || 'Something went wrong.';
}
