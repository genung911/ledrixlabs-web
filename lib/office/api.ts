// Office pages — the website's reads and changes for Services & prices, the booking page, Payments, and a new job's
// order and draft invoice (owner 2026-11-05: "Move all the office/admin work to be done on web as well as phone";
// office pages mockup, "use all recommendations"). The same server records and calls as the phone
// (ledrix-app CRMStripeService.ts):
//   · crm_packages through the versioned CRM writes (#78): the server owns company, version and who-changed-it; an
//     update names the next row_version (a newer save elsewhere is refused, P0409); never an upsert;
//   · the booking page through company_booking_settings / set_company_booking_settings (#115) — the company owner's
//     row — and, until #115 is applied, the person's own inspector_profiles row, as the phone did;
//   · the Stripe key through stripe_key_status / set_stripe_secret_key only: the key is written, never read back.
// scripts/verify-office-web.mjs holds this module to exactly these calls. Writes live here, never in lib/workspace.
import { workspace } from '@/lib/workspace/client';

export class OfficeError extends Error {
  conflict: boolean;
  constructor(message: string, conflict = false) { super(message); this.name = 'OfficeError'; this.conflict = conflict; }
}
const KNOWN: [RegExp, string][] = [
  [/slug_taken/, 'That booking link is already in use. Pick another.'],
  [/slug_invalid/, 'A booking link uses lowercase letters, numbers and dashes.'],
  [/slug_required/, 'Pick a booking link before turning online booking on.'],
  [/stripe_key_invalid/, 'That is not a Stripe secret key. It starts with sk_live_, sk_test_, rk_live_ or rk_test_.'],
  [/owner_only/, 'Only the company owner can connect payments.'],
  [/row-level security|not_allowed|permission denied|42501/i, 'Your account can’t change this. Ask your company owner.'],
];
function fail(error: { code?: string; message?: string } | null, fallback: string): never {
  if (error?.code === 'P0409') throw new OfficeError('This was changed somewhere else. It has been reloaded — please try again.', true);
  const m = error?.message ?? '';
  for (const [re, text] of KNOWN) if (re.test(m)) throw new OfficeError(text);
  throw new OfficeError(m || fallback);
}
const missingFn = (e: { code?: string; message?: string } | null) => /PGRST202|Could not find the function|42883/i.test(`${e?.code ?? ''} ${e?.message ?? ''}`);

// ─── Services & prices ───────────────────────────────────────────────────────────────────────────────────────────────
export type Service = { id: string; name: string; description: string | null; price: number; duration_minutes: number | null; active: boolean; row_version: number };
const SERVICE_COLS = 'id, name, description, price, duration_minutes, active, row_version';

/** The company's price list (or, with no company, this person's). Scoped explicitly: the public "active packages"
 *  read would otherwise also return every other company's active prices. */
export async function loadServices(scope: { companyId: string | null; userId: string }, activeOnly = false): Promise<Service[]> {
  let q = workspace.from('crm_packages').select(SERVICE_COLS);
  q = scope.companyId ? q.eq('company_id', scope.companyId) : q.eq('inspector_id', scope.userId);
  if (activeOnly) q = q.eq('active', true);
  const res = await q.order('created_at', { ascending: true });
  if (res.error) fail(res.error, 'Services could not be loaded.');
  return ((res.data ?? []) as Service[]).map(s => ({ ...s, price: Number(s.price ?? 0), row_version: Number(s.row_version ?? 1) }));
}
export type ServiceInput = { name: string; description?: string; price: number; duration_minutes?: number | null; active: boolean };
const serviceFields = (s: ServiceInput) => {
  if (!s.name.trim()) throw new OfficeError('A service needs a name.');
  if (!Number.isFinite(s.price) || s.price < 0) throw new OfficeError('Enter a price of 0 or more.');
  return { name: s.name.trim(), description: s.description?.trim() || null, price: Math.round(s.price * 100) / 100,
    duration_minutes: s.duration_minutes ?? null, active: s.active };
};
export async function addService(s: ServiceInput): Promise<string> {
  const res = await workspace.from('crm_packages').insert(serviceFields(s)).select('id').single();
  if (res.error) fail(res.error, 'The service was not saved.');
  return (res.data as { id: string }).id;
}
export async function saveService(s: Service, edit: ServiceInput): Promise<void> {
  const res = await workspace.from('crm_packages').update({ ...serviceFields(edit), row_version: s.row_version + 1 })
    .eq('id', s.id).eq('row_version', s.row_version).select('id').maybeSingle();
  if (res.error) fail(res.error, 'The service was not saved.');
  if (!res.data) fail({ code: 'P0409' }, '');
}
export async function removeService(s: Service): Promise<void> {
  const res = await workspace.from('crm_packages').delete().eq('id', s.id).eq('row_version', s.row_version).select('id');
  if (res.error) fail(res.error, 'The service was not removed.');
  if (!(res.data ?? []).length) fail({ code: 'P0409' }, '');
}

// ─── The booking page ────────────────────────────────────────────────────────────────────────────────────────────────
export type BookingPage = { slug: string | null; active: boolean; businessName: string | null; website: string | null; agreement: string | null;
  /** May this person change it? */ editable: boolean;
  /** 'company' = #115's company page; 'own' = before #115, this person's own row (the phone's old behaviour). */ source: 'company' | 'own' };

