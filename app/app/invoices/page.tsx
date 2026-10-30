'use client';
// Invoices (ledrix-app PLAN_2026-10-29 Part E4; mockup approved 2026-10-30, "Website — Invoices"). The same records
// and server functions as the phone: the list, the jobs not invoiced yet, and the selected invoice beside it — its
// lines (editable while a draft), payments (reversible), balance, and the ways to send it. Every change goes to the
// server through lib/invoices/api.ts and is shown only once the server confirms it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader } from '@/components/workspace/ui';
import {
  STATUS_LABEL, createInvoice, emailIt, invoiceNumber, isUnpaid, loadCollected, loadInvoice, loadInvoices,
  loadUninvoicedJobs, markSent, money, payLink, recordPayment, reversePayment, revise, setDetails, setLines, toCents,
  voidIt, InvoiceError, type InvoiceDetail, type InvoiceRow, type ShownStatus, type UninvoicedJob,
} from '@/lib/invoices/api';

const BTN = 'rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink/85 disabled:opacity-50';
const BTN_QUIET = 'rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50';
const FIELD = 'h-10 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const PILL: Record<ShownStatus, string> = {
  overdue: 'bg-red-50 text-red-800', sent: 'bg-accent/10 text-accent-ink', partly_paid: 'bg-amber-50 text-amber-900',
  paid: 'bg-emerald-50 text-emerald-800', draft: 'bg-ground text-body', void: 'bg-ground text-muted line-through',
};
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; };

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; rows: InvoiceRow[]; jobs: UninvoicedJob[]; collected: number };

