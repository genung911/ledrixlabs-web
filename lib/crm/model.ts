// Contacts — the pure half (no I/O): money words, referral counts, the schedule's weeks. EXECUTED by
// scripts/verify-contacts-web.mjs.
//
// MONEY COMES FROM INVOICES ONLY (owner 2026-11-04 "paid comes from invoices only"; 2026-11-05 Contacts mockup, ruling 3).
// `payOf` restates the phone's jobPayFrom (ledrix-app src/core/services/jobPayment.ts) with no order fee and no job fee
// — the order's `fee` is never read on this page — so a job with no invoice says "No invoice", never an amount. The
// guard runs both on the same invoices and requires the same words.

export type InvoiceFacts = {
  id: string; number: number; order_id: string | null; status: string; shown_status: string;
  total_cents: number; paid_cents: number; balance_cents: number;
};
export type PayState = 'paid' | 'part_paid' | 'unpaid' | 'draft' | 'no_invoice';
export type JobPay = { state: PayState; amountCents: number | null; paidCents?: number; invoiceId: string | null };

/** The job's answer from its invoices: the newest non-void one is the job's; a voided one is as good as none. */
export function payOf(invoices: readonly InvoiceFacts[]): JobPay {
  const inv = [...invoices].filter(i => i.status !== 'void' && i.shown_status !== 'void').sort((a, b) => b.number - a.number)[0];
  if (!inv) return { state: 'no_invoice', amountCents: null, invoiceId: null };
  const base = { invoiceId: inv.id };
  switch (inv.shown_status) {
    case 'paid':        return { ...base, state: 'paid', amountCents: inv.total_cents };
    case 'partly_paid': return { ...base, state: 'part_paid', amountCents: inv.total_cents, paidCents: inv.paid_cents };
    case 'sent':
    case 'overdue':     return { ...base, state: 'unpaid', amountCents: inv.balance_cents };
    default:            return { ...base, state: 'draft', amountCents: inv.total_cents };
  }
}

export function dollars(cents: number): string {
  const whole = Math.round(cents) % 100 === 0;
  return `$${(Math.round(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "Paid · $450", "Part paid · $200 of $450", "Unpaid · $450 due", "Draft invoice · $450", "No invoice". */
export function payWords(p: JobPay): string {
  const amt = p.amountCents != null ? dollars(p.amountCents) : null;
  switch (p.state) {
    case 'paid':      return amt ? `Paid · ${amt}` : 'Paid';
    case 'part_paid': return amt ? `Part paid · ${dollars(p.paidCents ?? 0)} of ${amt}` : 'Part paid';
    case 'unpaid':    return amt ? `Unpaid · ${amt} due` : 'Unpaid';
    case 'draft':     return amt ? `Draft invoice · ${amt}` : 'Draft invoice';
    default:          return 'No invoice';
  }
}

/** Invoiced to a contact: the total of their jobs' live invoices (void ones excluded). */
export function invoicedCents(invoices: readonly InvoiceFacts[]): number {
  return invoices.filter(i => i.status !== 'void' && i.shown_status !== 'void').reduce((s, i) => s + i.total_cents, 0);
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayYmd = (now: Date = new Date()) => ymd(now);
export function addDays(ymdStr: string, days: number): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + days));
}

/** Plain counts for an agent (no scores, no ratings of people — owner 2026-10-13 / Contacts mockup). Cancelled jobs do
 *  not count as referrals. */
export type Referrals = { total: number; last30: number; prior30: number; next: string | null; last: string | null };
export function referrals(orders: readonly { order_date: string; status: string }[], today: string): Referrals {
  const live = orders.filter(o => o.status !== 'cancelled');
  const d30 = addDays(today, -30), d60 = addDays(today, -60);
  const future = live.filter(o => o.order_date >= today).map(o => o.order_date).sort();
  const past = live.filter(o => o.order_date < today).map(o => o.order_date).sort();
  return {
    total: live.length,
    last30: live.filter(o => o.order_date >= d30 && o.order_date < today).length,
    prior30: live.filter(o => o.order_date >= d60 && o.order_date < d30).length,
    next: future[0] ?? null,
    last: past[past.length - 1] ?? null,
  };
}

/** The Monday that starts the week holding `ymdStr`. */
export function weekStart(ymdStr: string): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();   // 0 Sunday
  return addDays(ymdStr, -((day + 6) % 7));
}

/** Orders grouped by day for the 7 days from `start` (days with nothing are left out). */
export function byDay<T extends { order_date: string }>(orders: readonly T[], start: string, days = 7): { day: string; items: T[] }[] {
  const end = addDays(start, days);
  const map = new Map<string, T[]>();
  for (const o of orders) if (o.order_date >= start && o.order_date < end) map.set(o.order_date, [...(map.get(o.order_date) ?? []), o]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => ({ day, items }));
}

/** The month grid: weeks (Monday first) covering the month of `ymdStr`, each day with its order count. */
export function monthGrid(orders: readonly { order_date: string; status: string }[], ymdStr: string): { day: string; inMonth: boolean; count: number }[][] {
  const [y, m] = ymdStr.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const start = weekStart(first);
  const counts = new Map<string, number>();
  for (const o of orders) if (o.status !== 'cancelled') counts.set(o.order_date, (counts.get(o.order_date) ?? 0) + 1);
  const weeks: { day: string; inMonth: boolean; count: number }[][] = [];
  let cur = start;
  do {
    const week = [];
    for (let i = 0; i < 7; i++) { week.push({ day: cur, inMonth: Number(cur.slice(5, 7)) === m, count: counts.get(cur) ?? 0 }); cur = addDays(cur, 1); }
    weeks.push(week);
  } while (Number(cur.slice(5, 7)) === m);
  return weeks;
}

export const FOLLOWUP_TYPES = ['call', 'email', 'thank_you', 'check_in', 'review_request'] as const;
export type FollowupType = typeof FOLLOWUP_TYPES[number];
export const FOLLOWUP_LABEL: Record<FollowupType, string> = {
  call: 'Call', email: 'Email', thank_you: 'Thank-you', check_in: 'Check in', review_request: 'Review request',
};
