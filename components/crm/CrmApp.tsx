'use client';
// The CRM (owner 2026-11-05: "when clicked from menu, it should open a CRM page similar to Salesforce home page … Marketing,
// Leads, Campaigns, Contacts, Accounts … have a page saying in construction"; CRM home mockup approved, "use
// recommendations"). One component for every CRM route (/app/crm, /app/crm/contacts, …), each route naming its tab:
//   Home      what needs attention — jobs this month, invoiced this month, follow-ups due, booking requests; Needs you
//             (booking requests to confirm, overdue invoices); today and tomorrow; follow-ups due; top referrers (last
//             90 days); recently added. Plain counts — Ledrix does not score or rate people.
//   Contacts  agents, clients, homeowners and vendors (owner 2026-11-05: "we do need agents and possibly vendors") —
//             each one's jobs, invoices, follow-ups and notes; CSV import.
//   Accounts  grouped from each contact's brokerage / company field (no table of its own yet).
//   Schedule  week / month, booking requests, "+ Schedule a job".
//   Leads · Campaigns · Marketing  planned: each says what it will do (lib/crm/crmHome.ts PLANNED_TABS), never empty.
// Follow-ups and agents' referrals have no tab of their own: they are on the home and on each contact / account.
// Where a job came from (#114): offered only when the server answers crm_order_sources(); written through the same
// versioned CRM writes (lib/crm/api.ts), shaped by lib/crm/crmHome.ts sourceFields — the phone's own function.
// Every change goes through lib/crm/api.ts at the version the page loaded; a newer save elsewhere reloads and says so.
// Money is the invoice's only — a job with no invoice says "No invoice".
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader, formatDate } from '@/components/workspace/ui';
import { loadMyCapabilities } from '@/lib/team/permissions';
import {
  CONTACT_TYPE_LABEL, detectISNCSV, parseCSVHeaders, parseGenericCSV, parseISNCSV,
  type ContactType, type ImportRow,
} from '@/lib/crm/contactsCore';
import {
  FOLLOWUP_LABEL, FOLLOWUP_TYPES, addDays, byDay, dollars, invoicedCents, monthGrid, payOf, payWords, referrals, todayYmd, weekStart,
  type FollowupType, type InvoiceFacts,
} from '@/lib/crm/model';
import {
  NO_SOURCE, ORDER_SOURCE_LABEL, PICKABLE_SOURCES, PLANNED_TABS, SOURCE_DETAIL_MAX, accountsOf, followupsDue, homeKpis,
  overdueInvoices, recentlyAdded, sourceFields, sourceWords, todayTomorrow, topReferrers,
  type OrderSource, type PlannedTab, type SourceChoice,
} from '@/lib/crm/crmHome';
import {
  CRMError, addContact, addFollowup, changeJob, confirmBooking, declineBooking, importContacts, loadContactTypes, loadContacts,
  loadFollowups, loadHomeInvoices, loadInvoicesFor, loadOrderNotes, loadOrderSources, loadOrders, loadPendingBookings, removeContact,
  saveContact, scheduleJob, setFollowupDone,
  type Booking, type Contact, type ContactInput, type Followup, type HomeInvoiceRow, type Order, type OrderNote, type OrderStatus, type SourcePatch,
} from '@/lib/crm/api';

const BTN = 'rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink/85 disabled:opacity-50';
const BTN_QUIET = 'rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50';
const FIELD = 'h-10 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted';
const TYPE_PILL: Record<ContactType, string> = {
  agent: 'bg-accent/10 text-accent-ink', client: 'bg-emerald-50 text-emerald-800', homeowner: 'bg-amber-50 text-amber-900', vendor: 'bg-violet-50 text-violet-800',
};
const STATUS_LABEL: Record<OrderStatus, string> = { scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_PILL: Record<OrderStatus, string> = {
  scheduled: 'bg-accent/10 text-accent-ink', in_progress: 'bg-amber-50 text-amber-900', completed: 'bg-emerald-50 text-emerald-800', cancelled: 'bg-ground text-muted line-through',
};
const PAY_PILL: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-800', part_paid: 'bg-amber-50 text-amber-900', unpaid: 'bg-red-50 text-red-800', draft: 'bg-ground text-body', no_invoice: 'bg-ground text-muted',
};
const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
export type CrmTab = 'home' | 'contacts' | 'accounts' | 'schedule' | PlannedTab;
const TABS: { tab: CrmTab; label: string; href: string; planned?: boolean }[] = [
  { tab: 'home', label: 'Home', href: '/app/crm' },
  { tab: 'contacts', label: 'Contacts', href: '/app/crm/contacts' },
  { tab: 'accounts', label: 'Accounts', href: '/app/crm/accounts' },
  { tab: 'schedule', label: 'Schedule', href: '/app/crm/schedule' },
  { tab: 'leads', label: 'Leads', href: '/app/crm/leads', planned: true },
  { tab: 'campaigns', label: 'Campaigns', href: '/app/crm/campaigns', planned: true },
  { tab: 'marketing', label: 'Marketing', href: '/app/crm/marketing', planned: true },
];
const isPlanned = (t: CrmTab): t is PlannedTab => t === 'leads' || t === 'campaigns' || t === 'marketing';

type Data = {
  contacts: Contact[]; orders: Order[]; followups: Followup[]; bookings: Booking[];
  invoices: InvoiceFacts[] | null; types: ContactType[];
  /** The sources the server takes for a job (#114), or null — then "Came from" is hidden and nothing is sent. */
  sources: OrderSource[] | null;
  /** The company's invoices for the home (this month, overdue), or null without the Invoices permission. */
  homeInvoices: HomeInvoiceRow[] | null;
};
type State = { kind: 'loading' } | { kind: 'denied' } | { kind: 'error'; message: string } | ({ kind: 'ready' } & Data);

