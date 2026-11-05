// ─── crmHome — the CRM home's numbers and lists, and where a job came from (2026-11-05) ─────────────────────────────
//
// PURE: no I/O, no imports. Shared by the phone (CRM dashboard, New Inspection, contact detail) and the website's CRM
// (lib/crm/crmHome.ts) — copied byte-for-byte (scripts/web-preview-sync.json), so both count the same jobs, the same
// referrers and the same accounts, and both write a job's source the same way.
//
// Owner 2026-11-05 (CRM home mockup, "use recommendations"):
//   · the home shows what needs attention: jobs this month, invoiced this month, follow-ups due, booking requests;
//     today and tomorrow; follow-ups due; top referrers (last 90 days); recently added. Plain counts — Ledrix does not
//     score or rate people.
//   · Accounts are GROUPED from each contact's brokerage / company field (no table of their own yet).
//   · Leads, Campaigns and Marketing are planned tabs; each explains what it will do (PLANNED_TABS) — never an empty page.
// Owner 2026-11-05 ("Add where the job came from", #114 applied): crm_orders.source / source_contact_id /
// source_detail. A server without #114 does not answer crm_order_sources(); then the field is hidden and nothing is sent
// (`acceptedOrderSources` → null, `sourceFields` → {}).
//
// Money here is the INVOICE's only (owner 2026-11-04): an order's fee is never read.

// ─── Where a job came from ───────────────────────────────────────────────────────────────────────────────────────────
export const ORDER_SOURCES = ['agent', 'booking_page', 'repeat_client', 'search', 'social', 'referral', 'other'] as const;
export type OrderSource = typeof ORDER_SOURCES[number];
export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = {
  agent: 'Agent', booking_page: 'Booking page', repeat_client: 'Repeat client', search: 'Search', social: 'Social media',
  referral: 'Referral', other: 'Other',
};
/** What a person may pick. 'booking_page' is set by the server when a booking is confirmed (#114 confirm_booking). */
export const PICKABLE_SOURCES: readonly OrderSource[] = ORDER_SOURCES.filter(s => s !== 'booking_page');
export const SOURCE_DETAIL_MAX = 200;

/** The server's answer to crm_order_sources() → the sources it takes, or null when it takes none (no #114: an error, a
 *  missing function, junk). The field is offered only when this is a list. */
export function acceptedOrderSources(answer: unknown): OrderSource[] | null {
  if (!Array.isArray(answer)) return null;
  const said = new Set(answer.filter((x): x is string => typeof x === 'string'));
  const out = ORDER_SOURCES.filter(s => said.has(s));
  return out.length ? out : null;
}

export type SourceChoice = { source: OrderSource | null; referrerId: string | null; detail: string };
export const NO_SOURCE: SourceChoice = { source: null, referrerId: null, detail: '' };

/** The order fields for a job's source. Nothing (`{}`) when the server takes no source or none was given. A job with an
 *  agent and no source picked came from that agent; an "Agent" source with no contact picked names the job's agent. */
export function sourceFields(choice: SourceChoice, accepted: readonly OrderSource[] | null, agentContactId?: string | null): Record<string, string | null> {
  if (!accepted) return {};
  let source = choice.source;
  let referrer = choice.referrerId;
  if (!source && agentContactId) { source = 'agent'; referrer = agentContactId; }
  if (source === 'agent' && !referrer && agentContactId) referrer = agentContactId;
  if (!source || !accepted.includes(source)) return {};
  const detail = choice.detail.trim().slice(0, SOURCE_DETAIL_MAX);
  return { source, source_contact_id: referrer || null, source_detail: detail || null };
}

/** "Agent · Dana Whitfield", "Search · Google", "Booking page" — '' when not recorded. */
export function sourceWords(o: { source?: string | null; source_detail?: string | null; source_contact_id?: string | null }, nameOf: (id: string) => string | undefined): string {
  if (!o.source || !(ORDER_SOURCES as readonly string[]).includes(o.source)) return '';
  const who = o.source_contact_id ? nameOf(o.source_contact_id) : undefined;
  return [ORDER_SOURCE_LABEL[o.source as OrderSource], who, o.source_detail || undefined].filter(Boolean).join(' · ');
}

// ─── Dates (local calendar days, 'YYYY-MM-DD') ───────────────────────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');
export function dayAfter(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(y, m - 1, d + days);
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}
const monthKey = (ymd: string) => ymd.slice(0, 7);
function prevMonthKey(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
}

