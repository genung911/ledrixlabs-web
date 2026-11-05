'use client';
// Contacts (owner 2026-11-05: Contacts mockup approved — "Clients is fine, but we do need agents and possibly vendors",
// so the page is Contacts, the phone's own word; "Move all the office/admin work to be done on web as well as phone").
// The same records as the phone's CRM: contacts (agents, clients, homeowners, and vendors once the server takes them),
// their jobs (CRM orders), follow-ups and notes; the schedule; booking requests; agents' referral counts; CSV import.
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
  CRMError, addContact, addFollowup, changeJob, confirmBooking, declineBooking, importContacts, loadContactTypes, loadContacts,
  loadFollowups, loadInvoicesFor, loadOrderNotes, loadOrders, loadPendingBookings, removeContact, saveContact, scheduleJob,
  setFollowupDone, type Booking, type Contact, type ContactInput, type Followup, type Order, type OrderNote, type OrderStatus,
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
type Tab = 'contacts' | 'schedule' | 'followups' | 'agents';

type Data = {
  contacts: Contact[]; orders: Order[]; followups: Followup[]; bookings: Booking[];
  invoices: InvoiceFacts[] | null; types: ContactType[];
};
type State = { kind: 'loading' } | { kind: 'denied' } | { kind: 'error'; message: string } | ({ kind: 'ready' } & Data);