export async function loadBookingPage(me: { userId: string; ownsIt: boolean }): Promise<BookingPage> {
  const r = await workspace.rpc('company_booking_settings');
  if (!r.error && r.data) {
    const d = r.data as Record<string, any>;
    return { slug: d.slug ?? null, active: !!d.active, businessName: d.business_name ?? null, website: d.website ?? null, agreement: d.agreement ?? null,
      editable: d.editable === true, source: 'company' };
  }
  if (r.error && !missingFn(r.error)) fail(r.error, 'The booking page could not be loaded.');
  // Before #115: the page is the owner's own row, which only they can read and change.
  const own = await workspace.from('inspector_profiles').select('booking_slug, booking_active, business_name, website, agreement_template').eq('id', me.userId).maybeSingle();
  if (own.error) fail(own.error, 'The booking page could not be loaded.');
  const d = (own.data ?? {}) as Record<string, any>;
  return { slug: d.booking_slug ?? null, active: !!d.booking_active, businessName: d.business_name ?? null, website: d.website ?? null,
    agreement: d.agreement_template ?? null, editable: me.ownsIt, source: 'own' };
}
export async function saveBookingPage(page: BookingPage, me: { userId: string }): Promise<void> {
  const slug = (page.slug ?? '').trim().toLowerCase();
  if (page.source === 'company') {
    const r = await workspace.rpc('set_company_booking_settings', { p_slug: slug, p_active: page.active, p_business_name: page.businessName ?? '',
      p_website: page.website ?? '', p_agreement: page.agreement ?? '' });
    if (r.error) fail(r.error, 'The booking page was not saved.');
    return;
  }
  if (page.active && !slug) throw new OfficeError('Pick a booking link before turning online booking on.');
  const r = await workspace.from('inspector_profiles').update({ booking_slug: slug || null, booking_active: page.active,
    business_name: page.businessName?.trim() || null, website: page.website?.trim() || null, agreement_template: page.agreement || null })
    .eq('id', me.userId).select('id').maybeSingle();
  if (r.error) fail(/duplicate key|23505/.test(r.error.message ?? '') ? { message: 'slug_taken' } : r.error, 'The booking page was not saved.');
}

// ─── Payments (Stripe) — owner only ──────────────────────────────────────────────────────────────────────────────────
export type StripeStatus = { connected: boolean; last4: string | null; mode: 'live' | 'test' | null; restricted: boolean };
const NO_KEY: StripeStatus = { connected: false, last4: null, mode: null, restricted: false };
export async function loadStripeStatus(): Promise<StripeStatus> {
  const r = await workspace.rpc('stripe_key_status');
  if (r.error) fail(r.error, 'The payment status could not be loaded.');
  return { ...NO_KEY, ...((r.data ?? {}) as Partial<StripeStatus>) };
}
/** Sends the key once; answers only the status (Connected + last four). The key is never read back or kept here. */
export async function saveStripeKey(key: string): Promise<StripeStatus> {
  const r = await workspace.rpc('set_stripe_secret_key', { p_key: key.trim() });
  if (r.error) fail(r.error, 'The key was not saved.');
  return { ...NO_KEY, ...((r.data ?? {}) as Partial<StripeStatus>) };
}

// ─── A new job's order and draft invoice ─────────────────────────────────────────────────────────────────────────────
/** The job's CRM order — like the phone's create (one order per job, pointing at its inspection). No fee: money is the
 *  invoice's. The service, when picked, rides as package_id. */
export async function orderForJob(j: { inspectionId: string; contactId: string | null; address: string; date: string; packageId: string | null;
  source?: Record<string, string | null> }): Promise<string> {
  // `source`: where the job came from (#114), shaped by lib/crm/crmHome.ts sourceFields ({} when the server takes none).
  const res = await workspace.from('crm_orders').insert({ inspection_id: j.inspectionId, contact_id: j.contactId, address: j.address.trim(),
    order_date: j.date, status: 'scheduled', package_id: j.packageId, ...(j.source ?? {}) }).select('id').single();
  if (res.error) fail(res.error, 'The job’s order was not saved.');
  return (res.data as { id: string }).id;
}
/** A DRAFT invoice for the order: created by create_invoice, its lines set to the services picked. Never sent here —
 *  the office sends it from Invoices. */
export async function draftInvoiceFor(orderId: string, lines: { description: string; quantity: number; unit_cents: number }[]): Promise<string> {
  const c = await workspace.rpc('create_invoice', { p_order: orderId });
  if (c.error) fail(c.error, 'The draft invoice was not created.');
  const id = c.data as string;
  const inv = await workspace.from('invoices').select('id, row_version').eq('id', id).single();
  if (inv.error) fail(inv.error, 'The draft invoice was not created.');
  const s = await workspace.rpc('set_invoice_lines', { p_invoice: id, p_version: Number((inv.data as any).row_version), p_lines: lines });
  if (s.error) fail(s.error, 'The draft invoice’s lines were not saved.');
  return id;
}
