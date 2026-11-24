'use client';

// Company › Payments — connect Stripe (owner 2026-11-05, office pages mockup, ruling 4: the OWNER only). The key is sent
// once through set_stripe_secret_key and never read back: this page shows only Connected, the last four characters and
// live/test (stripe_key_status). The server refuses anyone else once #115 is applied; before it, this page is still
// shown only to the owner.
// Website Apple pass (owner 2026-11-23, mockup CXThxTV8YKrVAaDGGa64to): one Stripe group (status, then the key), the help
// as a footnote, and the one commit — Save key — pinned at the bottom, greyed with its reason until a key is typed. No
// Disconnect row: no server call removes a key yet (the phone's Payment settings says the same, 970).
import { useCallback, useEffect, useState } from 'react';
import { CompanyTabs } from '@/components/workspace/CompanyTabs';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { ErrorBox, Group, Loading, Page, PageHeader, PinnedBar, Row } from '@/components/workspace/ui';
import { mayManagePayments } from '@/lib/office/access';
import { loadStripeStatus, saveStripeKey, type StripeStatus } from '@/lib/office/api';

const FIELD = 'h-10 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

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

  if (!owner) return <Page><PageHeader title="Payments" /><CompanyTabs /><ErrorBox message="Only the company owner connects payments." /></Page>;
  if (err && !status) return <Page><PageHeader title="Payments" /><CompanyTabs /><ErrorBox message={err} onRetry={load} /></Page>;
  if (!status) return <Page><PageHeader title="Payments" /><CompanyTabs /><Loading /></Page>;

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { setStatus(await saveStripeKey(key)); setMsg('Key saved.'); }
    catch (e) { setErr((e as Error).message); }
    finally { setKey(''); setBusy(false); }   // the key never stays in the page
  };

  return (
    <Page>
      <PageHeader title="Payments" subtitle={status.connected ? `Connected to Stripe${status.mode ? ` · ${status.mode} mode` : ''}` : 'Add your Stripe key to take payments online · owner only'} />
      <CompanyTabs />
      <div className="flex max-w-3xl flex-col gap-6">
        <Group heading="Stripe"
          footnote="Invoices get a “Pay online” link, and online bookings take payment at checkout. Payments made through Stripe are recorded on the invoice automatically. Card fees are Stripe’s. The key is stored on the server and never shown again, here or on the phone.">
          <Row label="Status" value={status.connected ? 'Connected' : 'Not connected'} valueTone={status.connected ? 'ok' : 'need'} />
          {status.connected && <Row label="Connected key" value={`…${status.last4 ?? '????'}${status.restricted ? ' · restricted' : ''}`} />}
          <label className="flex min-h-[44px] items-center gap-3 px-4 py-2">
            <span className="w-40 shrink-0 text-sm text-ink">{status.connected ? 'Replace key' : 'Secret key'}</span>
            <input id="pay-key" className={FIELD} type="password" autoComplete="off" placeholder="sk_live_… or rk_live_…" value={key} onChange={e => setKey(e.target.value)} />
          </label>
        </Group>
        <Group heading="How to find your key" footnote="Use a test key (sk_test_ / rk_test_) while you set up and test.">
          <Row label="1. Sign in at dashboard.stripe.com" />
          <Row label="2. Developers › API keys" />
          <Row label="3. Reveal the secret key (or make a restricted one) and paste it above" />
        </Group>
        {msg && <p role="status" className="px-3 text-sm font-semibold text-[#1f8a4c]">{msg}</p>}
        {err && <p role="alert" className="px-3 text-sm text-[#b42318]">{err}</p>}
      </div>
      <PinnedBar label="Save key" onClick={save} busy={busy} disabled={!key.trim()}
        reason={status.connected ? 'Your current key is kept. Paste a new key to replace it.' : 'Paste your Stripe key first.'} />
    </Page>
  );
}
