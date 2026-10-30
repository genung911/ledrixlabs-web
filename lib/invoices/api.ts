// Invoices — the website's reads and changes (ledrix-app PLAN_2026-10-29 Part E4; mockup approved 2026-10-30,
// "Website — Invoices"). The same server records and functions as the phone (ledrix-app InvoiceService.ts, SQL #79):
// reads go through row-level security (`invoices` permission), and EVERY change is one server function at the version
// the page loaded — no table is written from the browser. Card payments are never recorded here; the pay link's
// server function records them after checking with Stripe. scripts/verify-invoices-web.mjs holds this module to that.
import { workspace } from '@/lib/workspace/client';

export type ShownStatus = 'draft' | 'sent' | 'partly_paid' | 'paid' | 'overdue' | 'void';
export type InvoiceRow = {
  id: string; number: number; order_id: string | null; inspection_id: string | null;
  status: 'draft' | 'sent' | 'void'; shown_status: ShownStatus; revision: number;
  bill_to_name: string | null; bill_to_email: string | null; property_address: string | null;
  issued_on: string | null; due_on: string | null; send_count: number;
  total_cents: number; paid_cents: number; balance_cents: number; pay_token: string; row_version: number;
};
export type InvoiceLine = { position: number; description: string; quantity: number; unit_cents: number; amount_cents: number };
export type InvoicePayment = {
  id: string; amount_cents: number; method: string; reference: string | null; received_on: string;
  source: 'stripe' | 'manual'; reverses: string | null;
};
export type InvoiceDetail = InvoiceRow & { lines: InvoiceLine[]; payments: InvoicePayment[] };
export type UninvoicedJob = { order_id: string; address: string; order_date: string; fee: number; client_name: string | null };