export function CrmApp({ tab }: { tab: CrmTab }) {
  const { access } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // The page follows the server's `crm` permission, as the menu item does (an account with no company is its own CRM).
      const caps = access.companyId ? await loadMyCapabilities() : null;
      if (access.companyId && caps?.crm !== true) { setState({ kind: 'denied' }); return; }
      const [contacts, followups, bookings, types, sources] = await Promise.all([
        loadContacts(), loadFollowups(), loadPendingBookings(), loadContactTypes(), loadOrderSources(),
      ]);
      const orders = await loadOrders(sources != null);
      const [invoices, homeInvoices] = await Promise.all([loadInvoicesFor(orders.map(o => o.id)), loadHomeInvoices()]);
      setState({ kind: 'ready', contacts, orders, followups, bookings, invoices, types, sources, homeInvoices });
    } catch (e) { setState({ kind: 'error', message: msg(e) }); }
  }, [access.companyId]);
  useEffect(() => { load(); }, [load]);

  /** One change; reload on success; on a conflict reload and say so. */
  const act = useCallback(async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setNotice(null);
    try { await fn(); await load(); if (done) setNotice({ ok: true, text: done }); return true; }
    catch (e) { if (e instanceof CRMError && e.conflict) await load(); setNotice({ ok: false, text: msg(e) }); return false; }
    finally { setBusy(false); }
  }, [load]);

  const bar = <CrmTabBar tab={tab} />;
  if (state.kind === 'loading') return <Page><PageHeader title="CRM" />{bar}<Loading /></Page>;
  if (state.kind === 'denied') return (
    <Page><PageHeader title="CRM" />
      <Card><Empty>The CRM needs the “CRM — clients, agents, bookings” permission. Ask your company owner to turn it on for you on the Team page.</Empty></Card>
    </Page>
  );
  if (state.kind === 'error') return <Page><PageHeader title="CRM" />{bar}<ErrorBox message={state.message} onRetry={load} /></Page>;

  return (
    <Page>
      <PageHeader title="CRM" subtitle="Agents, clients, homeowners and vendors — the same records as the phone’s CRM." />
      {bar}
      {notice && <p role="status" className={`mb-4 rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{notice.text}</p>}
      {tab === 'home' && <HomeTab data={state} act={act} busy={busy} />}
      {tab === 'contacts' && <ContactsTab data={state} act={act} busy={busy} />}
      {tab === 'accounts' && <AccountsTab data={state} />}
      {tab === 'schedule' && <ScheduleTab data={state} act={act} busy={busy} />}
      {isPlanned(tab) && <PlannedPage tab={tab} />}
    </Page>
  );
}

/** The CRM's own tabs, across the top. Planned ones are marked and open their explanation page. */
function CrmTabBar({ tab }: { tab: CrmTab }) {
  return (
    <nav aria-label="CRM" className="mb-5 flex flex-wrap gap-1 border-b border-hairline">
      {TABS.map(t => (
        <Link key={t.tab} href={t.href} aria-current={tab === t.tab ? 'page' : undefined}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === t.tab ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
          {t.label}{t.planned && <span className="rounded-full bg-ground px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">Planned</span>}
        </Link>
      ))}
    </nav>
  );
}

type Act = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

// ─── Contacts ────────────────────────────────────────────────────────────────────────────────────────────────────────
function ContactsTab({ data, act, busy }: { data: Data; act: Act; busy: boolean }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | ContactType>('all');
  const [selId, setSelId] = useState<string | null>(data.contacts[0]?.id ?? null);
  const [mode, setMode] = useState<'view' | 'new' | 'import'>('view');
  // Vendors appear as a filter once the server takes them, or when some already exist.
  const shownTypes = useMemo(() => {
    const t = new Set<ContactType>(data.types);
    for (const c of data.contacts) t.add(c.type);
    return (['agent', 'client', 'homeowner', 'vendor'] as ContactType[]).filter(x => t.has(x));
  }, [data]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.contacts.filter(c => (type === 'all' || c.type === type)
      && (!s || [c.name, c.email, c.brokerage, c.phone].some(v => (v ?? '').toLowerCase().includes(s))));
  }, [data.contacts, q, type]);
  const jobsOf = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of data.orders) if (o.contact_id) m.set(o.contact_id, [...(m.get(o.contact_id) ?? []), o]);
    return m;
  }, [data.orders]);
  const sel = data.contacts.find(c => c.id === selId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="self-start overflow-hidden">
        <div className="space-y-2 border-b border-hairline bg-ground p-3">
          <input aria-label="Search contacts" className={FIELD} placeholder="Search name, brokerage, email, phone" value={q} onChange={e => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {(['all', ...shownTypes] as ('all' | ContactType)[]).map(t => (
              <button key={t} aria-pressed={type === t} onClick={() => setType(t)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${type === t ? 'border-accent bg-accent/10 text-accent-ink' : 'border-hairline bg-surface text-body'}`}>
                {t === 'all' ? 'All' : CONTACT_TYPE_LABEL[t].many}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className={BTN + ' flex-1 px-3 py-1.5 text-xs'} onClick={() => setMode('new')}>+ New contact</button>
            <button className={BTN_QUIET + ' flex-1 px-3 py-1.5 text-xs'} onClick={() => setMode('import')}>Import CSV</button>
          </div>
        </div>
        <ul className="max-h-[70vh] divide-y divide-hairline overflow-y-auto">
          {list.map(c => (
            <li key={c.id}>
              <button onClick={() => { setSelId(c.id); setMode('view'); }} aria-pressed={c.id === selId && mode === 'view'}
                className={`grid w-full grid-cols-[1fr_auto] gap-x-2 px-3 py-2.5 text-left ${c.id === selId && mode === 'view' ? 'bg-accent/10' : 'hover:bg-ground'}`}>
                <span className="truncate text-sm font-semibold text-ink">{c.name}</span>
                <span className={`self-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_PILL[c.type]}`}>{CONTACT_TYPE_LABEL[c.type].one}</span>
                <span className="col-span-2 truncate text-xs text-muted">{c.brokerage || c.email || c.phone || '—'} · {(jobsOf.get(c.id) ?? []).length} jobs</span>
              </button>
            </li>
          ))}
          {!list.length && <li><Empty>No contacts match.</Empty></li>}
        </ul>
      </Card>
      <div className="min-w-0">
        {mode === 'new' && <ContactForm types={data.types} busy={busy} onCancel={() => setMode('view')}
          onSave={async v => { const ok = await act(() => addContact(v), `${v.name} added.`); if (ok) setMode('view'); }} />}
        {mode === 'import' && <ImportPanel types={data.types} act={act} busy={busy} onDone={() => setMode('view')} />}
        {mode === 'view' && (sel ? <ContactDetail key={sel.id} c={sel} data={data} jobs={jobsOf.get(sel.id) ?? []} act={act} busy={busy} />
          : <Card><Empty>Pick a contact, or add your first one.</Empty></Card>)}
      </div>
    </div>
  );
}

