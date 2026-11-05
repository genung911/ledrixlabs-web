// Contacts — the website's reads and changes (owner 2026-11-05: Contacts mockup approved; "Move all the office/admin
// work to be done on web as well as phone"). The same server records and rules as the phone's CRM (ledrix-app
// src/core/services/CRMService.ts, CRMStripeService.ts; SQL #78):
//   · the server owns a record's company, owner default, version and who-changed-it (crm_guard); the browser never
//     sends company_id / row_version on an insert, and never upserts (an upsert's insert half resets the version);
//   · every update names the next row_version at the version the page loaded — a newer save elsewhere is refused
//     (P0409) and the page reloads and says so (CRMError.conflict);
//   · a booking request becomes an order through ONE server function, confirm_booking;
//   · reads go through row-level security (`crm` permission; an inspector without it sees only their own jobs' rows).
// Money is NOT read here from the order: invoices only (lib/crm/model.ts payOf). scripts/verify-contacts-web.mjs holds
// this module to all of it. Writes live here, never in lib/workspace (read-only by rule) or in a page.
import { workspace } from '@/lib/workspace/client';
import {
  acceptedContactTypes, importable, normalizeDate, type ContactType, type ImportRow,
} from '@/lib/crm/contactsCore';
import type { FollowupType, InvoiceFacts } from '@/lib/crm/model';

export type Contact = {
  id: string; type: ContactType; name: string; email: string | null; phone: string | null; brokerage: string | null;
  tags: string[] | null; notes: string | null; source: string | null; created_at: string; inspector_id: string | null; row_version: number;
};
export type OrderStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type Order = {
  id: string; contact_id: string | null; inspection_id: string | null; address: string; order_date: string;
  status: OrderStatus; notes: string | null; inspector_id: string | null; row_version: number;
};
export type Followup = {
  id: string; contact_id: string; order_id: string | null; due_date: string; type: FollowupType; note: string | null;
  completed: boolean; completed_at: string | null; row_version: number; contact_name?: string | null;
};
export type Booking = {
  id: string; client_name: string; client_email: string | null; client_phone: string | null; address: string | null;
  preferred_date: string | null; preferred_time: string | null; notes: string | null; payment_status: string | null;
  created_at: string; row_version: number;
};
export type OrderNote = { id: string; text: string; at: string; author?: string };

export class CRMError extends Error {
  conflict: boolean;
  constructor(message: string, conflict = false) { super(message); this.name = 'CRMError'; this.conflict = conflict; }
}
const KNOWN: [RegExp, string][] = [
  [/row-level security|not_allowed|permission denied/i, 'You don’t have access to contacts. Ask your company owner for “CRM — clients, agents, bookings”.'],
  [/crm_contacts_type_check/, 'This account can’t save that contact type yet.'],
  [/no address|address/i, 'This booking has no address. Add one before confirming it.'],
];
function fail(error: { code?: string; message?: string } | null, fallback: string): never {
  if (error?.code === 'P0409') throw new CRMError('This record was changed somewhere else. It has been reloaded — please try again.', true);
  const m = error?.message ?? '';
  for (const [re, text] of KNOWN) if (re.test(m)) throw new CRMError(text);
  throw new CRMError(m || fallback);
}
const n = (v: unknown) => Number(v ?? 0);

// ─── Which contact types the server takes (#113 adds 'vendor') ───────────────────────────────────────────────────────
/** crm_contact_types() once #113 is applied; before it the call fails and the answer is the three base types. */
export async function loadContactTypes(): Promise<ContactType[]> {
  const res = await workspace.rpc('crm_contact_types');
  return acceptedContactTypes(res.error ? null : res.data);
}

// ─── Reads ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const CONTACT_COLS = 'id, type, name, email, phone, brokerage, tags, notes, source, created_at, inspector_id, row_version';
const ORDER_COLS = 'id, contact_id, inspection_id, address, order_date, status, notes, inspector_id, row_version';
const FOLLOWUP_COLS = 'id, contact_id, order_id, due_date, type, note, completed, completed_at, row_version';

export async function loadContacts(): Promise<Contact[]> {
  const res = await workspace.from('crm_contacts').select(CONTACT_COLS).order('name').limit(5000);
  if (res.error) fail(res.error, 'Contacts could not be loaded.');
  return ((res.data ?? []) as unknown as Contact[]).map(c => ({ ...c, row_version: n(c.row_version) }));
}

