'use client';
// Pay an invoice (ledrix-app PLAN_2026-10-29 Part E2). The link in the invoice email: /pay/<64-hex token>.
// Reads ONE invoice through get_invoice_for_payment (SQL #80 — what the client needs to see, nothing else); pays its
// balance through the `payments` function, which starts a Stripe Checkout with the inspector's own key. On the way back
// it asks the SERVER to confirm the payment with Stripe — this page never decides what was paid.
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const ACCENT = '#217BE8';
const BG     = '#080808';
const CARD   = '#0e0e0e';
const BORDER = '#1f2a2e';
const GREEN  = '#22C55E';
const MUTED  = '#9aacb0';

const SUPA_URL  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_HEADERS = { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}`, 'Content-Type': 'application/json' };

type Line = { description: string; quantity: number; amount_cents: number };
type PayInvoice = {
  status: 'sent' | 'overdue' | 'partly_paid' | 'paid' | 'void';
  number: string; business: string | null; bill_to_name: string | null; property: string | null;
  issued_on: string | null; due_on: string | null;
  total_cents: number; paid_cents: number; balance_cents: number; lines: Line[];
};

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const WHY: Record<string, string> = {
  card_payments_not_set_up: 'Card payments are not set up for this business yet. Please contact them to pay another way.',
  nothing_due: 'This invoice has nothing left to pay.',
  invoice_void: 'This invoice was cancelled.',
};

export default function PayPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? '');
  const sessionId = useSearchParams()?.get('session_id') ?? '';

  const [inv, setInv] = useState<PayInvoice | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState('');
  const [justPaid, setJustPaid] = useState<'yes' | 'processing' | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/get_invoice_for_payment`, {
      method: 'POST', headers: API_HEADERS, body: JSON.stringify({ p_token: token }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) { setState('error'); return; }
    if (!data) { setState('missing'); return; }
    setInv(data as PayInvoice);
    setState('ready');
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        if (sessionId) {
          const r = await fetch(`${SUPA_URL}/functions/v1/payments`, {
            method: 'POST', headers: API_HEADERS,
            body: JSON.stringify({ action: 'confirm-invoice', token, session_id: sessionId }),
          });
          const c = await r.json().catch(() => null);
          setJustPaid(r.ok && c?.paid ? 'yes' : 'processing');
        }
        await load();
      } catch { setState('error'); }
    })();
  }, [token, sessionId, load]);

  const pay = async () => {
    setPaying(true); setNotice('');
    try {
      const r = await fetch(`${SUPA_URL}/functions/v1/payments`, {
        method: 'POST', headers: API_HEADERS, body: JSON.stringify({ action: 'invoice-checkout', token }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.url) { window.location.href = d.url; return; }
      setNotice(WHY[d?.error] ?? 'The payment could not be started. Please try again.');
    } catch { setNotice('The payment could not be started. Please try again.'); }
    setPaying(false);
  };

  const shell = (children: React.ReactNode) => (
    <main style={{ minHeight: '100vh', background: BG, color: '#EAF1FB', fontFamily: 'Inter, -apple-system, Segoe UI, sans-serif', padding: '40px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </main>
  );

  if (state === 'loading') return shell(<p style={{ color: MUTED }}>Loading your invoice…</p>);
  if (state === 'missing') return shell(<p style={{ color: MUTED }}>This invoice link is not valid. Please check the link in your email.</p>);
  if (state === 'error' || !inv) return shell(<p style={{ color: MUTED }}>The invoice could not be loaded. Please try again in a moment.</p>);

  if (inv.status === 'void') return shell(<>
    <h1 style={{ margin: 0, fontSize: 24 }}>{inv.number}</h1>
    <p style={{ color: MUTED }}>{WHY.invoice_void}</p>
  </>);

  const paid = inv.balance_cents <= 0;
  return shell(<>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {inv.business && <span style={{ fontSize: 14, color: MUTED }}>{inv.business}</span>}
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Invoice {inv.number}</h1>
      <span style={{ fontSize: 14, color: MUTED }}>
        {[inv.bill_to_name, inv.property].filter(Boolean).join(' · ')}
        {inv.issued_on ? ` · issued ${inv.issued_on}` : ''}
      </span>
    </div>

    {justPaid === 'yes' && <div role="status" style={{ border: `1px solid ${GREEN}`, borderRadius: 12, padding: '12px 14px', color: GREEN, fontWeight: 600 }}>Payment received — thank you.</div>}
    {justPaid === 'processing' && !paid && <div role="status" style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', color: MUTED }}>Your payment is being processed. This page will show it once your bank confirms it.</div>}

    <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      {inv.lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: 15 }}>
          <span>{l.description}{Number(l.quantity) !== 1 ? ` × ${Number(l.quantity)}` : ''}</span>
          <span style={{ fontWeight: 600 }}>{money(l.amount_cents)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', fontSize: 15, fontWeight: 700 }}><span>Total</span><span>{money(inv.total_cents)}</span></div>
      {inv.paid_cents > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 16px 12px', fontSize: 15, color: GREEN }}><span>Paid</span><span>−{money(inv.paid_cents)}</span></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', borderTop: `1px solid ${BORDER}`, fontSize: 18, fontWeight: 800 }}>
        <span>{paid ? 'Paid in full' : 'Balance due'}</span><span>{money(Math.max(inv.balance_cents, 0))}</span>
      </div>
    </section>

    {!paid && <>
      <button type="button" onClick={pay} disabled={paying}
        style={{ height: 52, borderRadius: 12, border: 0, background: ACCENT, color: '#fff', fontSize: 16, fontWeight: 700, cursor: paying ? 'default' : 'pointer', opacity: paying ? 0.6 : 1 }}>
        {paying ? 'Opening secure checkout…' : `Pay ${money(inv.balance_cents)} by card`}
      </button>
      <span style={{ fontSize: 13, color: MUTED }}>Card payments are processed by Stripe. Due on receipt.</span>
    </>}
    {notice && <p role="alert" style={{ color: '#F08A6E', margin: 0 }}>{notice}</p>}
  </>);
}