function ContactForm({ initial, types, busy, onSave, onCancel, onRemove }: {
  initial?: Contact; types: ContactType[]; busy: boolean; onSave: (v: ContactInput) => void; onCancel: () => void; onRemove?: () => void;
}) {
  const [v, setV] = useState<ContactInput>({
    type: initial?.type ?? 'agent', name: initial?.name ?? '', email: initial?.email ?? '', phone: initial?.phone ?? '',
    brokerage: initial?.brokerage ?? '', notes: initial?.notes ?? '',
  });
  // The contact's own type stays selectable even when this server would not take it for a new one.
  const choices = initial && !types.includes(initial.type) ? [...types, initial.type] : types;
  const set = (k: keyof ContactInput) => (e: { target: { value: string } }) => setV(cur => ({ ...cur, [k]: e.target.value }));
  return (
    <Card title={initial ? 'Edit contact' : 'New contact'}>
      <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); onSave(v); }}>
        <div className="sm:col-span-2">
          <span className={LABEL}>Type</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Contact type">
            {choices.map(t => (
              <button type="button" key={t} aria-pressed={v.type === t} onClick={() => setV(cur => ({ ...cur, type: t }))}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${v.type === t ? 'border-accent bg-accent/10 text-accent-ink' : 'border-hairline text-body'}`}>{CONTACT_TYPE_LABEL[t].one}</button>
            ))}
          </div>
        </div>
        <label className="sm:col-span-2"><span className={LABEL}>Name *</span><input id="ct-name" className={FIELD} value={v.name} onChange={set('name')} required maxLength={200} /></label>
        <label><span className={LABEL}>Email</span><input id="ct-email" type="email" className={FIELD} value={v.email} onChange={set('email')} /></label>
        <label><span className={LABEL}>Phone</span><input id="ct-phone" className={FIELD} value={v.phone} onChange={set('phone')} /></label>
        {(v.type === 'agent' || v.type === 'vendor') && (
          <label className="sm:col-span-2"><span className={LABEL}>{v.type === 'agent' ? 'Brokerage' : 'Company'}</span><input id="ct-company" className={FIELD} value={v.brokerage} onChange={set('brokerage')} /></label>
        )}
        <label className="sm:col-span-2"><span className={LABEL}>Notes</span><textarea id="ct-notes" className={FIELD + ' h-24 py-2'} value={v.notes} onChange={set('notes')} /></label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" className={BTN} disabled={busy || !v.name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className={BTN_QUIET} onClick={onCancel}>Cancel</button>
          <span className="flex-1" />
          {onRemove && <button type="button" className="text-sm font-semibold text-red-700 hover:underline" onClick={onRemove}>Remove contact</button>}
        </div>
      </form>
    </Card>
  );
}

function ContactDetail({ c, data, jobs, act, busy }: { c: Contact; data: Data; jobs: Order[]; act: Act; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [notes, setNotes] = useState<Record<string, OrderNote[]>>({});
  const [openNotes, setOpenNotes] = useState<string | null>(null);
  const [fus, setFus] = useState<Followup[] | null>(null);
  const today = todayYmd();
  const reloadFus = useCallback(() => { loadFollowups(c.id).then(setFus).catch(() => setFus([])); }, [c.id]);
  useEffect(() => { reloadFus(); }, [reloadFus, data]);
  useEffect(() => {
    const ids = jobs.map(j => j.inspection_id).filter((x): x is string => !!x);
    loadOrderNotes(ids).then(setNotes).catch(() => setNotes({}));
  }, [jobs]);
  const invOf = (o: Order) => (data.invoices ?? []).filter(i => i.order_id === o.id);
  const ref = referrals(jobs, today);
  const invoiced = data.invoices ? invoicedCents(data.invoices.filter(i => jobs.some(j => j.id === i.order_id))) : null;
  const isAgent = c.type === 'agent';

  if (editing) return <ContactForm initial={c} types={data.types} busy={busy} onCancel={() => setEditing(false)}
    onSave={async v => { if (await act(() => saveContact(c, v), 'Saved.')) setEditing(false); }}
    onRemove={() => setConfirmRemove(true)} />;

  return (
    <div className="space-y-4">
      {confirmRemove && (
        <div role="alertdialog" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <span className="flex-1">Remove {c.name}? Their jobs stay; the jobs just lose the contact.</span>
          <button className={BTN} onClick={() => act(() => removeContact(c), `${c.name} removed.`)}>Remove</button>
          <button className={BTN_QUIET} onClick={() => setConfirmRemove(false)}>Keep</button>
        </div>
      )}
      <Card>
        <div className="flex flex-wrap items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-ink">{c.name}</h2>
            <p className="text-sm text-muted">{c.brokerage ? `${c.brokerage} · ` : ''}Contact since {formatDate(c.created_at, { month: 'short', year: 'numeric' })}{c.source === 'import' ? ' · imported' : ''}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${TYPE_PILL[c.type]}`}>{CONTACT_TYPE_LABEL[c.type].one}</span>
          <button className={BTN_QUIET + ' px-3 py-1.5'} onClick={() => setEditing(true)}>Edit</button>
        </div>
        <dl className="grid gap-x-6 gap-y-2 border-t border-hairline px-4 py-3 text-sm sm:grid-cols-3">
          <div><dt className={LABEL}>Email</dt><dd className="break-words text-ink">{c.email ? <a className="text-accent-ink hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd></div>
          <div><dt className={LABEL}>Phone</dt><dd className="text-ink tabular-nums">{c.phone || '—'}</dd></div>
          {c.tags?.length ? <div><dt className={LABEL}>Tags</dt><dd className="text-ink">{c.tags.join(', ')}</dd></div> : null}
        </dl>
        <div className="grid grid-cols-2 gap-2 border-t border-hairline p-3 sm:grid-cols-4">
          <Stat label={isAgent ? 'Referrals' : 'Jobs'} value={String(ref.total)} />
          <Stat label="Last 30 days · prior 30" value={`${ref.last30} · ${ref.prior30}`} />
          <Stat label="Invoiced" value={invoiced == null ? '—' : dollars(invoiced)} hint={invoiced == null ? 'Needs Invoices permission' : undefined} />
          <Stat label={ref.next ? 'Next job' : 'Last job'} value={formatDate(ref.next ?? ref.last)} />
        </div>
      </Card>

      <Card title="Jobs" count={jobs.length}>
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <p className="text-xs text-muted">Money comes from invoices only.{data.invoices == null ? ' Your account can’t read invoices.' : ''}</p>
          <button className={BTN_QUIET + ' px-3 py-1.5 text-xs'} onClick={() => setScheduling(s => !s)}>{scheduling ? 'Close' : '+ Schedule a job'}</button>
        </div>
        {scheduling && <ScheduleForm contacts={data.contacts} fixedContact={c.id} sources={data.sources} busy={busy}
          onSave={async j => { if (await act(() => scheduleJob(j), 'Job scheduled.')) setScheduling(false); }} />}
        {jobs.length ? (
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-2 py-2">Date</th><th className="px-2">Address</th><th className="px-2">Status</th><th className="px-2">Invoice</th>{data.sources && <th className="px-2">Came from</th>}<th className="px-2">Notes</th></tr></thead>
              <tbody className="divide-y divide-hairline">
                {jobs.map(o => {
                  const pay = payOf(invOf(o));
                  const jobNotes = o.inspection_id ? notes[o.inspection_id] ?? [] : [];
                  return (
                    <JobRow key={o.id} o={o} payText={data.invoices == null ? '—' : payWords(pay)} payState={pay.state}
                      notes={jobNotes} open={openNotes === o.id} onToggle={() => setOpenNotes(cur => (cur === o.id ? null : o.id))}
                      onStatus={(s) => act(() => changeJob(o, { status: s }), 'Job updated.')} busy={busy}
                      sources={data.sources} contacts={data.contacts} contactType={c.type}
                      onSource={(patch) => act(() => changeJob(o, patch), 'Saved where the job came from.')} />
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty>No jobs yet.</Empty>}
      </Card>

      <FollowupCard contact={c} jobs={jobs} followups={fus} act={async (fn, done) => { const ok = await act(fn, done); reloadFus(); return ok; }} busy={busy} />

      <Card title="Notes">
        <div className="px-4 py-3 text-sm">
          {c.notes ? <p className="whitespace-pre-wrap text-body">{c.notes}</p> : <p className="text-muted">No notes yet. Use Edit to add some.</p>}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-ground px-3 py-2">
      <p className="text-lg font-bold tabular-nums text-ink">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

function JobRow({ o, payText, payState, notes, open, onToggle, onStatus, busy, sources, contacts, contactType, onSource }: {
  o: Order; payText: string; payState: string; notes: OrderNote[]; open: boolean; onToggle: () => void; onStatus: (s: OrderStatus) => void; busy: boolean;
  sources: OrderSource[] | null; contacts: Contact[]; contactType: ContactType; onSource: (patch: SourcePatch) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [came, setCame] = useState<SourceChoice>({ source: (o.source as OrderSource) ?? null, referrerId: o.source_contact_id ?? null, detail: o.source_detail ?? '' });
  const nameOf = (id: string) => contacts.find(x => x.id === id)?.name;
  const agentId = contactType === 'agent' ? o.contact_id : null;
  const patch = sources ? sourceFields(came, sources, agentId) : {};
  const cols = sources ? 6 : 5;
  return (
    <>
      <tr>
        <td className="px-2 py-2 tabular-nums">{formatDate(o.order_date, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
        <td className="px-2">{o.inspection_id ? <Link className="text-accent-ink hover:underline" href={`/app/inspections/${encodeURIComponent(o.inspection_id)}`}>{o.address}</Link> : o.address}</td>
        <td className="px-2">
          <select aria-label={`Status of ${o.address}`} disabled={busy} value={o.status} onChange={e => onStatus(e.target.value as OrderStatus)}
            className={`rounded-full border-0 px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[o.status]}`}>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </td>
        <td className="px-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAY_PILL[payState]}`}>{payText}</span></td>
        {sources && (
          <td className="px-2 text-xs">
            <span className="text-body">{sourceWords(o, nameOf) || <span className="text-muted">Not recorded</span>}</span>{' '}
            <button className="font-semibold text-accent-ink hover:underline" onClick={() => setEditing(e => !e)}>{editing ? 'Close' : 'Edit'}</button>
          </td>
        )}
        <td className="px-2">{notes.length ? <button className="text-xs font-semibold text-accent-ink hover:underline" onClick={onToggle}>{open ? 'Hide' : `${notes.length} note${notes.length === 1 ? '' : 's'}`}</button> : <span className="text-xs text-muted">—</span>}</td>
      </tr>
      {editing && sources && (
        <tr><td colSpan={cols} className="bg-ground px-4 py-3">
          <SourcePicker idPrefix={`job-${o.id}`} value={came} onChange={setCame} contacts={contacts} sources={sources} agentId={agentId} />
          <div className="mt-2 flex gap-2">
            <button className={BTN + ' px-3 py-1.5 text-xs'} disabled={busy || !Object.keys(patch).length}
              onClick={async () => { if (await onSource(patch)) setEditing(false); }}>Save</button>
            <button className={BTN_QUIET + ' px-3 py-1.5 text-xs'} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </td></tr>
      )}
      {open && (
        <tr><td colSpan={cols} className="bg-ground px-4 py-2">
          <ul className="space-y-1.5 text-sm">
            {notes.map(nt => <li key={nt.id} className="border-l-2 border-hairline pl-2"><span className="text-xs text-muted">{formatDate(nt.at, { month: 'short', day: 'numeric' })}{nt.author ? ` · ${nt.author}` : ''}</span><br />{nt.text}</li>)}
          </ul>
          <p className="mt-1 text-[11px] text-muted">The job’s order notes — written on the job.</p>
        </td></tr>
      )}
    </>
  );
}

function FollowupCard({ contact, jobs, followups, act, busy }: { contact: Contact; jobs: Order[]; followups: Followup[] | null; act: Act; busy: boolean }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<{ type: FollowupType; due: string; note: string; orderId: string }>({ type: 'thank_you', due: addDays(todayYmd(), 3), note: '', orderId: '' });
  const today = todayYmd();
  return (
    <Card title="Follow-ups" count={followups?.filter(x => !x.completed).length}>
      <div className="flex justify-end px-4 pt-3"><button className={BTN_QUIET + ' px-3 py-1.5 text-xs'} onClick={() => setAdding(a => !a)}>{adding ? 'Close' : '+ Add'}</button></div>
      {adding && (
        <form className="grid gap-2 px-4 py-3 sm:grid-cols-4" onSubmit={async e => {
          e.preventDefault();
          if (await act(() => addFollowup({ contactId: contact.id, orderId: f.orderId || null, due: f.due, type: f.type, note: f.note }), 'Follow-up added.')) setAdding(false);
        }}>
          <label><span className={LABEL}>Kind</span><select id="fu-type" className={FIELD} value={f.type} onChange={e => setF(x => ({ ...x, type: e.target.value as FollowupType }))}>
            {FOLLOWUP_TYPES.map(t => <option key={t} value={t}>{FOLLOWUP_LABEL[t]}</option>)}</select></label>
          <label><span className={LABEL}>Due</span><input id="fu-due" type="date" className={FIELD} value={f.due} onChange={e => setF(x => ({ ...x, due: e.target.value }))} /></label>
          <label><span className={LABEL}>Job</span><select id="fu-job" className={FIELD} value={f.orderId} onChange={e => setF(x => ({ ...x, orderId: e.target.value }))}>
            <option value="">None</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.address}</option>)}</select></label>
          <label><span className={LABEL}>Note</span><input id="fu-note" className={FIELD} value={f.note} onChange={e => setF(x => ({ ...x, note: e.target.value }))} /></label>
          <div className="sm:col-span-4"><button className={BTN} disabled={busy}>Add follow-up</button></div>
        </form>
      )}
      {followups == null ? <Loading /> : followups.length ? (
        <ul className="divide-y divide-hairline px-4 pb-2">
          {followups.map(x => <FollowupLine key={x.id} f={x} today={today} busy={busy} onToggle={d => act(() => setFollowupDone(x, d))} />)}
        </ul>
      ) : <Empty>None. Add a thank-you or a check-in.</Empty>}
    </Card>
  );
}

function FollowupLine({ f, today, busy, onToggle, who }: { f: Followup; today: string; busy: boolean; onToggle: (done: boolean) => void; who?: string | null }) {
  const late = !f.completed && f.due_date < today;
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <input id={`fu-${f.id}`} type="checkbox" className="h-4 w-4 accent-[var(--accent,#217BE8)]" checked={f.completed} disabled={busy} onChange={e => onToggle(e.target.checked)} />
      <label htmlFor={`fu-${f.id}`} className={`min-w-0 flex-1 ${f.completed ? 'text-muted line-through' : 'text-ink'}`}>
        {FOLLOWUP_LABEL[f.type] ?? f.type}{f.note ? `: ${f.note}` : ''}{who ? <span className="text-muted"> · {who}</span> : null}
      </label>
      <span className={`tabular-nums ${late ? 'font-semibold text-red-700' : 'text-muted'}`}>{late ? 'Overdue · ' : ''}{formatDate(f.due_date)}</span>
    </li>
  );
}

// ─── Schedule ────────────────────────────────────────────────────────────────────────────────────────────────────────
function ScheduleForm({ contacts, fixedContact, sources, busy, onSave }: {
  contacts: Contact[]; fixedContact?: string; sources: OrderSource[] | null; busy: boolean;
  onSave: (j: { contactId: string | null; address: string; date: string; notes?: string; source?: SourcePatch }) => void;
}) {
  const [j, setJ] = useState({ contactId: fixedContact ?? '', address: '', date: todayYmd(), notes: '' });
  const [came, setCame] = useState<SourceChoice>(NO_SOURCE);
  // A job booked for an agent came from that agent unless something else is picked (crmHome sourceFields).
  const agentId = contacts.find(c => c.id === j.contactId)?.type === 'agent' ? j.contactId : null;
  return (
    <form className="grid gap-2 border-b border-hairline px-4 py-3 sm:grid-cols-4"
      onSubmit={e => { e.preventDefault(); onSave({ ...j, contactId: j.contactId || null, source: sourceFields(came, sources, agentId) }); }}>
      <label className="sm:col-span-2"><span className={LABEL}>Property address *</span><input id="sj-address" className={FIELD} value={j.address} onChange={e => setJ(x => ({ ...x, address: e.target.value }))} required /></label>
      <label><span className={LABEL}>Date *</span><input id="sj-date" type="date" className={FIELD} value={j.date} onChange={e => setJ(x => ({ ...x, date: e.target.value }))} required /></label>
      {!fixedContact && (
        <label><span className={LABEL}>Contact</span><select id="sj-contact" className={FIELD} value={j.contactId} onChange={e => setJ(x => ({ ...x, contactId: e.target.value }))}>
          <option value="">None</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({CONTACT_TYPE_LABEL[c.type].one})</option>)}</select></label>
      )}
      <label className="sm:col-span-4"><span className={LABEL}>Notes</span><input id="sj-notes" className={FIELD} value={j.notes} onChange={e => setJ(x => ({ ...x, notes: e.target.value }))} /></label>
      {sources && <div className="sm:col-span-4"><SourcePicker idPrefix="sj" value={came} onChange={setCame} contacts={contacts} sources={sources} agentId={agentId} /></div>}
      <div className="sm:col-span-4 flex items-center gap-3">
        <button className={BTN} disabled={busy || !j.address.trim()}>Schedule job</button>
        <span className="text-xs text-muted">Creates the job on the schedule. Start the inspection from it on the phone.</span>
      </div>
    </form>
  );
}

/** "Came from" (#114): the source chips, who sent it (agents first), a short detail. Shown only when the server takes a
 *  source; the value becomes order fields through crmHome.sourceFields — the same function the phone uses. */
export function SourcePicker({ idPrefix, value, onChange, contacts, sources, agentId }: {
  idPrefix: string; value: SourceChoice; onChange: (v: SourceChoice) => void; contacts: readonly Contact[];
  sources: readonly OrderSource[]; agentId?: string | null;
}) {
  const pickable = PICKABLE_SOURCES.filter(x => sources.includes(x));
  const people = useMemo(() => [...contacts].sort((a, b) => (a.type === 'agent' ? 0 : 1) - (b.type === 'agent' ? 0 : 1) || a.name.localeCompare(b.name)), [contacts]);
  const askWho = value.source === 'agent' || value.source === 'referral' || value.source === 'repeat_client';
  const implied = !value.source && agentId ? contacts.find(c => c.id === agentId)?.name : null;
  return (
    <div className="space-y-2">
      <span className={LABEL}>Came from</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Came from">
        {pickable.map(x => (
          <button type="button" key={x} aria-pressed={value.source === x}
            onClick={() => onChange({ ...value, source: value.source === x ? null : x, referrerId: value.source === x ? null : value.referrerId })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${value.source === x ? 'border-accent bg-accent/10 text-accent-ink' : 'border-hairline text-body'}`}>{ORDER_SOURCE_LABEL[x]}</button>
        ))}
      </div>
      {implied && <p className="text-xs text-muted">Not picked: saved as “Agent · {implied}”.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {askWho && (
          <label><span className={LABEL}>Who sent it</span>
            <select id={`${idPrefix}-referrer`} className={FIELD} value={value.referrerId ?? ''} onChange={e => onChange({ ...value, referrerId: e.target.value || null })}>
              <option value="">{value.source === 'agent' && agentId ? 'The job’s agent' : 'Not recorded'}</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name} ({CONTACT_TYPE_LABEL[p.type].one})</option>)}
            </select></label>
        )}
        {value.source && (
          <label><span className={LABEL}>Detail</span>
            <input id={`${idPrefix}-source-detail`} className={FIELD} maxLength={SOURCE_DETAIL_MAX} placeholder="e.g. Google, Facebook group" value={value.detail}
              onChange={e => onChange({ ...value, detail: e.target.value })} /></label>
        )}
      </div>
    </div>
  );
}

function ScheduleTab({ data, act, busy }: { data: Data; act: Act; busy: boolean }) {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(todayYmd());
  const [adding, setAdding] = useState(false);
  const contactName = useMemo(() => new Map(data.contacts.map(c => [c.id, c.name])), [data.contacts]);
  const start = weekStart(anchor);
  const live = data.orders.filter(o => o.status !== 'cancelled');
  const days = byDay(live, start);
  const grid = monthGrid(data.orders, anchor);
  const title = view === 'week' ? `${formatDate(start)} – ${formatDate(addDays(start, 6))}` : formatDate(anchor, { month: 'long', year: 'numeric' });
  const step = (dir: number) => setAnchor(a => (view === 'week' ? addDays(a, 7 * dir) : (() => { const [y, m] = a.split('-').map(Number); const d = new Date(y, m - 1 + dir, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })()));
  return (
    <div className="space-y-4">
      {!!data.bookings.length && (
        <Card title="Booking requests" count={data.bookings.length}>
          <ul className="divide-y divide-hairline">
            {data.bookings.map(b => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{b.client_name} · {b.address || 'No address yet'}</p>
                  <p className="text-xs text-muted">{b.preferred_date ? `Wants ${formatDate(b.preferred_date)}${b.preferred_time ? `, ${b.preferred_time}` : ''}` : 'No date asked'}{b.client_email ? ` · ${b.client_email}` : ''}{b.payment_status === 'paid' ? ' · paid online' : ''}</p>
                  {b.notes && <p className="text-xs text-body">{b.notes}</p>}
                </div>
                <button className={BTN + ' px-3 py-1.5 text-xs'} disabled={busy} onClick={() => act(() => confirmBooking(b), 'Booking confirmed — it is on the schedule.')}>Confirm</button>
                <button className={BTN_QUIET + ' px-3 py-1.5 text-xs'} disabled={busy} onClick={() => act(() => declineBooking(b), 'Booking declined.')}>Decline</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
          {(['week', 'month'] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${view === v ? 'border-accent bg-accent/10 text-accent-ink' : 'border-hairline text-body'}`}>{v === 'week' ? 'Week' : 'Month'}</button>)}
          <button className={BTN_QUIET + ' px-2.5 py-1 text-xs'} onClick={() => step(-1)} aria-label="Previous">‹</button>
          <span className="text-sm font-semibold text-ink">{title}</span>
          <button className={BTN_QUIET + ' px-2.5 py-1 text-xs'} onClick={() => step(1)} aria-label="Next">›</button>
          <button className="text-xs font-semibold text-accent-ink hover:underline" onClick={() => setAnchor(todayYmd())}>Today</button>
          <span className="flex-1" />
          <button className={BTN + ' px-3 py-1.5 text-xs'} onClick={() => setAdding(a => !a)}>{adding ? 'Close' : '+ Schedule a job'}</button>
        </div>
        {adding && <ScheduleForm contacts={data.contacts} sources={data.sources} busy={busy} onSave={async j => { if (await act(() => scheduleJob(j), 'Job scheduled.')) setAdding(false); }} />}
        {view === 'week' ? (days.length ? (
          <div className="space-y-4 p-4">
            {days.map(d => (
              <div key={d.day}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{formatDate(d.day, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                <ul className="space-y-1.5">
                  {d.items.map(o => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1"><span className="font-semibold text-ink">{o.inspection_id ? <Link className="hover:underline" href={`/app/inspections/${encodeURIComponent(o.inspection_id)}`}>{o.address}</Link> : o.address}</span>
                        {o.contact_id && <span className="text-muted"> · {contactName.get(o.contact_id) ?? 'Contact'}</span>}
                        {data.sources && sourceWords(o, id => contactName.get(id)) && <span className="text-muted"> · from {sourceWords(o, id => contactName.get(id))}</span>}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : <Empty>Nothing scheduled this week.</Empty>) : (
          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[520px] table-fixed text-sm">
              <thead><tr className="text-[11px] uppercase text-muted">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <th key={d} className="py-1">{d}</th>)}</tr></thead>
              <tbody>
                {grid.map(w => (
                  <tr key={w[0].day}>
                    {w.map(c => (
                      <td key={c.day} className="h-16 border border-hairline p-1 align-top">
                        <button className={`block w-full text-left ${c.inMonth ? 'text-ink' : 'text-muted'}`} onClick={() => { setAnchor(c.day); setView('week'); }}>
                          <span className="text-xs tabular-nums">{Number(c.day.slice(8))}</span>
                          {c.count > 0 && <span className="mt-1 block rounded bg-accent/10 px-1 text-[11px] font-semibold text-accent-ink">{c.count} job{c.count === 1 ? '' : 's'}</span>}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────────────────────────────────────────────
function HomeTab({ data, act, busy }: { data: Data; act: Act; busy: boolean }) {
  const today = todayYmd();
  const nameOf = useMemo(() => new Map(data.contacts.map(c => [c.id, c.name])), [data.contacts]);
  const k = homeKpis({ orders: data.orders, invoices: data.homeInvoices, followups: data.followups, bookings: data.bookings.length, today });
  const due = followupsDue(data.followups, today);
  const overdue = data.homeInvoices ? overdueInvoices(data.homeInvoices) : [];
  const soon = todayTomorrow(data.orders, today);
  const top = topReferrers(data.orders, data.contacts, today);
  const recent = recentlyAdded(data.contacts);
  const diff = k.jobsThisMonth - k.jobsLastMonth;
  const tomorrow = addDays(today, 1);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Link className={BTN_QUIET + ' px-3 py-1.5 text-xs'} href="/app/crm/contacts">Contacts</Link>
        <Link className={BTN_QUIET + ' px-3 py-1.5 text-xs'} href="/app/crm/schedule">+ Schedule a job</Link>
        <Link className={BTN + ' px-3 py-1.5 text-xs'} href="/app/inspections/new">New inspection</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Jobs this month" value={String(k.jobsThisMonth)} sub={`${diff >= 0 ? '+' : '−'}${Math.abs(diff)} vs last month`} />
        {k.invoicedThisMonthCents != null
          ? <Kpi label="Invoiced this month" value={dollars(k.invoicedThisMonthCents)} sub={`${dollars(k.paidThisMonthCents ?? 0)} paid`} />
          : <Kpi label="Invoiced this month" value="—" sub="Needs the Invoices permission" />}
        <Kpi label="Follow-ups due" value={String(k.followupsDue)} sub={k.followupsOverdue ? `${k.followupsOverdue} overdue` : 'none overdue'} warn={k.followupsOverdue > 0} />
        <Kpi label="Booking requests" value={String(k.bookingsWaiting)} sub={k.bookingsWaiting ? 'waiting for you' : 'none waiting'} warn={k.bookingsWaiting > 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card title="Needs you" count={data.bookings.length + overdue.length}>
            {data.bookings.length + overdue.length ? (
              <ul className="divide-y divide-hairline">
                {data.bookings.map(b => (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">Booking request · {b.address || 'No address yet'}</p>
                      <p className="text-xs text-muted">{b.client_name}{b.preferred_date ? ` · wants ${formatDate(b.preferred_date)}${b.preferred_time ? `, ${b.preferred_time}` : ''}` : ''}{b.payment_status === 'paid' ? ' · paid online' : ''}</p>
                    </div>
                    <button className={BTN_QUIET + ' px-3 py-1.5 text-xs'} disabled={busy} onClick={() => act(() => declineBooking(b), 'Booking declined.')}>Decline</button>
                    <button className={BTN + ' px-3 py-1.5 text-xs'} disabled={busy} onClick={() => act(() => confirmBooking(b), 'Booking confirmed — it is on the schedule.')}>Confirm</button>
                  </li>
                ))}
                {overdue.map(i => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">Unpaid invoice · {i.property_address || `#${i.number}`}</p>
                      <p className="text-xs text-muted">{dollars(i.balance_cents)} due{i.due_on ? ` since ${formatDate(i.due_on)}` : ''}{i.bill_to_name ? ` · ${i.bill_to_name}` : ''}</p>
                    </div>
                    <Link className="text-xs font-semibold text-accent-ink hover:underline" href="/app/invoices">Invoices</Link>
                  </li>
                ))}
              </ul>
            ) : <Empty>Nothing waiting on you.</Empty>}
            {data.homeInvoices == null && <p className="px-4 pb-3 text-xs text-muted">Overdue invoices show here for people with the Invoices permission.</p>}
          </Card>
          <Card title="Today and tomorrow" count={soon.length}>
            {soon.length ? (
              <ul className="divide-y divide-hairline">
                {soon.map(o => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-20 shrink-0 text-xs font-bold text-ink">{o.order_date === today ? 'Today' : o.order_date === tomorrow ? 'Tomorrow' : formatDate(o.order_date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-ink">{o.inspection_id ? <Link className="hover:underline" href={`/app/inspections/${encodeURIComponent(o.inspection_id)}`}>{o.address}</Link> : o.address}</span>
                      {o.contact_id && <span className="text-muted"> · {nameOf.get(o.contact_id) ?? 'Contact'}</span>}
                      {data.sources && sourceWords(o, id => nameOf.get(id)) && <span className="text-muted"> · from {sourceWords(o, id => nameOf.get(id))}</span>}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>Nothing scheduled today or tomorrow.</Empty>}
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card title="Follow-ups due" count={due.length}>
            {due.length ? (
              <ul className="divide-y divide-hairline px-4">
                {due.map(f => <FollowupLine key={f.id} f={f} today={today} busy={busy} who={f.contact_name} onToggle={d => act(() => setFollowupDone(f, d), d ? 'Done.' : undefined)} />)}
              </ul>
            ) : <Empty>Nothing due this week.</Empty>}
          </Card>
          <Card title="Top referrers · last 90 days">
            {top.length ? (
              <ul className="space-y-2 px-4 py-3">
                {top.map(r => (
                  <li key={r.contactId} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-2 text-sm">
                    <span className="truncate text-ink">{r.name}</span>
                    <span className="h-2 overflow-hidden rounded bg-ground"><span className="block h-full rounded bg-accent" style={{ width: `${Math.round((r.count / top[0].count) * 100)}%` }} /></span>
                    <span className="text-right font-semibold tabular-nums text-ink">{r.count}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>No referrals in the last 90 days.</Empty>}
            <p className="px-4 pb-3 text-xs text-muted">Jobs each contact sent. Plain counts.</p>
          </Card>
          <Card title="Recently added">
            {recent.length ? (
              <ul className="divide-y divide-hairline">
                {recent.map(c => (
                  <li key={c.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{c.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_PILL[c.type]}`}>{CONTACT_TYPE_LABEL[c.type].one}</span>
                    <span className="text-xs text-muted">{formatDate(c.created_at, { month: 'short', day: 'numeric' })}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>No contacts yet.</Empty>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${warn ? 'text-amber-700' : 'text-ink'}`}>{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

// ─── Accounts (grouped from the brokerage / company field) ───────────────────────────────────────────────────────────
function AccountsTab({ data }: { data: Data }) {
  const accounts = accountsOf(data.contacts, data.orders, data.invoices, todayYmd());
  const nameOf = new Map(data.contacts.map(c => [c.id, c.name]));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Grouped from each agent’s brokerage and each vendor’s company, as typed on the contact. Spell a company the same way on every contact to keep it one account.</p>
      {accounts.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map(a => (
            <div key={a.key} className="space-y-1 rounded-xl border border-hairline bg-surface px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-accent-ink">{a.kind === 'brokerage' ? 'Brokerage' : 'Vendor'}</p>
              <p className="font-semibold text-ink">{a.name}</p>
              <p className="text-xs text-muted">
                {a.contactIds.length} contact{a.contactIds.length === 1 ? '' : 's'}
                {a.kind === 'brokerage' && ` · ${a.referrals} referral${a.referrals === 1 ? '' : 's'} (${a.referralsRecent} in 90 days)`}
                {a.kind === 'brokerage' && a.invoicedCents != null && ` · ${dollars(a.invoicedCents)} invoiced`}
              </p>
              <p className="truncate text-xs text-body">{a.contactIds.map(id => nameOf.get(id)).filter(Boolean).join(', ')}</p>
            </div>
          ))}
        </div>
      ) : <Card><Empty>No accounts yet. Add a brokerage to an agent, or a company to a vendor.</Empty></Card>}
    </div>
  );
}

// ─── Planned tabs: each says what it will do, and points back to what works ─────────────────────────────────────────
function PlannedPage({ tab }: { tab: PlannedTab }) {
  const p = PLANNED_TABS[tab];
  return (
    <section className="max-w-2xl space-y-3 rounded-2xl border border-dashed border-hairline px-6 py-7">
      <span className="inline-block rounded-full bg-ground px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">Planned · being built</span>
      <h2 className="text-xl font-bold text-ink">{p.title}</h2>
      <p className="text-body">{p.line}</p>
      <p className="text-sm text-muted">What this page will do:</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-body">{p.will.map(w => <li key={w}>{w}</li>)}</ul>
      <p className="text-sm text-muted">Nothing here yet. Your contacts, jobs and follow-ups are in <Link className="font-semibold text-accent-ink hover:underline" href="/app/crm/contacts">Contacts</Link> and on the <Link className="font-semibold text-accent-ink hover:underline" href="/app/crm">CRM home</Link>.</p>
    </section>
  );
}

// ─── CSV import ──────────────────────────────────────────────────────────────────────────────────────────────────────
const IMPORT_FIELDS: [string, string, RegExp][] = [
  ['name', 'Name *', /^(full )?name$|contact/i], ['type', 'Type', /type|role|kind/i], ['email', 'Email', /e-?mail/i],
  ['phone', 'Phone', /phone|mobile|cell/i], ['brokerage', 'Brokerage / company', /brokerage|company|office/i],
  ['address', 'Property address', /address/i], ['order_date', 'Job date', /date/i],
];

function ImportPanel({ types, act, busy, onDone }: { types: ContactType[]; act: Act; busy: boolean; onDone: () => void }) {
  const [text, setText] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ contacts: number; orders: number; refused: number; failed: number } | null>(null);
  const isn = !!text.trim() && detectISNCSV(text);
  const headers = useMemo(() => (text.trim() ? parseCSVHeaders(text) : []), [text]);
  useEffect(() => {
    if (isn || !headers.length) return;
    const m: Record<string, string> = {};
    for (const [k, , re] of IMPORT_FIELDS) { const h = headers.find(x => re.test(x)); if (h) m[k] = h; }
    setMapping(m);
  }, [headers, isn]);
  const rows: ImportRow[] = useMemo(() => (!text.trim() ? [] : isn ? parseISNCSV(text) : mapping.name ? parseGenericCSV(text, mapping) : []), [text, isn, mapping]);
  const count = (t: ContactType) => rows.filter(r => r.type === t).length;
  const notTaken = rows.filter(r => !types.includes(r.type)).length;
  const readFile = (file: File | undefined) => { if (!file) return; const fr = new FileReader(); fr.onload = () => setText(String(fr.result ?? '')); fr.readAsText(file); };

  if (result) return (
    <Card title="Import finished">
      <div className="space-y-2 p-4 text-sm">
        <p className="text-ink"><strong>{result.contacts}</strong> contacts and <strong>{result.orders}</strong> jobs saved.</p>
        {result.refused > 0 && <p className="text-body">{result.refused} vendor{result.refused === 1 ? '' : 's'} not imported — this account can’t save vendors yet.</p>}
        {result.failed > 0 && <p className="text-body">{result.failed} row{result.failed === 1 ? '' : 's'} could not be saved.</p>}
        <button className={BTN} onClick={onDone}>Back to contacts</button>
      </div>
    </Card>
  );
  return (
    <Card title="Import contacts from a CSV">
      <div className="space-y-3 p-4 text-sm">
        <p className="text-body">An ISN export is read as it is (agents and clients, with their jobs). Any other CSV: match its columns below. Contacts with an email you already have are updated, not duplicated.</p>
        <input id="csv-file" type="file" accept=".csv,text/csv" onChange={e => readFile(e.target.files?.[0])} className="block text-sm" />
        <textarea id="csv-text" aria-label="CSV text" className={FIELD + ' h-32 py-2 font-mono text-xs'} placeholder="…or paste the CSV here" value={text} onChange={e => setText(e.target.value)} />
        {!!headers.length && !isn && (
          <div className="grid gap-2 sm:grid-cols-3">
            {IMPORT_FIELDS.map(([k, l]) => (
              <label key={k}><span className={LABEL}>{l}</span>
                <select id={`map-${k}`} className={FIELD} value={mapping[k] ?? ''} onChange={e => setMapping(m => ({ ...m, [k]: e.target.value }))}>
                  <option value="">—</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select></label>
            ))}
          </div>
        )}
        {!!rows.length && (
          <p className="rounded-lg bg-ground px-3 py-2 text-body">
            <strong className="text-ink">{rows.length}</strong> contacts ready{isn ? ' (ISN export)' : ''}: {count('agent')} agents · {count('client')} clients · {count('homeowner')} homeowners{count('vendor') ? ` · ${count('vendor')} vendors` : ''}
            {' '}· {rows.filter(r => r.address && r.orderDate).length} jobs.
            {notTaken > 0 && <> {notTaken} vendor{notTaken === 1 ? '' : 's'} will be skipped — this account can’t save vendors yet.</>}
          </p>
        )}
        <div className="flex gap-2">
          <button className={BTN} disabled={busy || !rows.length} onClick={async () => {
            const box: { r?: Awaited<ReturnType<typeof importContacts>> } = {};
            await act(async () => { box.r = await importContacts(rows, types); });
            if (box.r) setResult(box.r);
          }}>{busy ? 'Importing…' : `Import ${rows.length || ''}`.trim()}</button>
          <button className={BTN_QUIET} onClick={onDone}>Cancel</button>
        </div>
        <p className="text-xs text-muted">Amounts in the file are not imported: money lives on invoices.</p>
      </div>
    </Card>
  );
}