// ─── The records, as much of them as the home needs ──────────────────────────────────────────────────────────────────
export type HomeContact = { id: string; type: string; name: string; brokerage?: string | null; created_at?: string | null };
export type HomeOrder = {
  id: string; contact_id?: string | null; source_contact_id?: string | null; source?: string | null; source_detail?: string | null;
  order_date: string; status: string; address?: string | null; inspection_id?: string | null;
};
export type HomeFollowup = { id: string; due_date: string; completed: boolean };
export type HomeInvoice = {
  id: string; order_id?: string | null; status: string; shown_status: string; issued_on?: string | null; due_on?: string | null;
  total_cents: number; paid_cents: number; balance_cents: number;
};
const live = (o: HomeOrder) => o.status !== 'cancelled';
const liveInvoice = (i: HomeInvoice) => i.status !== 'void' && i.shown_status !== 'void' && i.status !== 'draft' && i.shown_status !== 'draft';

/** Who sent a job: the recorded referrer, else the job's own contact when that contact is an agent (orders made before
 *  #114, and imports). Cancelled jobs have no referrer. */
export function referrerOf(o: HomeOrder, typeOf: (id: string) => string | undefined): string | null {
  if (!live(o)) return null;
  if (o.source_contact_id) return o.source_contact_id;
  return o.contact_id && typeOf(o.contact_id) === 'agent' ? o.contact_id : null;
}

// ─── Home numbers ────────────────────────────────────────────────────────────────────────────────────────────────────
export type HomeKpis = {
  jobsThisMonth: number; jobsLastMonth: number;
  invoicedThisMonthCents: number | null; paidThisMonthCents: number | null;   // null: this person may not read invoices
  followupsDue: number; followupsOverdue: number; bookingsWaiting: number;
};
export const FOLLOWUP_HORIZON_DAYS = 7;

export function homeKpis(a: { orders: readonly HomeOrder[]; invoices: readonly HomeInvoice[] | null; followups: readonly HomeFollowup[]; bookings: number; today: string }): HomeKpis {
  const thisM = monthKey(a.today), lastM = prevMonthKey(a.today);
  const jobs = a.orders.filter(live);
  const inv = a.invoices ? a.invoices.filter(i => liveInvoice(i) && !!i.issued_on && monthKey(i.issued_on) === thisM) : null;
  const due = followupsDue(a.followups, a.today);
  return {
    jobsThisMonth: jobs.filter(o => monthKey(o.order_date) === thisM).length,
    jobsLastMonth: jobs.filter(o => monthKey(o.order_date) === lastM).length,
    invoicedThisMonthCents: inv ? inv.reduce((s, i) => s + i.total_cents, 0) : null,
    paidThisMonthCents: inv ? inv.reduce((s, i) => s + i.paid_cents, 0) : null,
    followupsDue: due.length,
    followupsOverdue: due.filter(f => f.due_date < a.today).length,
    bookingsWaiting: a.bookings,
  };
}

/** Open follow-ups due within the next week, overdue ones included, oldest first. */
export function followupsDue<T extends HomeFollowup>(followups: readonly T[], today: string, days = FOLLOWUP_HORIZON_DAYS): T[] {
  const until = dayAfter(today, days);
  return followups.filter(f => !f.completed && f.due_date <= until).sort((x, y) => x.due_date.localeCompare(y.due_date));
}

/** Sent invoices past their due date, oldest first ("Needs you"). */
export function overdueInvoices<T extends HomeInvoice>(invoices: readonly T[]): T[] {
  return invoices.filter(i => i.shown_status === 'overdue' && i.balance_cents > 0)
    .sort((x, y) => (x.due_on ?? '').localeCompare(y.due_on ?? ''));
}

/** Live jobs today and tomorrow, in date order. */
export function todayTomorrow<T extends HomeOrder>(orders: readonly T[], today: string): T[] {
  const tomorrow = dayAfter(today, 1);
  return orders.filter(o => live(o) && (o.order_date === today || o.order_date === tomorrow)).sort((x, y) => x.order_date.localeCompare(y.order_date));
}

/** The newest contacts first. */
export function recentlyAdded<T extends HomeContact>(contacts: readonly T[], n = 5): T[] {
  return [...contacts].filter(c => !!c.created_at).sort((x, y) => (y.created_at ?? '').localeCompare(x.created_at ?? '')).slice(0, n);
}

