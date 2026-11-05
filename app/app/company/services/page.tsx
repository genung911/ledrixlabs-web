'use client';

// Company › Services & prices — the company's price list and its online booking page (owner 2026-11-05, office pages
// mockup, ruling 3: "one price list and one booking page per company, edited by owner/admin"). The same records the
// phone's Services and Settings screens read and change (lib/office/api.ts). Until #115 is applied the booking page is
// the owner's own row — the page says so, and only the owner can change it.
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, ErrorBox, Loading, Page, PageHeader } from '@/components/workspace/ui';
import { loadMyCapabilities } from '@/lib/team/permissions';
import { mayEditServices } from '@/lib/office/access';
import {
  OfficeError, addService, loadBookingPage, loadServices, removeService, saveBookingPage, saveService,
  type BookingPage, type Service, type ServiceInput,
} from '@/lib/office/api';

const FIELD = 'h-10 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const AREA = 'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted';
const BTN = 'rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink/85 disabled:opacity-50';
const BTN_QUIET = 'rounded-full border border-hairline bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50';
const EMPTY: ServiceInput = { name: '', description: '', price: 0, duration_minutes: null, active: true };
const BOOK_HOST = 'ledrixlabs.com/book/';

export default function ServicesPage() {
  const { access } = useWorkspace();
  const [editable, setEditable] = useState<boolean | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [page, setPage] = useState<BookingPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; v: ServiceInput; priceText: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const caps = await loadMyCapabilities();
      setEditable(mayEditServices({ companyId: access.companyId, role: access.role }, caps));
      const [s, b] = await Promise.all([
        loadServices({ companyId: access.companyId, userId: access.userId }),
        loadBookingPage({ userId: access.userId, ownsIt: !access.companyId || access.role === 'owner' }),
      ]);
      setServices(s); setPage(b);
    } catch (e) { setErr((e as Error).message); }
  }, [access.companyId, access.role, access.userId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null); setErr(null);
    try { await fn(); setMsg(ok); setEdit(null); await load(); }
    catch (e) { setErr((e as Error).message); if ((e as OfficeError).conflict) await load(); }
    finally { setBusy(false); }
  };

  if (err && !services) return <Page><PageHeader title="Services & prices" /><ErrorBox message={err} onRetry={load} /></Page>;
  if (!services || !page || editable === null) return <Page><Loading /></Page>;
  const canBook = editable && page.editable;

  return (
    <Page>
      <PageHeader title="Services & prices" subtitle={access.companyId ? 'One price list and one booking page for your company.' : 'Your price list and booking page.'}
        actions={editable ? <button className={BTN} onClick={() => setEdit({ id: null, v: EMPTY, priceText: '' })}>+ New service</button> : undefined} />
      {!editable && <p className="mb-3 text-sm text-muted">Only the owner and admins change services. You can see them.</p>}
      {msg && <p role="status" className="mb-3 text-sm font-semibold text-[#1f8a4c]">{msg}</p>}
      {err && <p role="alert" className="mb-3 text-sm text-[#b42318]">{err}</p>}

      <Card title="Services" count={services.length}>
        {services.length === 0 ? <p className="text-sm text-muted">No services yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="py-2">Service</th><th>Price</th><th>Time on site</th><th>Booking page</th><th /></tr></thead>
              <tbody>{services.map(s => (
                <tr key={s.id} className="border-t border-hairline">
                  <td className="py-2"><span className="font-semibold text-ink">{s.name}</span>{s.description && <span className="block text-xs text-muted">{s.description}</span>}</td>
                  <td className="tabular-nums">${s.price.toFixed(2)}</td>
                  <td>{s.duration_minutes ? `${Math.floor(s.duration_minutes / 60)} h ${s.duration_minutes % 60 ? `${s.duration_minutes % 60} min` : ''}` : '—'}</td>
                  <td>{s.active ? 'Shown' : 'Hidden'}</td>
                  <td className="text-right">{editable && <button className={BTN_QUIET} onClick={() => setEdit({ id: s.id, v: { name: s.name, description: s.description ?? '', price: s.price, duration_minutes: s.duration_minutes, active: s.active }, priceText: s.price.toFixed(2) })}>Edit</button>}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>

      {edit && (
        <Card title={edit.id ? 'Edit service' : 'New service'} className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={LABEL} htmlFor="sv-name">Name *</label><input id="sv-name" className={FIELD} value={edit.v.name} onChange={e => setEdit({ ...edit, v: { ...edit.v, name: e.target.value } })} placeholder="Full Home Inspection" /></div>
            <div><label className={LABEL} htmlFor="sv-price">Price ($) *</label><input id="sv-price" className={FIELD} inputMode="decimal" value={edit.priceText} onChange={e => setEdit({ ...edit, priceText: e.target.value })} placeholder="0.00" /></div>
            <div><label className={LABEL} htmlFor="sv-dur">Time on site (minutes)</label><input id="sv-dur" className={FIELD} inputMode="numeric" value={edit.v.duration_minutes ?? ''} onChange={e => setEdit({ ...edit, v: { ...edit.v, duration_minutes: e.target.value ? Number(e.target.value) : null } })} /></div>
            <label className="flex items-center gap-2 self-end text-sm text-ink"><input type="checkbox" checked={edit.v.active} onChange={e => setEdit({ ...edit, v: { ...edit.v, active: e.target.checked } })} /> Show on the booking page</label>
            <div className="sm:col-span-2"><label className={LABEL} htmlFor="sv-desc">Description</label><input id="sv-desc" className={FIELD} value={edit.v.description ?? ''} onChange={e => setEdit({ ...edit, v: { ...edit.v, description: e.target.value } })} /></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={BTN} disabled={busy} onClick={() => {
              const v = { ...edit.v, price: Number(edit.priceText) };
              const s = services.find(x => x.id === edit.id);
              void run(() => (s ? saveService(s, v) : addService(v)), 'Saved.');
            }}>Save</button>
            <button className={BTN_QUIET} onClick={() => setEdit(null)}>Cancel</button>
            {edit.id && <button className={BTN_QUIET} disabled={busy} onClick={() => { const s = services.find(x => x.id === edit.id); if (s) void run(() => removeService(s), 'Removed.'); }}>Remove</button>}
          </div>
        </Card>
      )}

      <Card title="Booking page" className="mt-4">
        <div className="space-y-3">
          {page.source === 'own' && access.companyId && <p className="text-xs text-muted">Until the server update for company booking pages is applied, this is the owner’s own page{access.role === 'owner' ? '' : ', and only the owner can change it'}.</p>}
          <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" disabled={!canBook} checked={page.active} onChange={e => setPage({ ...page, active: e.target.checked })} />
            <span><b>Take bookings online.</b> Clients pick a service and a time; requests land in Contacts › Schedule to confirm.</span></label>
          <div className="max-w-md"><label className={LABEL} htmlFor="bk-slug">Your link</label>
            <div className="flex items-center gap-1 text-sm"><span className="text-muted">{BOOK_HOST}</span><input id="bk-slug" className={FIELD} disabled={!canBook} value={page.slug ?? ''} onChange={e => setPage({ ...page, slug: e.target.value })} /></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={LABEL} htmlFor="bk-name">Business name</label><input id="bk-name" className={FIELD} disabled={!canBook} value={page.businessName ?? ''} onChange={e => setPage({ ...page, businessName: e.target.value })} /></div>
            <div><label className={LABEL} htmlFor="bk-site">Website</label><input id="bk-site" className={FIELD} disabled={!canBook} value={page.website ?? ''} onChange={e => setPage({ ...page, website: e.target.value })} /></div>
          </div>
          <div><label className={LABEL} htmlFor="bk-agree">Inspection agreement</label><textarea id="bk-agree" className={AREA} rows={5} disabled={!canBook} value={page.agreement ?? ''} onChange={e => setPage({ ...page, agreement: e.target.value })} />
            <p className="mt-1 text-xs text-muted">Shown to the client to sign when they book.</p></div>
          {canBook && <button className={BTN} disabled={busy} onClick={() => run(() => saveBookingPage(page, { userId: access.userId }), 'Booking page saved.')}>Save booking page</button>}
        </div>
      </Card>
    </Page>
  );
}