export default function ContactsPage() {
  const { access } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [tab, setTab] = useState<Tab>('contacts');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // The page follows the server's `crm` permission, as the menu item does (an account with no company is its own CRM).
      const caps = access.companyId ? await loadMyCapabilities() : null;
      if (access.companyId && caps?.crm !== true) { setState({ kind: 'denied' }); return; }
      const [contacts, orders, followups, bookings, types] = await Promise.all([
        loadContacts(), loadOrders(), loadFollowups(), loadPendingBookings(), loadContactTypes(),
      ]);
      const invoices = await loadInvoicesFor(orders.map(o => o.id));
      setState({ kind: 'ready', contacts, orders, followups, bookings, invoices, types });
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

  if (state.kind === 'loading') return <Page><PageHeader title="Contacts" /><Loading /></Page>;
  if (state.kind === 'denied') return (
    <Page><PageHeader title="Contacts" />
      <Card><Empty>Contacts need the “CRM — clients, agents, bookings” permission. Ask your company owner to turn it on for you on the Team page.</Empty></Card>
    </Page>
  );
  if (state.kind === 'error') return <Page><PageHeader title="Contacts" /><ErrorBox message={state.message} onRetry={load} /></Page>;

  const openFollowups = state.followups.filter(f => !f.completed);
  const agents = state.contacts.filter(c => c.type === 'agent');
  const TABS: [Tab, string, number][] = [
    ['contacts', 'Contacts', state.contacts.length], ['schedule', 'Schedule', state.orders.filter(o => o.status === 'scheduled' && o.order_date >= todayYmd()).length],
    ['followups', 'Follow-ups', openFollowups.length], ['agents', 'Agents', agents.length],
  ];

  return (
    <Page>
      <PageHeader title="Contacts" subtitle="Agents, clients, homeowners and vendors — the same records as the phone’s CRM." />
      <div role="tablist" className="mb-5 flex flex-wrap gap-1 border-b border-hairline">
        {TABS.map(([k, l, c]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {l} <span className="ml-1 rounded-full bg-ground px-1.5 font-mono text-[11px] text-body">{c}</span>
          </button>
        ))}
      </div>
      {notice && <p role="status" className={`mb-4 rounded-lg px-3 py-2 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>{notice.text}</p>}
      {tab === 'contacts' && <ContactsTab data={state} act={act} busy={busy} />}
      {tab === 'schedule' && <ScheduleTab data={state} act={act} busy={busy} />}
      {tab === 'followups' && <FollowupsTab followups={openFollowups} act={act} busy={busy} />}
      {tab === 'agents' && <AgentsTab data={state} />}
    </Page>
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
        {scheduling && <ScheduleForm contacts={[c]} fixedContact={c.id} busy={busy}
          onSave={async j => { if (await act(() => scheduleJob(j), 'Job scheduled.')) setScheduling(false); }} />}
        {jobs.length ? (
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-2 py-2">Date</th><th className="px-2">Address</th><th className="px-2">Status</th><th className="px-2">Invoice</th><th className="px-2">Notes</th></tr></thead>
              <tbody className="divide-y divide-hairline">
                {jobs.map(o => {
                  const pay = payOf(invOf(o));
                  const jobNotes = o.inspection_id ? notes[o.inspection_id] ?? [] : [];
                  return (
                    <JobRow key={o.id} o={o} payText={data.invoices == null ? '—' : payWords(pay)} payState={pay.state}
                      notes={jobNotes} open={openNotes === o.id} onToggle={() => setOpenNotes(cur => (cur === o.id ? null : o.id))}
                      onStatus={(s) => act(() => changeJob(o, { status: s }), 'Job updated.')} busy={busy} />
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

function JobRow({ o, payText, payState, notes, open, onToggle, onStatus, busy }: {
  o: Order; payText: string; payState: string; notes: OrderNote[]; open: boolean; onToggle: () => void; onStatus: (s: OrderStatus) => void; busy: boolean;
}) {
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
        <td className="px-2">{notes.length ? <button className="text-xs font-semibold text-accent-ink hover:underline" onClick={onToggle}>{open ? 'Hide' : `${notes.length} note${notes.length === 1 ? '' : 's'}`}</button> : <span className="text-xs text-muted">—</span>}</td>
      </tr>
      {open && (
        <tr><td colSpan={5} className="bg-ground px-4 py-2">
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
function ScheduleForm({ contacts, fixedContact, busy, onSave }: {
  contacts: Contact[]; fixedContact?: string; busy: boolean; onSave: (j: { contactId: string | null; address: string; date: string; notes?: string }) => void;
}) {
  const [j, setJ] = useState({ contactId: fixedContact ?? '', address: '', date: todayYmd(), notes: '' });
  return (
    <form className="grid gap-2 border-b border-hairline px-4 py-3 sm:grid-cols-4" onSubmit={e => { e.preventDefault(); onSave({ ...j, contactId: j.contactId || null }); }}>
      <label className="sm:col-span-2"><span className={LABEL}>Property address *</span><input id="sj-address" className={FIELD} value={j.address} onChange={e => setJ(x => ({ ...x, address: e.target.value }))} required /></label>
      <label><span className={LABEL}>Date *</span><input id="sj-date" type="date" className={FIELD} value={j.date} onChange={e => setJ(x => ({ ...x, date: e.target.value }))} required /></label>
      {!fixedContact && (
        <label><span className={LABEL}>Contact</span><select id="sj-contact" className={FIELD} value={j.contactId} onChange={e => setJ(x => ({ ...x, contactId: e.target.value }))}>
          <option value="">None</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({CONTACT_TYPE_LABEL[c.type].one})</option>)}</select></label>
      )}
      <label className="sm:col-span-4"><span className={LABEL}>Notes</span><input id="sj-notes" className={FIELD} value={j.notes} onChange={e => setJ(x => ({ ...x, notes: e.target.value }))} /></label>
      <div className="sm:col-span-4 flex items-center gap-3">
        <button className={BTN} disabled={busy || !j.address.trim()}>Schedule job</button>
        <span className="text-xs text-muted">Creates the job on the schedule. Start the inspection from it on the phone.</span>
      </div>
    </form>
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
        {adding && <ScheduleForm contacts={data.contacts} busy={busy} onSave={async j => { if (await act(() => scheduleJob(j), 'Job scheduled.')) setAdding(false); }} />}
        {view === 'week' ? (days.length ? (
          <div className="space-y-4 p-4">
            {days.map(d => (
              <div key={d.day}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{formatDate(d.day, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                <ul className="space-y-1.5">
                  {d.items.map(o => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1"><span className="font-semibold text-ink">{o.inspection_id ? <Link className="hover:underline" href={`/app/inspections/${encodeURIComponent(o.inspection_id)}`}>{o.address}</Link> : o.address}</span>
                        {o.contact_id && <span className="text-muted"> · {contactName.get(o.contact_id) ?? 'Contact'}</span>}</span>
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

// ─── Follow-ups ──────────────────────────────────────────────────────────────────────────────────────────────────────
function FollowupsTab({ followups, act, busy }: { followups: Followup[]; act: Act; busy: boolean }) {
  const today = todayYmd();
  return (
    <Card title="Open follow-ups" count={followups.length}>
      {followups.length ? (
        <ul className="divide-y divide-hairline px-4">
          {followups.map(f => <FollowupLine key={f.id} f={f} today={today} busy={busy} who={f.contact_name} onToggle={d => act(() => setFollowupDone(f, d), d ? 'Done.' : undefined)} />)}
        </ul>
      ) : <Empty>Nothing open. Add follow-ups from a contact.</Empty>}
    </Card>
  );
}

// ─── Agents ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function AgentsTab({ data }: { data: Data }) {
  const today = todayYmd();
  const rows = data.contacts.filter(c => c.type === 'agent').map(c => {
    const jobs = data.orders.filter(o => o.contact_id === c.id);
    const inv = data.invoices ? invoicedCents(data.invoices.filter(i => jobs.some(j => j.id === i.order_id))) : null;
    return { c, r: referrals(jobs, today), inv };
  }).sort((a, b) => b.r.total - a.r.total || a.c.name.localeCompare(b.c.name));
  return (
    <Card title="Agents" count={rows.length}>
      {rows.length ? (
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-2 py-2">Agent</th><th className="px-2">Brokerage</th><th className="px-2">Referrals</th><th className="px-2">Last 30 days · prior 30</th><th className="px-2">Invoiced</th><th className="px-2">Next / last job</th></tr></thead>
            <tbody className="divide-y divide-hairline">
              {rows.map(({ c, r, inv }) => (
                <tr key={c.id}>
                  <td className="px-2 py-2 font-semibold text-ink">{c.name}</td><td className="px-2">{c.brokerage || '—'}</td>
                  <td className="px-2 tabular-nums">{r.total}</td><td className="px-2 tabular-nums">{r.last30} · {r.prior30}</td>
                  <td className="px-2 tabular-nums">{inv == null ? '—' : dollars(inv)}</td><td className="px-2 tabular-nums">{formatDate(r.next ?? r.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2 py-2 text-xs text-muted">Plain counts. Ledrix does not score or rate people.</p>
        </div>
      ) : <Empty>No agents yet.</Empty>}
    </Card>
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
