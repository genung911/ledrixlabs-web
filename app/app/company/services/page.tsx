'use client';

// Company › Services & prices — the company's price list and its online booking page (owner 2026-11-05, office pages
// mockup, ruling 3: "one price list and one booking page per company, edited by owner/admin"). The same records the
// phone's Services and Settings screens read and change (lib/office/api.ts). Until #115 is applied the booking page is
// the owner's own row — the page says so, and only the owner can change it.
// Website Apple pass (owner 2026-11-23, mockup CXThxTV8YKrVAaDGGa64to): each service is a row with its switch (on = on the
// booking page); New service and a click open a sheet with Cancel / Save at the top, Remove last inside it, in red, with
// its confirm. The booking page's rows save as you go — no "Save booking page" button.
import { useCallback, useEffect, useState } from 'react';
import { CompanyTabs } from '@/components/workspace/CompanyTabs';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { ErrorBox, FieldRow, Group, Loading, Page, PageHeader, Row, Sheet, Toggle } from '@/components/workspace/ui';
import { loadMyCapabilities } from '@/lib/team/permissions';
import { mayEditServices } from '@/lib/office/access';
import {
  OfficeError, addService, bookingSlugOf, loadBookingPage, loadServices, removeService, saveBookingPage, saveService,
  type BookingPage, type Service, type ServiceInput,
} from '@/lib/office/api';

