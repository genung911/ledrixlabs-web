'use client';

// Company › Plan & billing (b7; plan mockup 13QNuHGzRGv2t2GdyextR4 screens 3 and 5, "Approved"). Everyone in the company
// sees where the plan stands; only the OWNER adds a payment method, opens Stripe's portal or enters an invite code.
// Seats are counted by the server (#158: members who aren't Office). The price and the $79 → $119 step live in Stripe.
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CompanyTabs } from '@/components/workspace/CompanyTabs';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { ErrorBox, Group, Loading, Page, Row } from '@/components/workspace/ui';
import { loadBillingStatus, loadPlanState, openPortal, redeemInviteCode, startCheckout, type BillingStatus } from '@/lib/billing/api';
import { FULL_CENTS, INTRO_CENTS, cleanInviteCode, money, priceLine, shortPrice, statusPill, type PlanState } from '@/lib/billing/model';

const FIELD = 'h-10 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const PILL: Record<string, string> = { blue: 'bg-accent/10 text-accent-ink', ok: 'bg-[#17834B]/10 text-[#17834B]', warn: 'bg-[#D98C00]/15 text-[#A86A00]', bad: 'bg-[#C0392B]/10 text-[#C0392B]' };
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function PlanPage() {
  return <Suspense><PlanBody /></Suspense>;
}

function PlanBody() {
  const { access } = useWorkspace();
  const params = useSearchParams();
  const [plan, setPlan] = useState<PlanState | null | undefined>(undefined);
  const [bill, setBill] = useState<BillingStatus | null>(null);
  const [err, setErr] = useState<string | null>(params?.get('code_error') ?? null);   // a code that failed at sign-up
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(params?.get('paid') ? 'Thanks — your payment method is saved. It can take a moment to show here.' : null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const p = await loadPlanState(); setPlan(p);
      if (p?.is_owner && p.state !== 'comp') setBill(await loadBillingStatus().catch(() => null));
    } catch (e) { setErr((e as Error).message); setPlan(null); }
  }, []);
  useEffect(() => { if (access.companyId) void load(); }, [access.companyId, load]);

  const act = async (f: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await f(); } catch (e) { setErr((e as Error).message); setBusy(false); } };

  if (!access.companyId) return <Page><CompanyTabs /><ErrorBox message="Plans belong to a company. Create or join one first." /></Page>;
  if (plan === undefined) return <Page><CompanyTabs /><Loading /></Page>;
  if (!plan || plan.state === 'none') return <Page><CompanyTabs /><ErrorBox message={err ?? 'Plans aren’t available on the server yet.'} onRetry={load} /></Page>;

  const now = Date.now();
  const pill = statusPill(plan, now);
  const seats = bill?.seats ?? plan.seats ?? 1;
  const owner = !!plan.is_owner;
  const unit = plan.kind === 'standard' ? FULL_CENTS : INTRO_CENTS;
  const trialEnd = plan.trial_ends_at ? Date.parse(plan.trial_ends_at) : null;
  const subscribed = !!(bill?.subscribed ?? plan.subscribed);
  const mayCode = owner && plan.state === 'trial' && plan.kind === 'launch' && !subscribed;

  return (
    <Page>
      <CompanyTabs />
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight text-ink">Plan &amp; billing</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${PILL[pill.tone]}`}>{pill.label}</span>
        </div>

        <Group footnote={plan.state === 'comp' ? 'This company is Ledrix’s own: nothing to pay.' : `${priceLine(plan.kind)}. Every member who can do inspections is an inspector; Office staff are free. Adding or removing an inspector changes the next bill.`}>
          <Row label="Plan" value="Ledrix Inspect" />
          <Row label="Inspectors" value={String(seats)} />
          <Row label="Price per inspector" value={shortPrice(plan.kind)} />
          {plan.state === 'trial' && !subscribed && plan.kind !== 'comp' && <Row label="After your trial" value={`${money(unit * seats)} / month`} />}
          {bill?.next && <Row label="Next bill" value={`${money(bill.next.amount)} on ${fmtDay(bill.next.date * 1000)}`} />}
          {bill?.card && <Row label="Card" value={`${bill.card.brand[0].toUpperCase()}${bill.card.brand.slice(1)} ···· ${bill.card.last4}`} />}
          {bill?.cancelAtPeriodEnd && <Row label="Ends" value="At the end of this month (cancelled)" valueTone="need" />}
          <Row label="Office staff" value="Free" />
        </Group>

        {owner && plan.state !== 'comp' && (
          <div className="flex flex-col gap-2">
            {(!subscribed || plan.state === 'read_only') && (
              <button disabled={busy} onClick={() => act(startCheckout)} className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60">
                {plan.state === 'read_only' ? 'Restart my plan' : 'Add a payment method'}</button>)}
            {subscribed && (
              <button disabled={busy} onClick={() => act(openPortal)} className="rounded-xl border border-hairline bg-surface px-4 py-3 text-sm font-semibold text-accent-ink hover:bg-ink/5 disabled:opacity-60">
                {plan.state === 'grace' || plan.state === 'read_only' ? 'Update card' : 'Manage billing'}</button>)}
            {plan.state === 'trial' && !subscribed && trialEnd && <p className="px-1 text-sm text-muted">You won’t be charged until your trial ends on {fmtDay(trialEnd)}. Card details are entered on Stripe’s page, never on Ledrix.</p>}
          </div>
        )}
        {!owner && plan.state !== 'comp' && <p className="px-1 text-sm text-muted">Only the company owner manages billing.</p>}

        {mayCode && (
          <Group heading="Early-adopter invite code" footnote="A code from Ledrix makes your trial 60 days, then $79 per inspector for as long as you stay. Each code works once.">
            <form className="flex items-center gap-2 px-4 py-2" onSubmit={e => { e.preventDefault(); const c = cleanInviteCode(code); if (!c) { setErr('An invite code is 6–32 letters, numbers or dashes.'); return; } void act(async () => { setPlan(await redeemInviteCode(c)); setCode(''); setMsg('Invite code applied.'); setBusy(false); }); }}>
              <input aria-label="Invite code" className={FIELD} placeholder="Invite code" value={code} onChange={e => setCode(e.target.value)} />
              <button disabled={busy || !code.trim()} className="shrink-0 rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">Apply</button>
            </form>
          </Group>
        )}
        {bill?.problem && <p className="px-3 text-xs text-muted">Billing details couldn’t be read from Stripe: {bill.problem}</p>}
        {msg && <p role="status" className="px-3 text-sm font-semibold text-[#1f8a4c]">{msg}</p>}
        {err && <p role="alert" className="px-3 text-sm text-[#b42318]">{err}</p>}
      </div>
    </Page>
  );
}