export default function InvoicesPage() {
  const { companyName } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selId, setSelId] = useState<string | null>(null);
  const [sel, setSel] = useState<InvoiceDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, jobs, collected] = await Promise.all([loadInvoices(), loadUninvoicedJobs(), loadCollected(monthStart())]);
      setState({ kind: 'ready', rows, jobs, collected });
      setSelId(cur => cur ?? rows.find(r => r.status !== 'void')?.id ?? null);
    } catch (e) { setState({ kind: 'error', message: msg(e) }); }
  }, []);
  const loadSel = useCallback(async (id: string | null) => {
    if (!id) { setSel(null); return; }
    try { setSel(await loadInvoice(id)); } catch (e) { setNotice({ ok: false, text: msg(e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSel(selId); }, [selId, loadSel]);

  /** One server step; on success reload both list and invoice; on a conflict reload and say so. */
  const act = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true); setNotice(null);
    try { await fn(); await Promise.all([load(), loadSel(selId)]); if (done) setNotice({ ok: true, text: done }); return true; }
    catch (e) { if (e instanceof InvoiceError && e.conflict) await Promise.all([load(), loadSel(selId)]); setNotice({ ok: false, text: msg(e) }); return false; }
    finally { setBusy(false); }
  };

  const create = async (orderId?: string) => {
    setBusy(true); setNotice(null);
    try { const id = await createInvoice(orderId); await load(); setSelId(id); }
    catch (e) { setNotice({ ok: false, text: msg(e) }); }
    finally { setBusy(false); }
  };

  const totals = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const unpaid = state.rows.filter(isUnpaid);
    const overdue = unpaid.filter(r => r.shown_status === 'overdue');
    return {
      outstanding: unpaid.reduce((s, r) => s + r.balance_cents, 0),
      overdue: overdue.reduce((s, r) => s + r.balance_cents, 0), overdueCount: overdue.length,
    };
  }, [state]);

  const exportCsv = () => {
    if (state.kind !== 'ready') return;
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['Invoice,Status,Issued,Client,Property,Total,Paid,Balance', ...state.rows.map(i => [
      invoiceNumber(i), STATUS_LABEL[i.shown_status], i.issued_on ?? '', q(i.bill_to_name), q(i.property_address),
      (i.total_cents / 100).toFixed(2), (i.paid_cents / 100).toFixed(2), (Math.max(i.balance_cents, 0) / 100).toFixed(2)].join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `ledrix-invoices-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Page>
      <PageHeader title="Invoices" subtitle={companyName ?? 'Your invoices'} actions={<>
        <button type="button" onClick={exportCsv} disabled={state.kind !== 'ready'} className={BTN_QUIET}>Export CSV</button>
        <button type="button" onClick={() => create()} disabled={busy} className={BTN}>New invoice</button>
      </>} />

      {notice && (
        <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${notice.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}>{notice.text}</div>
      )}
      {state.kind === 'loading' && <Card><Loading /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && totals && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Collected this month" value={money(state.collected)} tone="text-emerald-800" />
            <Stat label="Outstanding" value={money(totals.outstanding)} tone="text-amber-900" />
            <Stat label="Overdue" value={`${money(totals.overdue)} · ${totals.overdueCount}`} tone="text-red-800" />
            <Stat label="Jobs not invoiced" value={String(state.jobs.length)} />
          </div>

          {state.jobs.length > 0 && (
            <Card title="Jobs not invoiced" count={state.jobs.length}>
              <ul className="divide-y divide-hairline">
                {state.jobs.slice(0, 10).map(j => (
                  <li key={j.order_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 text-sm"><span className="font-medium text-ink">{j.client_name ?? j.address}</span>
                      <span className="text-body"> · {[j.client_name ? j.address : null, j.order_date, j.fee > 0 ? money(j.fee * 100) : null].filter(Boolean).join(' · ')}</span></span>
                    <button type="button" disabled={busy} onClick={() => create(j.order_id)} className={BTN_QUIET}>Create invoice</button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap items-start gap-5">
            <section aria-label="Invoices" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-xl border border-hairline bg-surface">
              {state.rows.length === 0 ? <Empty>No invoices yet. Create one from a job, or with New invoice.</Empty> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="border-b border-hairline text-xs uppercase tracking-wide text-muted">
                      <tr><th className="px-4 py-2.5 font-semibold">Invoice</th><th className="px-4 py-2.5 font-semibold">Client</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 font-semibold">Due</th><th className="px-4 py-2.5 text-right font-semibold">Balance</th></tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {state.rows.map(r => (
                        <tr key={r.id} className={selId === r.id ? 'bg-accent/5' : undefined}>
                          <td className="px-4 py-2.5"><button type="button" onClick={() => setSelId(r.id)} className="font-semibold text-accent-ink hover:underline">{invoiceNumber(r)}</button></td>
                          <td className="px-4 py-2.5 text-ink">{r.bill_to_name ?? '—'}<span className="block text-xs text-body">{r.property_address ?? ''}</span></td>
                          <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[r.shown_status]}`}>{STATUS_LABEL[r.shown_status]}</span></td>
                          <td className="px-4 py-2.5 text-body">{r.status === 'draft' ? '—' : r.due_on ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-ink">{money(Math.max(r.balance_cents, 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {sel && <InvoicePanel inv={sel} busy={busy} business={companyName} act={act} />}
          </div>
        </div>
      )}
    </Page>
  );
}