const FIELD = 'h-10 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
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

  if (err && !services) return <Page><PageHeader title="Services & prices" /><CompanyTabs /><ErrorBox message={err} onRetry={load} /></Page>;
  if (!services || !page || editable === null) return <Page><PageHeader title="Services & prices" /><CompanyTabs /><Loading /></Page>;
  const canBook = editable && page.editable;
  const shown = services.filter(x => x.active).length;
  const inputOf = (x: Service): ServiceInput => ({ name: x.name, description: x.description ?? '', price: x.price, duration_minutes: x.duration_minutes, active: x.active });
  const dur = (m: number | null) => m ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h` : ''}${m % 60 ? ` ${m % 60} min` : ''}`.trim() : null;
  // The Link box shows what is kept: a pasted full address reads back as just its link part (bookingSlugOf).
  const saveBook = (next: BookingPage) => { setPage({ ...next, slug: next.slug == null ? next.slug : bookingSlugOf(next.slug) }); return saveBookingPage(next, { userId: access.userId }); };

  return (
    <Page>
      <PageHeader title="Services & prices"
        subtitle={`${shown} of ${services.length} on your booking page`}
        actions={editable ? <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90" onClick={() => setEdit({ id: null, v: EMPTY, priceText: '' })}>New service</button> : undefined} />
      <CompanyTabs />
      {msg && <p role="status" className="mb-3 text-sm font-semibold text-[#1f8a4c]">{msg}</p>}
      {err && <p role="alert" className="mb-3 text-sm text-[#b42318]">{err}</p>}

      <div className="flex max-w-3xl flex-col gap-6">
        <Group heading="Services"
          footnote={editable ? 'Switched-on services appear on your booking page. Click one to change it; Remove is the last row inside it.' : 'Only the owner and admins change services. You can see them.'}>
          {services.length === 0 ? <p className="px-4 py-3 text-sm text-muted">No services yet.</p> : services.map(x => (
            <Row key={x.id} label={x.name}
              sub={[`$${x.price.toFixed(2)}`, dur(x.duration_minutes), x.description].filter(Boolean).join(' · ')}
              onClick={editable ? () => setEdit({ id: x.id, v: inputOf(x), priceText: x.price.toFixed(2) }) : undefined}
              right={<Toggle label={`${x.name} on the booking page`} checked={x.active} disabled={!editable || busy}
                onChange={v => void run(() => saveService(x, { ...inputOf(x), active: v }), v ? 'Shown on the booking page.' : 'Hidden from the booking page.')} />} />
          ))}
        </Group>

        <Group heading="Booking page"
          footnote={<>
            {page.source === 'own' && access.companyId ? <>Until the server update for company booking pages is applied, this is the owner’s own page{access.role === 'owner' ? '' : ', and only the owner can change it'}. </> : null}
            Clients pick a service and a time; requests land in CRM › Schedule to confirm. {canBook ? 'Changes save as you go.' : ''}
          </>}>
          <Row label="Take bookings online" right={<Toggle label="Take bookings online" checked={page.active} disabled={!canBook}
            onChange={v => void run(() => saveBook({ ...page, active: v }), v ? 'Booking page on.' : 'Booking page off.')} />} />
          <FieldRow label={`Link (${BOOK_HOST}…)`} value={page.slug ?? ''} disabled={!canBook} onSave={v => saveBook({ ...page, slug: v })} />
          <FieldRow label="Business name" value={page.businessName ?? ''} disabled={!canBook} onSave={v => saveBook({ ...page, businessName: v })} />
          <FieldRow label="Website" value={page.website ?? ''} disabled={!canBook} onSave={v => saveBook({ ...page, website: v })} />
          <AgreementRow value={page.agreement ?? ''} disabled={!canBook} onSave={v => saveBook({ ...page, agreement: v })} />
        </Group>
      </div>

      {edit && (
        <Sheet title={edit.id ? 'Edit service' : 'New service'} onCancel={() => setEdit(null)} busy={busy}
          doneLabel={edit.id ? 'Save' : 'Add'} doneDisabled={!edit.v.name.trim()}
          onDone={() => {
            const v = { ...edit.v, price: Number(edit.priceText) };
            const x = services.find(y => y.id === edit.id);
            void run(() => (x ? saveService(x, v) : addService(v)), 'Saved.');
          }}>
          <Group>
            <label className="flex items-center gap-3 px-4 py-2"><span className="w-32 text-sm text-ink">Name</span><input className={FIELD} value={edit.v.name} onChange={e => setEdit({ ...edit, v: { ...edit.v, name: e.target.value } })} placeholder="Single family home inspection" /></label>
            <label className="flex items-center gap-3 px-4 py-2"><span className="w-32 text-sm text-ink">Price ($)</span><input className={FIELD} inputMode="decimal" value={edit.priceText} onChange={e => setEdit({ ...edit, priceText: e.target.value })} placeholder="0.00" /></label>
            <label className="flex items-center gap-3 px-4 py-2"><span className="w-32 text-sm text-ink">Time on site (min)</span><input className={FIELD} inputMode="numeric" value={edit.v.duration_minutes ?? ''} onChange={e => setEdit({ ...edit, v: { ...edit.v, duration_minutes: e.target.value ? Number(e.target.value) : null } })} /></label>
            <label className="flex items-center gap-3 px-4 py-2"><span className="w-32 text-sm text-ink">Description</span><input className={FIELD} value={edit.v.description ?? ''} onChange={e => setEdit({ ...edit, v: { ...edit.v, description: e.target.value } })} /></label>
            <Row label="Show on the booking page" right={<Toggle label="Show on the booking page" checked={edit.v.active} onChange={v => setEdit({ ...edit, v: { ...edit.v, active: v } })} />} />
          </Group>
          {edit.id && (
            <Group>
              <Row label="Remove service" destructive disabled={busy} onClick={() => {
                const x = services.find(y => y.id === edit.id);
                if (x && window.confirm(`Remove “${x.name}”? It comes off your price list and booking page.`)) void run(() => removeService(x), 'Removed.');
              }} />
            </Group>
          )}
        </Sheet>
      )}
    </Page>
  );
}

function AgreementRow({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <label className="flex flex-col gap-1.5 px-4 py-3">
      <span className="text-sm text-ink">Inspection agreement</span>
      <textarea rows={5} disabled={disabled} value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== value) void onSave(v); }}
        className="w-full rounded-md border border-hairline bg-ground/40 px-2.5 py-2 text-sm text-ink outline-none focus:border-accent" />
      <span className="text-xs text-muted">Shown to the client to sign when they book.</span>
    </label>
  );
}