export async function loadOrders(): Promise<Order[]> {
  const res = await workspace.from('crm_orders').select(ORDER_COLS).order('order_date', { ascending: false }).limit(5000);
  if (res.error) fail(res.error, 'Jobs could not be loaded.');
  return ((res.data ?? []) as unknown as Order[]).map(o => ({ ...o, row_version: n(o.row_version) }));
}

export async function loadFollowups(contactId?: string): Promise<Followup[]> {
  let q = workspace.from('crm_followups').select(`${FOLLOWUP_COLS}, crm_contacts(name)`).order('due_date');
  q = contactId ? q.eq('contact_id', contactId) : q.eq('completed', false);
  const res = await q.limit(2000);
  if (res.error) fail(res.error, 'Follow-ups could not be loaded.');
  return ((res.data ?? []) as unknown as (Followup & { crm_contacts?: { name?: string } | null })[]).map(f => ({
    ...f, row_version: n(f.row_version), contact_name: f.crm_contacts?.name ?? null,
  }));
}

/** The invoices of these orders, or null when this person may not read invoices (the `invoices` permission). */
export async function loadInvoicesFor(orderIds: string[]): Promise<InvoiceFacts[] | null> {
  if (!orderIds.length) return [];
  const res = await workspace.from('invoice_list')
    .select('id, number, order_id, status, shown_status, total_cents, paid_cents, balance_cents').in('order_id', orderIds).limit(2000);
  if (res.error) return null;
  return ((res.data ?? []) as unknown as InvoiceFacts[]).map(i => ({
    ...i, number: n(i.number), total_cents: n(i.total_cents), paid_cents: n(i.paid_cents), balance_cents: n(i.balance_cents),
  }));
}

/** Each job's running notes (the inspection's 'order_notes' document) — read-only here; written on the job. */
export async function loadOrderNotes(inspectionIds: string[]): Promise<Record<string, OrderNote[]>> {
  if (!inspectionIds.length) return {};
  const res = await workspace.from('inspection_documents').select('inspection_id, payload')
    .eq('doc_key', 'order_notes').in('inspection_id', inspectionIds);
  const out: Record<string, OrderNote[]> = {};
  for (const r of (res.data ?? []) as { inspection_id: string; payload: unknown }[]) {
    if (Array.isArray(r.payload)) out[r.inspection_id] = (r.payload as OrderNote[]).filter(x => x && typeof x.text === 'string');
  }
  return out;
}

export async function loadPendingBookings(): Promise<Booking[]> {
  const res = await workspace.from('crm_bookings')
    .select('id, client_name, client_email, client_phone, address, preferred_date, preferred_time, notes, payment_status, created_at, row_version')
    .eq('status', 'pending').order('created_at', { ascending: false }).limit(200);
  if (res.error) return [];
  return ((res.data ?? []) as unknown as Booking[]).map(b => ({ ...b, row_version: n(b.row_version) }));
}

// ─── Versioned writes (the phone's crmInsert / crmUpdate) ────────────────────────────────────────────────────────────
const SERVER_OWNED = ['id', 'company_id', 'created_at', 'updated_at', 'updated_by', 'row_version'];
function clientFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined && !SERVER_OWNED.includes(k)) out[k] = v;
  return out;
}

async function crmInsert(table: string, row: Record<string, unknown>): Promise<string> {
  const res = await workspace.from(table).insert(clientFields(row)).select('id').single();
  if (res.error) fail(res.error, 'It was not saved.');
  return (res.data as { id: string }).id;
}

/** Update at the version the page loaded (`version`) — a newer save elsewhere is a conflict. */
async function crmUpdate(table: string, id: string, patch: Record<string, unknown>, version: number): Promise<void> {
  const res = await workspace.from(table).update({ ...clientFields(patch), row_version: version + 1 })
    .eq('id', id).eq('row_version', version).select('id').maybeSingle();
  if (res.error) fail(res.error, 'It was not saved.');
  if (!res.data) fail({ code: 'P0409' }, '');
}

// ─── Changes ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export type ContactInput = { type: ContactType; name: string; email?: string; phone?: string; brokerage?: string; notes?: string };
const clean = (s?: string) => (s && s.trim() ? s.trim() : null);