export const REFERRER_WINDOW_DAYS = 90;
export type Referrer = { contactId: string; name: string; brokerage: string | null; count: number };

/** Who sent the most jobs dated in the last 90 days (and upcoming): plain counts, most first. */
export function topReferrers(orders: readonly HomeOrder[], contacts: readonly HomeContact[], today: string, n = 5, days = REFERRER_WINDOW_DAYS): Referrer[] {
  const byId = new Map(contacts.map(c => [c.id, c]));
  const since = dayAfter(today, -days);
  const counts = new Map<string, number>();
  for (const o of orders) {
    if (o.order_date < since) continue;
    const r = referrerOf(o, id => byId.get(id)?.type);
    if (r && byId.has(r)) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id, count]) => ({ contactId: id, name: byId.get(id)!.name, brokerage: byId.get(id)!.brokerage ?? null, count }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)).slice(0, n);
}

// ─── Accounts (grouped from the brokerage / company field) ───────────────────────────────────────────────────────────
export type AccountKind = 'brokerage' | 'vendor';
export type Account = {
  key: string; kind: AccountKind; name: string; contactIds: string[];
  referrals: number; referralsRecent: number; invoicedCents: number | null;
};
/** "  Summit  Realty " and "summit realty" are one account; "Summit Realty Group" is another (no guessing). */
export const accountKey = (kind: AccountKind, company: string) => `${kind}:${company.trim().replace(/\s+/g, ' ').toLowerCase()}`;

export function accountsOf(contacts: readonly HomeContact[], orders: readonly HomeOrder[], invoices: readonly HomeInvoice[] | null, today: string): Account[] {
  const byId = new Map(contacts.map(c => [c.id, c]));
  const accounts = new Map<string, Account>();
  const accountOfContact = new Map<string, string>();
  for (const c of contacts) {
    const company = (c.brokerage ?? '').trim();
    if (!company || (c.type !== 'agent' && c.type !== 'vendor')) continue;
    const kind: AccountKind = c.type === 'agent' ? 'brokerage' : 'vendor';
    const key = accountKey(kind, company);
    const a = accounts.get(key) ?? { key, kind, name: company.replace(/\s+/g, ' '), contactIds: [], referrals: 0, referralsRecent: 0, invoicedCents: invoices ? 0 : null };
    a.contactIds.push(c.id);
    accounts.set(key, a);
    accountOfContact.set(c.id, key);
  }
  const since = dayAfter(today, -REFERRER_WINDOW_DAYS);
  for (const o of orders) {
    const r = referrerOf(o, id => byId.get(id)?.type);
    const key = r ? accountOfContact.get(r) : undefined;
    if (!key) continue;
    const a = accounts.get(key)!;
    a.referrals++;
    if (o.order_date >= since) a.referralsRecent++;
    if (invoices && a.invoicedCents != null) {
      for (const i of invoices) if (i.order_id === o.id && i.status !== 'void' && i.shown_status !== 'void') a.invoicedCents += i.total_cents;
    }
  }
  return [...accounts.values()].sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'brokerage' ? -1 : 1) || y.referrals - x.referrals || x.name.localeCompare(y.name));
}

// ─── The planned tabs (owner 2026-11-05: show them, each saying what it will do) ─────────────────────────────────────
export type PlannedTab = 'leads' | 'campaigns' | 'marketing';
export const PLANNED_TABS: Record<PlannedTab, { title: string; line: string; will: readonly string[] }> = {
  leads: {
    title: 'Leads', line: 'People who might book but haven’t yet.',
    will: ['Online booking requests and website inquiries land here first', 'Quote sent, follow up, won or lost',
      'Convert a lead into a client and a scheduled job in one step'],
  },
  campaigns: {
    title: 'Campaigns', line: 'Planned outreach to agents and past clients.',
    will: ['A list of contacts to reach (for example, every agent with no referral in 90 days)', 'What was sent and who replied',
      'Which campaigns brought in jobs'],
  },
  marketing: {
    title: 'Marketing', line: 'How the company shows up and where work comes from.',
    will: ['Review requests after each job and the reviews received', 'Where each job came from (agent, website, repeat client)',
      'Simple email templates for thank-yous and check-ins'],
  },
};