function Stat({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
      <div className="text-xs text-body">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function InvoicePanel({ inv, busy, business, act }: {
  inv: InvoiceDetail; busy: boolean; business: string | null;
  act: (fn: () => Promise<void>, done?: string) => Promise<boolean>;
}) {
  const [lines, setLinesDraft] = useState<{ description: string; quantity: string; unit: string }[] | null>(null);
  const [details, setDetailsDraft] = useState<{ name: string; email: string; address: string } | null>(null);
  const [pay, setPay] = useState<{ amount: string; method: 'check' | 'cash' | 'transfer' | 'other'; ref: string; date: string } | null>(null);
  useEffect(() => { setLinesDraft(null); setDetailsDraft(null); setPay(null); }, [inv.id]);

  const isDraft = inv.status === 'draft', isVoid = inv.status === 'void';
  const owed = !isDraft && !isVoid && inv.balance_cents > 0;
  const reversed = new Set(inv.payments.filter(p => p.reverses).map(p => p.reverses));

  const saveLines = async () => {
    if (!lines) return;
    const parsed = lines.filter(l => l.description.trim() || l.unit.trim()).map(l => ({
      description: l.description.trim(), quantity: Number(l.quantity) || 1, unit_cents: Math.round(Number(l.unit.replace(/[$,\s]/g, '')) * 100) }));
    if (!parsed.length || parsed.some(l => !l.description || !Number.isFinite(l.unit_cents) || l.unit_cents < 0)) {
      await act(async () => { throw new InvoiceError('Each line needs a description and a price (0 or more).'); }); return;
    }
    if (await act(() => setLines(inv, parsed), 'Lines saved.')) setLinesDraft(null);
  };

  const printPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = inv.lines.map(l => `<tr><td>${esc(l.description)}${l.quantity !== 1 ? ` × ${esc(l.quantity)}` : ''}</td><td style="text-align:right">${money(l.amount_cents)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><title>${esc(invoiceNumber(inv))}</title><style>body{font-family:Helvetica,Arial,sans-serif;margin:40px;color:#111}td{padding:8px 0;border-bottom:1px solid #ddd}table{width:100%;border-collapse:collapse;margin-top:16px}.m{color:#555}</style></head><body>
      <div class="m">${esc(business ?? '')}</div><h1>Invoice ${esc(invoiceNumber(inv))}</h1>
      <div class="m">${[inv.bill_to_name, inv.property_address].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="m">${inv.issued_on ? `Issued ${esc(inv.issued_on)} · due on receipt` : 'Draft'}</div>
      <table>${rows}<tr><td><b>Total</b></td><td style="text-align:right"><b>${money(inv.total_cents)}</b></td></tr>
      ${inv.paid_cents ? `<tr><td>Paid</td><td style="text-align:right">−${money(inv.paid_cents)}</td></tr>` : ''}
      <tr><td><b>${inv.balance_cents > 0 ? 'Balance due' : 'Paid in full'}</b></td><td style="text-align:right"><b>${money(Math.max(inv.balance_cents, 0))}</b></td></tr></table>
      ${owed ? `<p>Pay online: ${esc(payLink(inv))}</p>` : ''}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <aside aria-label={`Invoice ${invoiceNumber(inv)}`} className="min-w-0 flex-[1_1_380px] overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="flex flex-col gap-1 border-b border-hairline p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{invoiceNumber(inv)}{inv.revision > 1 ? ` · rev ${inv.revision}` : ''}</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[inv.shown_status]}`}>{STATUS_LABEL[inv.shown_status]}</span>
        </div>
        <span className="text-sm text-body">{[inv.bill_to_name, inv.property_address].filter(Boolean).join(' · ') || 'No client yet'}</span>
        <span className="text-xs text-muted">{isDraft ? 'Not sent yet' : isVoid ? 'Voided' : `Sent ${inv.issued_on ?? ''}${inv.send_count > 1 ? ` · sent ${inv.send_count}×` : ''} · due on receipt`}{inv.bill_to_email ? ` · ${inv.bill_to_email}` : ''}</span>
        {!isVoid && !details && <button type="button" onClick={() => setDetailsDraft({ name: inv.bill_to_name ?? '', email: inv.bill_to_email ?? '', address: inv.property_address ?? '' })} className="self-start text-xs font-semibold text-accent-ink hover:underline">Edit client and property</button>}
        {details && (
          <form className="mt-2 flex flex-col gap-2" onSubmit={async e => { e.preventDefault(); if (await act(() => setDetails(inv, details), 'Saved.')) setDetailsDraft(null); }}>
            {(['name', 'email', 'address'] as const).map(k => (
              <label key={k} className="flex flex-col gap-1 text-xs font-semibold text-body">{k === 'name' ? 'Name' : k === 'email' ? 'Email' : 'Property'}
                <input className={FIELD} type={k === 'email' ? 'email' : 'text'} value={details[k]} onChange={e => setDetailsDraft({ ...details, [k]: e.target.value })} /></label>
            ))}
            <div className="flex gap-2"><button type="button" className={BTN_QUIET} onClick={() => setDetailsDraft(null)}>Cancel</button><button type="submit" disabled={busy} className={BTN}>Save</button></div>
          </form>
        )}
      </div>

      <div className="px-4 py-2">
        {lines ? (
          <div className="flex flex-col gap-2 py-2">
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input aria-label={`Line ${i + 1} description`} className={`${FIELD} min-w-[160px] flex-[3]`} placeholder="Description" value={l.description} onChange={e => setLinesDraft(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                <input aria-label={`Line ${i + 1} quantity`} className={`${FIELD} w-16 flex-none`} inputMode="decimal" value={l.quantity} onChange={e => setLinesDraft(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                <input aria-label={`Line ${i + 1} price`} className={`${FIELD} min-w-[90px] flex-1`} inputMode="decimal" placeholder="0.00" value={l.unit} onChange={e => setLinesDraft(lines.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setLinesDraft(lines.filter((_, j) => j !== i))} className="rounded-full px-2 py-1 text-muted hover:bg-ink/5">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setLinesDraft([...lines, { description: '', quantity: '1', unit: '' }])} className="self-start text-sm font-semibold text-accent-ink hover:underline">+ Add a line</button>
            <div className="flex gap-2"><button type="button" className={BTN_QUIET} onClick={() => setLinesDraft(null)}>Cancel</button><button type="button" disabled={busy} onClick={saveLines} className={BTN}>Save lines</button></div>
          </div>
        ) : (
          <>
            {inv.lines.length === 0 && <p className="py-3 text-sm text-body">No lines yet.</p>}
            {inv.lines.map(l => (
              <div key={l.position} className="flex justify-between gap-3 border-b border-hairline py-2 text-sm"><span className="text-ink">{l.description}{l.quantity !== 1 ? <span className="text-body"> × {l.quantity}</span> : null}</span><span className="font-semibold text-ink">{money(l.amount_cents)}</span></div>
            ))}
            <div className="flex justify-between py-2.5 text-sm font-bold text-ink"><span>Total</span><span>{money(inv.total_cents)}</span></div>
            {isDraft && <button type="button" onClick={() => setLinesDraft(inv.lines.length ? inv.lines.map(l => ({ description: l.description, quantity: String(l.quantity), unit: (l.unit_cents / 100).toFixed(2) })) : [{ description: '', quantity: '1', unit: '' }])} className="pb-2 text-sm font-semibold text-accent-ink hover:underline">Edit lines</button>}
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-4 pb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Payments</span>
        {inv.payments.length === 0 && <span className="text-sm text-body">None yet.</span>}
        {inv.payments.map(p => {
          const isRev = p.amount_cents < 0;
          return (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink">{isRev ? 'Reversed' : p.method === 'card' ? `Card ${p.reference ?? ''}` : `${p.method[0].toUpperCase()}${p.method.slice(1)} ${p.reference ?? ''}`}<span className="text-body"> · {p.received_on}{reversed.has(p.id) ? ' · reversed' : ''}</span></span>
              <span className="flex items-center gap-2">
                <span className={`font-semibold ${isRev ? 'text-amber-900' : 'text-emerald-800'}`}>{isRev ? '−' : ''}{money(Math.abs(p.amount_cents))}</span>
                {!isRev && !reversed.has(p.id) && !isVoid && (
                  <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Reverse this ${money(p.amount_cents)} payment? Its opposite is recorded; nothing is deleted.${p.source === 'stripe' ? ' Refund the card in Stripe as well.' : ''}`)) act(() => reversePayment(p.id, 'Reversed on the website'), 'Payment reversed.'); }}
                    className="rounded-full border border-hairline px-2 py-0.5 text-xs font-semibold text-body hover:bg-ink/5">Reverse</button>
                )}
              </span>
            </div>
          );
        })}
        <div className="mt-1 flex justify-between border-t border-hairline pt-2 text-base font-bold text-ink"><span>{inv.balance_cents > 0 ? 'Balance due' : 'Paid in full'}</span><span>{money(Math.max(inv.balance_cents, 0))}</span></div>
      </div>

      {pay && (
        <form className="flex flex-col gap-2 border-t border-hairline p-4" onSubmit={async e => {
          e.preventDefault();
          const cents = toCents(pay.amount);
          if (!cents) return;
          if (await act(() => recordPayment(inv, { amount_cents: cents, method: pay.method, reference: pay.ref, received_on: pay.date }), 'Payment recorded.')) setPay(null);
        }}>
          <span className="text-sm font-semibold text-ink">Record a payment</span>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-body">Amount<input className={FIELD} inputMode="decimal" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-body">How they paid
              <select className={FIELD} value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value as typeof pay.method })}>
                <option value="check">Check</option><option value="cash">Cash</option><option value="transfer">Bank transfer</option><option value="other">Other</option>
              </select></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-body">Reference<input className={FIELD} value={pay.ref} onChange={e => setPay({ ...pay, ref: e.target.value })} placeholder="Check number, note…" /></label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-body">Received<input className={FIELD} type="date" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} /></label>
          </div>
          <p className="text-xs text-muted">Card payments through the pay link are recorded by Stripe on their own. A recorded payment can be reversed, never edited.</p>
          <div className="flex gap-2"><button type="button" className={BTN_QUIET} onClick={() => setPay(null)}>Cancel</button><button type="submit" disabled={busy || !toCents(pay.amount)} className={BTN}>Record {money(toCents(pay.amount) ?? 0)}</button></div>
        </form>
      )}

      {!isVoid && !lines && (
        <div className="flex flex-wrap gap-2 border-t border-hairline p-4">
          {(isDraft || owed) && <button type="button" disabled={busy} className={BTN} onClick={() => act(() => emailIt(inv), isDraft ? `Emailed to ${inv.bill_to_email ?? 'the client'}.` : 'Reminder emailed.')}>{isDraft ? 'Email invoice' : 'Send reminder'}</button>}
          {owed && !pay && <button type="button" disabled={busy} className={BTN_QUIET} onClick={() => setPay({ amount: (inv.balance_cents / 100).toFixed(2), method: 'check', ref: '', date: new Date().toISOString().split('T')[0] })}>Record a payment</button>}
          {owed && <button type="button" className={BTN_QUIET} onClick={async () => { await navigator.clipboard.writeText(payLink(inv)); act(async () => {}, 'Pay link copied.'); }}>Copy pay link</button>}
          <button type="button" className={BTN_QUIET} onClick={printPdf}>Download PDF</button>
          {isDraft && inv.total_cents > 0 && <button type="button" disabled={busy} className={BTN_QUIET} onClick={() => act(() => markSent(inv, 'share'), 'Marked as sent.')}>Mark as sent</button>}
          {inv.status === 'sent' && <button type="button" disabled={busy} className={BTN_QUIET} onClick={() => { if (window.confirm('Revise this invoice? It becomes a draft again so its lines can change; its number and payments stay.')) act(() => revise(inv), 'Revised — now a draft.'); }}>Revise</button>}
          <button type="button" disabled={busy} className="rounded-full px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            onClick={() => { if (inv.paid_cents !== 0) { act(async () => { throw new InvoiceError('Reverse the recorded payments before voiding this invoice.'); }); return; }
              if (window.confirm(`Void ${invoiceNumber(inv)}? It stays on record as void; its number is never reused.`)) act(() => voidIt(inv, 'Voided on the website'), 'Voided.'); }}>Void</button>
        </div>
      )}
      <p className="border-t border-hairline px-4 py-3 text-xs text-muted">Only people with “Invoices &amp; payments” see this. Every change and payment is kept in the invoice’s history.</p>
    </aside>
  );
}