export async function addContact(c: ContactInput): Promise<string> {
  if (!c.name.trim()) throw new CRMError('A contact needs a name.');
  return crmInsert('crm_contacts', { type: c.type, name: c.name.trim(), email: clean(c.email), phone: clean(c.phone),
    brokerage: clean(c.brokerage), notes: clean(c.notes), source: 'manual' });
}
export async function saveContact(c: Contact, edit: ContactInput): Promise<void> {
  if (!edit.name.trim()) throw new CRMError('A contact needs a name.');
  await crmUpdate('crm_contacts', c.id, { type: edit.type, name: edit.name.trim(), email: clean(edit.email), phone: clean(edit.phone),
    brokerage: clean(edit.brokerage), notes: clean(edit.notes) }, c.row_version);
}
export async function removeContact(c: Contact): Promise<void> {
  const res = await workspace.from('crm_contacts').delete().eq('id', c.id).eq('row_version', c.row_version).select('id');
  if (res.error) fail(res.error, 'The contact was not removed.');
  if (!(res.data ?? []).length) fail({ code: 'P0409' }, '');
}

/** "+ Schedule a job": a CRM order (not an inspection yet — the inspection is started from it later). No fee is sent;
 *  money is the invoice's. */
export async function scheduleJob(j: { contactId: string | null; address: string; date: string; notes?: string }): Promise<string> {
  if (!j.address.trim()) throw new CRMError('Add the property address.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date)) throw new CRMError('Pick a date.');
  return crmInsert('crm_orders', { contact_id: j.contactId, address: j.address.trim(), order_date: j.date, status: 'scheduled', notes: clean(j.notes) });
}
export async function changeJob(o: Order, patch: { order_date?: string; status?: OrderStatus }): Promise<void> {
  await crmUpdate('crm_orders', o.id, patch, o.row_version);
}

export async function addFollowup(f: { contactId: string; orderId?: string | null; due: string; type: FollowupType; note?: string }): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.due)) throw new CRMError('Pick a due date.');
  await crmInsert('crm_followups', { contact_id: f.contactId, order_id: f.orderId ?? null, due_date: f.due, type: f.type, note: clean(f.note), completed: false });
}
export async function setFollowupDone(f: Followup, done: boolean): Promise<void> {
  await crmUpdate('crm_followups', f.id, { completed: done, completed_at: done ? new Date().toISOString() : null }, f.row_version);
}

/** A booking request → an order: one server function (#78 confirm_booking). */
export async function confirmBooking(b: Booking): Promise<void> {
  const res = await workspace.rpc('confirm_booking', { p_booking: b.id });
  if (res.error) fail(res.error, 'The booking was not confirmed.');
}
export async function declineBooking(b: Booking): Promise<void> {
  await crmUpdate('crm_bookings', b.id, { status: 'cancelled' }, b.row_version);
}

/** CSV import — the phone's bulkImport: one contact per email (an existing one is updated at its version), plus an
 *  order when the row has an address and a date. Rows of a type the server does not take yet are not sent. */
export async function importContacts(all: ImportRow[], accepted: readonly ContactType[]): Promise<{ contacts: number; orders: number; refused: number; failed: number }> {
  const { rows, refused } = importable(all, accepted);
  let contacts = 0, orders = 0, failed = 0;
  for (const row of rows) {
    if (!row.name) continue;
    const fields = { type: row.type, name: row.name, email: row.email ?? null, phone: row.phone ?? null, brokerage: row.brokerage ?? null, source: 'import' };
    let id: string | null = null;
    try {
      const found = row.email
        ? ((await workspace.from('crm_contacts').select('id, row_version').ilike('email', row.email).limit(1)).data ?? [])[0] as { id: string; row_version: number } | undefined
        : undefined;
      if (found) { await crmUpdate('crm_contacts', found.id, fields, n(found.row_version)); id = found.id; }
      else id = await crmInsert('crm_contacts', fields);
      contacts++;
    } catch { failed++; continue; }
    if (id && row.address && row.orderDate) {
      try {
        await crmInsert('crm_orders', { contact_id: id, address: row.address, order_date: normalizeDate(row.orderDate), status: row.status ?? 'completed' });
        orders++;
      } catch { /* the contact stands; the order is reported by the count */ }
    }
  }
  return { contacts, orders, refused: refused.length, failed };
}
