'use client';

// Company › Payments — connect Stripe (owner 2026-11-05, office pages mockup, ruling 4: the OWNER only). The key is sent
// once through set_stripe_secret_key and never read back: this page shows only Connected, the last four characters and
// live/test (stripe_key_status). The server refuses anyone else once #115 is applied; before it, this page is still
// shown only to the owner.
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, ErrorBox, Loading, Page, PageHeader } from '@/components/workspace/ui';
import { mayManagePayments } from '@/lib/office/access';
import { loadStripeStatus, saveStripeKey, type StripeStatus } from '@/lib/office/api';

const FIELD = 'h-10 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted';
const BTN = 'rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink/85 disabled:opacity-50';

export default function PaymentsPage() {
  const { access } = useWorkspace();
  const owner = mayManagePayments({ companyId: access.companyId, role: access.role });
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setStatus(await loadStripeStatus()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { if (owner) void load(); }, [owner, load]);

  if (!owner) return <Page><PageHeader title="Payments" /><ErrorBox message="Only the company owner connects payments." /></Page>;
  if (err && !status) return <Page><PageHeader title="Payments" /><ErrorBox message={err} onRetry={load} /></Page>;
  if (!status) return <Page><Loading /></Page>;

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { setStatus(await saveStripeKey(key)); setMsg('Key saved.'); }
    catch (e) { setErr((e as Error).message); }
    finally { setKey(''); setBusy(false); }   // the key never stays in the page
  };

  return (
    <Page>
      <PageHeader title="Payments" subtitle="Owner only" />
      <Card>
        {status.connected
          ? <p className="text-sm"><b className="text-[#1f8a4c]">● Connected to Stripe</b> <span className="text-muted">· key ending <span className="tabular-nums">…{status.last4 ?? '????'}</span>{status.mode ? ` · ${status.mode}` : ''}{status.restricted ? ' · restricted key' : ''}</span></p>
          : <p className="text-sm text-ink"><b>Not connected.</b> <span className="text-muted">Invoices can’t be paid online until you add your Stripe key.</span></p>}
      </Card>
      <Card title="What this does" className="mt-4">
        <p className="text-sm text-body">Invoices get a “Pay online” link, and online bookings take payment at checkout. Payments made through Stripe are recorded on the invoice automatically. Card fees are Stripe’s.</p>
      </Card>
      <Card title={status.connected ? 'Replace key' : 'Add your key'} className="mt-4">
        <div className="max-w-md space-y-3">
          <div><label className={LABEL} htmlFor="pay-key">Stripe secret key</label>
            <input id="pay-key" className={FIELD} type="password" autoComplete="off" placeholder="sk_live_…" value={key} onChange={e => setKey(e.target.value)} />
            <p className="mt-1 text-xs text-muted">Stored on the server. It is never shown again, here or on the phone.</p></div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-body"><li>Sign in at dashboard.stripe.com</li><li>Developers › API keys</li><li>Reveal the Secret key and paste it here</li></ol>
          <button className={BTN} disabled={busy || !key.trim()} onClick={save}>{busy ? 'Saving…' : 'Save key'}</button>
          {msg && <p role="status" className="text-sm font-semibold text-[#1f8a4c]">{msg}</p>}
          {err && <p role="alert" className="text-sm text-[#b42318]">{err}</p>}
        </div>
      </Card>
    </Page>
  );
}