export const STATUS_LABEL: Record<ShownStatus, string> = {
  draft: 'Draft', sent: 'Sent', partly_paid: 'Partly paid', paid: 'Paid', overdue: 'Overdue', void: 'Void',
};
export const money = (cents: number) =>
  `$${(Math.round(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const invoiceNumber = (i: { number: number }) => `INV-${i.number}`;
export const payLink = (i: { pay_token: string }) => `https://www.ledrixlabs.com/pay/${i.pay_token}`;
export function toCents(text: string): number | null {
  const n = Number(String(text).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}
export const isUnpaid = (i: Pick<InvoiceRow, 'shown_status' | 'balance_cents'>) =>
  (i.shown_status === 'sent' || i.shown_status === 'partly_paid' || i.shown_status === 'overdue') && i.balance_cents > 0;

export class InvoiceError extends Error {
  conflict: boolean;
  constructor(message: string, conflict = false) { super(message); this.name = 'InvoiceError'; this.conflict = conflict; }
}
const KNOWN: [RegExp, string][] = [
  [/not_allowed/, 'You don’t have access to invoices. Ask your company owner for “Invoices & payments”.'],
  [/already_invoiced/, 'This job already has an open invoice.'],
  [/not_a_draft/, 'A sent invoice must be revised before its lines change.'],
  [/empty_invoice/, 'Add at least one line with an amount first.'],
  [/email_required/, 'Add the client’s email address first.'],
  [/amount_out_of_range/, 'That amount is more than the balance due.'],
  [/reverse_payments_first/, 'Reverse the recorded payments before voiding this invoice.'],
  [/already_reversed/, 'That payment was already reversed.'],
];
function fail(error: { code?: string; message?: string } | null, fallback: string): never {
  if (error?.code === 'P0409') throw new InvoiceError('This invoice was changed somewhere else. It has been reloaded — please try again.', true);
  const m = error?.message ?? '';
  for (const [re, text] of KNOWN) if (re.test(m)) throw new InvoiceError(text);
  throw new InvoiceError(m || fallback);
}
const n = (v: unknown) => Number(v ?? 0);
const LIST_COLS = 'id, number, order_id, inspection_id, status, shown_status, revision, bill_to_name, bill_to_email, ' +
  'property_address, issued_on, due_on, send_count, total_cents, paid_cents, balance_cents, pay_token, row_version';
const asRow = (r: Record<string, unknown>) => ({ ...r, total_cents: n(r.total_cents), paid_cents: n(r.paid_cents), balance_cents: n(r.balance_cents), row_version: n(r.row_version) }) as InvoiceRow;

// ─── Reads ─────────────────────────────────────────────────────────────────────
export async function loadInvoices(): Promise<InvoiceRow[]> {
  const res = await workspace.from('invoice_list').select(LIST_COLS).order('number', { ascending: false }).limit(500);
  if (res.error) fail(res.error, 'Invoices could not be loaded.');
  return ((res.data ?? []) as unknown as Record<string, unknown>[]).map(asRow);
}

export async function loadInvoice(id: string): Promise<InvoiceDetail | null> {
  const [row, lines, pays] = await Promise.all([
    workspace.from('invoice_list').select(LIST_COLS).eq('id', id).maybeSingle(),
    workspace.from('invoice_lines').select('position, description, quantity, unit_cents, amount_cents').eq('invoice_id', id).order('position'),
    workspace.from('invoice_payments').select('id, amount_cents, method, reference, received_on, source, reverses').eq('invoice_id', id).order('recorded_at'),
  ]);
  if (row.error) fail(row.error, 'The invoice could not be loaded.');
  if (!row.data) return null;
  return {
    ...asRow(row.data as unknown as Record<string, unknown>),
    lines: (lines.data ?? []).map(l => ({ ...l, quantity: n(l.quantity), unit_cents: n(l.unit_cents), amount_cents: n(l.amount_cents) })) as InvoiceLine[],
    payments: (pays.data ?? []).map(p => ({ ...p, amount_cents: n(p.amount_cents) })) as InvoicePayment[],
  };
}

export async function loadUninvoicedJobs(): Promise<UninvoicedJob[]> {
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().split('T')[0];
  const [orders, open] = await Promise.all([
    workspace.from('crm_orders').select('id, address, order_date, fee, crm_contacts(name)').neq('status', 'cancelled')
      .gte('order_date', since).order('order_date', { ascending: false }).limit(200),
    workspace.from('invoices').select('order_id').neq('status', 'void').not('order_id', 'is', null),
  ]);
  const taken = new Set((open.data ?? []).map(r => r.order_id));
  return (orders.data ?? []).filter(o => !taken.has(o.id)).map(o => ({
    order_id: o.id, address: o.address ?? '', order_date: o.order_date, fee: n(o.fee),
    client_name: (o as { crm_contacts?: { name?: string } | null }).crm_contacts?.name ?? null,
  }));
}

export async function loadCollected(sinceIso: string): Promise<number> {
  const res = await workspace.from('invoice_payments').select('amount_cents').gte('received_on', sinceIso);
  return (res.data ?? []).reduce((s, p) => s + n(p.amount_cents), 0);
}

// ─── Changes — each one server function ────────────────────────────────────────
export async function createInvoice(orderId?: string): Promise<string> {
  const res = await workspace.rpc('create_invoice', orderId ? { p_order: orderId } : {});
  if (res.error) fail(res.error, 'The invoice could not be created.');
  return res.data as string;
}
export async function setLines(inv: InvoiceRow, lines: { description: string; quantity: number; unit_cents: number }[]) {
  const res = await workspace.rpc('set_invoice_lines', { p_invoice: inv.id, p_version: inv.row_version, p_lines: lines });
  if (res.error) fail(res.error, 'The lines were not saved.');
}
export async function setDetails(inv: InvoiceRow, d: { name: string; email: string; address: string }) {
  const res = await workspace.rpc('update_invoice_details', { p_invoice: inv.id, p_version: inv.row_version, p_name: d.name, p_email: d.email, p_address: d.address });
  if (res.error) fail(res.error, 'The details were not saved.');
}
export async function revise(inv: InvoiceRow) {
  const res = await workspace.rpc('revise_invoice', { p_invoice: inv.id, p_version: inv.row_version });
  if (res.error) fail(res.error, 'The invoice could not be revised.');
}
export async function voidIt(inv: InvoiceRow, reason: string) {
  const res = await workspace.rpc('void_invoice', { p_invoice: inv.id, p_version: inv.row_version, p_reason: reason });
  if (res.error) fail(res.error, 'The invoice could not be voided.');
}
export async function recordPayment(inv: InvoiceRow, p: { amount_cents: number; method: 'check' | 'cash' | 'transfer' | 'other'; reference: string; received_on: string }) {
  const res = await workspace.rpc('record_invoice_payment', { p_invoice: inv.id, p_amount_cents: p.amount_cents, p_method: p.method, p_reference: p.reference, p_received_on: p.received_on });
  if (res.error) fail(res.error, 'The payment was not recorded.');
}
export async function reversePayment(paymentId: string, reason: string) {
  const res = await workspace.rpc('reverse_invoice_payment', { p_payment: paymentId, p_reason: reason });
  if (res.error) fail(res.error, 'The payment was not reversed.');
}
export async function markSent(inv: InvoiceRow, via: 'share' | 'link') {
  const res = await workspace.rpc('mark_invoice_sent', { p_invoice: inv.id, p_version: inv.row_version, p_via: via });
  if (res.error) fail(res.error, 'The invoice was not marked sent.');
}
/** Email it with its pay link (send-invoice, as the signed-in person). Marked sent only after the email went out. */
export async function emailIt(inv: InvoiceRow) {
  const res = await workspace.functions.invoke('send-invoice', { body: { invoice_id: inv.id, version: inv.row_version } });
  if (!res.error) { if ((res.data as { recorded?: boolean } | null)?.recorded === false) throw new InvoiceError('Emailed, but the invoice changed meanwhile — reload to see it.', true); return; }
  let code = '';
  try { code = (await (res.error as { context?: Response }).context?.json())?.error ?? ''; } catch { /* not JSON */ }
  if (code === 'invoice_version_conflict') throw new InvoiceError('This invoice was changed somewhere else. It has been reloaded — please try again.', true);
  if (code === 'email_not_configured') throw new InvoiceError('Invoice email isn’t switched on yet. Download the PDF or copy the pay link instead.');
  if (code === 'email_required') throw new InvoiceError('Add the client’s email address first.');
  if (code === 'empty_invoice') throw new InvoiceError('Add at least one line with an amount first.');
  throw new InvoiceError('The invoice was not emailed. Please try again.');
}
