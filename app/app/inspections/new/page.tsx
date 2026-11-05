'use client';

// Inspections › New — start an inspection from the office (owner 2026-11-05: "Move all the office/admin work to be done on
// web as well as phone"; office pages mockup, "use all recommendations").
//   · Who may: the people the server lets add inspections (the `add_inspections` permission — owner, admin, office and
//     inspectors by default; the owner can change it per person). The server decides; this page only hides the button.
//   · The job is made by the phone's own create on the server (/api/inspections/new → lib/newJob/create.ts), so its
//     checklist is the one a phone would have built from the same form, and it reaches the inspector's phone at the
//     next sync.
//   · Then, as the phone does: the client and agent into Contacts, the job's order; and (ruling 2) a DRAFT invoice with
//     the services picked — never sent from here. Each of those follows its own permission; a refusal is reported,
//     the job stays.
// The form asks what the phone's New Inspection asks, with the phone's choices (lib/newJob/intake.ts).
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, ErrorBox, Loading, Page, PageHeader } from '@/components/workspace/ui';
import { workspace } from '@/lib/workspace/client';
import { loadMembers, type MemberRow } from '@/lib/workspace/data';
import { loadMyCapabilities } from '@/lib/team/permissions';
import { listInspectionTypes, listTemplates, detectBackend, type InspectionType, type LiveTemplate } from '@/lib/templates/api';
import { addContact, loadContacts, loadContactTypes, loadOrderSources, type Contact } from '@/lib/crm/api';
import { NO_SOURCE, sourceFields, type OrderSource, type SourceChoice } from '@/lib/crm/crmHome';
import { SourcePicker } from '@/components/crm/CrmApp';
import { loadServices, orderForJob, draftInvoiceFor, type Service } from '@/lib/office/api';
import { webDevice } from '@/lib/findings/edit';
import { DELTA_OPTIONS, GAS_SUPPLY_OPTIONS, HOME_TYPES, SEWER_TYPE_OPTIONS, TYPE_DEFAULT_TEMPLATE, WATER_SOURCE_OPTIONS, cents } from '@/lib/newJob/intake';

const FIELD = 'h-10 w-full rounded-lg border border-hairline bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const AREA = 'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const LABEL = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted';
const CHIP = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-accent bg-accent/10 text-accent-ink' : 'border-hairline text-body hover:text-ink'}`;
const BASELINES = [{ id: 'internachi', name: 'Ledrix Default' }, { id: 'fourpoint', name: 'Ledrix 4-Point' }];
const pad = (n: number) => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** "09:00" → "9:00 AM", the phone's way of writing a time. */
const timeWords = (hhmm: string) => { const m = /^(\d\d):(\d\d)$/.exec(hhmm); if (!m) return ''; const h = Number(m[1]); return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };

type Person = { mode: 'pick' | 'new'; id: string; name: string; email: string; phone: string };
const NO_PERSON: Person = { mode: 'pick', id: '', name: '', email: '', phone: '' };

export default function NewInspectionPage() {
  const { access } = useWorkspace();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [types, setTypes] = useState<InspectionType[]>([]);
  const [templates, setTemplates] = useState<LiveTemplate[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [contacts, setContacts] = useState<Contact[] | null>(null);   // null = no access to Contacts
  const [vendorsOk, setVendorsOk] = useState(false);
  // Where the job came from (#114): the sources the server takes, or null (then the field is hidden, nothing is sent).
  const [sources, setSources] = useState<OrderSource[] | null>(null);
  const [came, setCame] = useState<SourceChoice>(NO_SOURCE);
  const [services, setServices] = useState<Service[]>([]);

  // the form — the phone's keys
  const [f, setF] = useState({ address: '', city: '', state: '', zip: '', date: localToday(), time: '09:00', yearBuilt: '', sqft: '', bedrooms: '', bathrooms: '',
    homeType: '', unitCount: '', deltas: [] as string[], deltasNone: false, waterSource: '', sewerType: '', gasSupply: '', inspectionType: '', lockbox: '', notes: '' });
  const set = (k: keyof typeof f, v: any) => setF(p => ({ ...p, [k]: v }));
  const [templateId, setTemplateId] = useState('');
  const [leadId, setLeadId] = useState<string>(access.userId);
  const [client, setClient] = useState<Person>(NO_PERSON);
  const [agent, setAgent] = useState<Person>(NO_PERSON);
  const [baseService, setBaseService] = useState('');
  const [price, setPrice] = useState('');
  const [addons, setAddons] = useState<Set<string>>(new Set());
  const [vendor, setVendor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; warnings: string[] } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const caps = await loadMyCapabilities();
        const ok = !access.companyId || caps?.add_inspections === true;
        setAllowed(ok);
        if (!ok) return;
        const [ts, tps, ms] = access.companyId
          ? await Promise.all([listInspectionTypes(access.companyId).catch(() => []), detectBackend().then(b => listTemplates(access.companyId!, b)).catch(() => []), loadMembers().catch(() => [])])
          : [[], [], []];
        setTypes(ts); setTemplates(tps); setMembers(ms as MemberRow[]);
        setServices(await loadServices({ companyId: access.companyId, userId: access.userId }, true).catch(() => []));
        if (!access.companyId || caps?.crm === true) {
          setContacts(await loadContacts().catch(() => []));
          setVendorsOk(((await loadContactTypes().catch(() => [])) as string[]).includes('vendor'));
          setSources(await loadOrderSources().catch(() => null));
        }
      } catch (e) { setLoadErr((e as Error).message || 'This page could not be loaded.'); }
    })();
  }, [access.companyId, access.userId]);

  // the type picks the template: the company's own for the type, else the phone's stock fallback
  const pickType = (name: string) => {
    set('inspectionType', name);
    const t = types.find(x => x.name === name);
    setTemplateId(t?.templateId ?? TYPE_DEFAULT_TEMPLATE[name] ?? 'internachi');
  };
  const typeNames = types.length ? types.map(t => t.name) : Object.keys(TYPE_DEFAULT_TEMPLATE);
  const templateChoices = [...templates.map(t => ({ id: t.id, name: t.name })), ...BASELINES];
  const base = services.find(s => s.id === baseService) ?? null;
  const addonList = services.filter(s => addons.has(s.id));
  const priceNum = price.trim() === '' ? (base?.price ?? 0) : Number(price);
  const total = (Number.isFinite(priceNum) ? priceNum : 0) + addonList.reduce((n, s) => n + s.price, 0);
  const people = (type: string) => (contacts ?? []).filter(c => c.type === type);
  const leadName = members.find(m => m.id === leadId)?.full_name ?? access.name ?? '';
  const vendorName = (contacts ?? []).find(c => c.id === vendor)?.name ?? '';

  const personFields = (p: Person, type: 'client' | 'agent') => {
    if (p.mode === 'pick' && p.id) { const c = (contacts ?? []).find(x => x.id === p.id); return { name: c?.name ?? '', email: c?.email ?? '', phone: c?.phone ?? '' }; }
    return { name: p.name.trim(), email: p.email.trim(), phone: p.phone.trim(), type };
  };

  const create = async () => {
    setError(null);
    const c = personFields(client, 'client'), a = personFields(agent, 'agent');
    const record = {
      address: f.address.trim(), city: f.city.trim(), state: f.state.trim(), zip: f.zip.trim(), sqft: f.sqft.trim(), yearBuilt: f.yearBuilt.trim(),
      bedrooms: f.bedrooms.trim(), bathrooms: f.bathrooms.trim(), homeType: f.homeType, unitCount: f.homeType === 'Multi-Unit' ? f.unitCount.trim() : '',
      waterSource: f.waterSource, sewerType: f.sewerType, gasSupply: f.gasSupply,
      deltas: f.deltasNone ? 'None' : f.deltas.join(', '), inspectionType: f.inspectionType, date: f.date, scheduledTime: timeWords(f.time),
      clientName: c.name, clientEmail: c.email, clientPhone: c.phone, agentName: a.name, agentEmail: a.email, agentPhone: a.phone,
      inspector: leadName, lockboxCombo: f.lockbox.trim(), addOnServices: addonList.map(s => s.name).join(', '), addonInspector: vendorName, specialNotes: f.notes.trim(),
    };
    setBusy(true);
    try {
      const { data } = await workspace.auth.getSession();
      const res = await fetch('/api/inspections/new', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ device: webDevice(), templateId, record, leadId: leadId || null, notes: f.notes, today: localToday(),
          extras: { waterSource: f.waterSource || undefined, sewerType: f.sewerType || undefined, gasSupply: f.gasSupply || undefined,
            lockbox: f.lockbox.trim() || undefined, addOns: record.deltas || undefined, addOnServices: record.addOnServices || undefined,
            addonSpecialist: vendorName || undefined, agentName: a.name || undefined, agentEmail: a.email || undefined, agentPhone: a.phone || undefined } }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) { setError(out?.error ?? 'The inspection was not created. Try again.'); return; }
      const warnings: string[] = [...(out.warnings ?? [])];
      // As the phone does after saving: the people into Contacts, the job's order — then the draft invoice (ruling 2).
      let orderId: string | null = null;
      if (contacts) {
        try {
          const clientId = client.mode === 'pick' && client.id ? client.id : c.name ? await addContact({ type: 'client', name: c.name, email: c.email, phone: c.phone }) : null;
          const agentId = agent.mode === 'pick' && agent.id ? agent.id
            : agent.mode === 'new' && a.name ? await addContact({ type: 'agent', name: a.name, email: a.email, phone: a.phone }) : null;
          // The job's source — the phone's own rule (crmHome.sourceFields): a job with an agent came from that agent
          // unless something else was picked.
          orderId = await orderForJob({ inspectionId: out.id, contactId: clientId, address: f.address, date: f.date, packageId: base?.id ?? null,
            source: sourceFields(came, sources, agentId) });
        } catch (e) { warnings.push(`Contacts and the job’s order were not saved: ${(e as Error).message}`); }
      } else warnings.push('Contacts and the job’s order were not saved — your account has no access to Contacts.');
      if (orderId && (base || addonList.length)) {
        try {
          const lines = [...(base ? [{ description: base.name, quantity: 1, unit_cents: cents(priceNum) }] : []),
            ...addonList.map(s => ({ description: s.name, quantity: 1, unit_cents: cents(s.price) }))];
          await draftInvoiceFor(orderId, lines);
        } catch (e) { warnings.push(`The draft invoice was not created: ${(e as Error).message}`); }
      }
      setDone({ id: out.id, warnings });
    } catch { setError('The inspection was not created. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  if (allowed === null && !loadErr) return <Page><Loading /></Page>;
  if (loadErr) return <Page><ErrorBox message={loadErr} /></Page>;
  if (!allowed) return <Page><PageHeader title="New inspection" /><ErrorBox message="You don’t have “Add inspections”. Ask your company owner." /></Page>;
  if (done) return (
    <Page>
      <PageHeader title="Inspection created" subtitle={`It will be on ${leadName || 'the inspector'}’s phone at the next sync.`} />
      {done.warnings.length > 0 && <Card title="Not everything was saved"><ul className="list-disc space-y-1 pl-5 text-sm text-body">{done.warnings.map(w => <li key={w}>{w}</li>)}</ul></Card>}
      <div className="mt-4 flex gap-2">
        <Link className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface" href={`/app/inspections/${encodeURIComponent(done.id)}`}>Open the inspection</Link>
        <button className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-ink" onClick={() => window.location.assign('/app/inspections/new')}>Start another</button>
      </div>
    </Page>
  );

  const personPicker = (p: Person, setP: (x: Person) => void, type: 'client' | 'agent', label: string, required: boolean) => (
    <div className="space-y-2">
      <span className={LABEL}>{label}{required ? ' *' : ''}</span>
      {contacts && <div className="flex gap-2 text-xs">
        <button type="button" className={CHIP(p.mode === 'pick')} onClick={() => setP({ ...p, mode: 'pick' })}>From Contacts</button>
        <button type="button" className={CHIP(p.mode === 'new')} onClick={() => setP({ ...p, mode: 'new', id: '' })}>New</button>
      </div>}
      {contacts && p.mode === 'pick' ? (
        <select className={FIELD} aria-label={label} value={p.id} onChange={e => setP({ ...p, id: e.target.value })}>
          <option value="">— Pick a {type} —</option>
          {people(type).map(c => <option key={c.id} value={c.id}>{c.name}{c.brokerage ? ` · ${c.brokerage}` : ''}</option>)}
        </select>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={FIELD} aria-label={`${label} name`} placeholder="Full name" value={p.name} onChange={e => setP({ ...p, name: e.target.value, mode: 'new' })} />
          <input className={FIELD} aria-label={`${label} email`} placeholder="email@domain.com" value={p.email} onChange={e => setP({ ...p, email: e.target.value, mode: 'new' })} />
          <input className={FIELD} aria-label={`${label} phone`} placeholder="(555) 000-0000" value={p.phone} onChange={e => setP({ ...p, phone: e.target.value, mode: 'new' })} />
        </div>
      )}
    </div>
  );

  return (
    <Page>
      <PageHeader title="New inspection" subtitle={<Link href="/app/inspections" className="text-accent-ink">← Inspections</Link>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <Card title="Property and time">
            <div className="space-y-3">
              <div><label className={LABEL} htmlFor="ni-addr">Address *</label><input id="ni-addr" className={FIELD} value={f.address} onChange={e => set('address', e.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className={LABEL} htmlFor="ni-city">City *</label><input id="ni-city" className={FIELD} value={f.city} onChange={e => set('city', e.target.value)} /></div>
                <div><label className={LABEL} htmlFor="ni-state">State *</label><input id="ni-state" className={FIELD} value={f.state} onChange={e => set('state', e.target.value)} /></div>
                <div><label className={LABEL} htmlFor="ni-zip">Zip *</label><input id="ni-zip" className={FIELD} value={f.zip} onChange={e => set('zip', e.target.value)} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className={LABEL} htmlFor="ni-date">Date *</label><input id="ni-date" type="date" className={FIELD} value={f.date} onChange={e => set('date', e.target.value)} /></div>
                <div><label className={LABEL} htmlFor="ni-time">Time *</label><input id="ni-time" type="time" className={FIELD} value={f.time} onChange={e => set('time', e.target.value)} /></div>
                <div><label className={LABEL} htmlFor="ni-lead">Inspector *</label>
                  <select id="ni-lead" className={FIELD} value={leadId} onChange={e => setLeadId(e.target.value)}>
                    {(members.length ? members : [{ id: access.userId, full_name: access.name ?? 'Me' } as MemberRow]).map(m => <option key={m.id} value={m.id}>{m.full_name ?? m.email ?? 'Member'}{m.id === access.userId ? ' (me)' : ''}</option>)}
                  </select></div>
              </div>
            </div>
          </Card>

          <Card title="Inspection type">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Inspection type">
                {typeNames.map(n => <button key={n} type="button" className={CHIP(f.inspectionType === n)} onClick={() => pickType(n)}>{n}</button>)}
              </div>
              <div><label className={LABEL} htmlFor="ni-tpl">Template *</label>
                <select id="ni-tpl" className={FIELD} value={templateId} onChange={e => setTemplateId(e.target.value)}>
                  <option value="">— Pick the inspection type first —</option>
                  {templateChoices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div><label className={LABEL} htmlFor="ni-yb">Year built *</label><input id="ni-yb" className={FIELD} inputMode="numeric" value={f.yearBuilt} onChange={e => set('yearBuilt', e.target.value)} /></div>
                <div><label className={LABEL} htmlFor="ni-sf">Sq ft *</label><input id="ni-sf" className={FIELD} inputMode="numeric" value={f.sqft} onChange={e => set('sqft', e.target.value)} /></div>
                <div><label className={LABEL} htmlFor="ni-bd">Bedrooms</label><input id="ni-bd" className={FIELD} value={f.bedrooms} onChange={e => set('bedrooms', e.target.value)} /></div>
                <div><label className={LABEL} htmlFor="ni-ba">Bathrooms</label><input id="ni-ba" className={FIELD} value={f.bathrooms} onChange={e => set('bathrooms', e.target.value)} /></div>
              </div>
              <div><span className={LABEL}>Home type *</span>
                <div className="flex flex-wrap gap-1.5">{HOME_TYPES.map(h => <button key={h} type="button" className={CHIP(f.homeType === h)} onClick={() => set('homeType', h)}>{h}</button>)}</div></div>
              {f.homeType === 'Multi-Unit' && <div className="max-w-[160px]"><label className={LABEL} htmlFor="ni-units">How many units</label><input id="ni-units" className={FIELD} inputMode="numeric" value={f.unitCount} onChange={e => set('unitCount', e.target.value)} /></div>}
              <div><span className={LABEL}>Also on the property *</span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={CHIP(f.deltasNone)} onClick={() => setF(p => ({ ...p, deltasNone: !p.deltasNone, deltas: [] }))}>None</button>
                  {DELTA_OPTIONS.map(d => <button key={d} type="button" className={CHIP(f.deltas.includes(d))} onClick={() => setF(p => ({ ...p, deltasNone: false, deltas: p.deltas.includes(d) ? p.deltas.filter(x => x !== d) : [...p.deltas, d] }))}>{d}</button>)}
                </div></div>
              <div className="grid gap-3 sm:grid-cols-3">
                {([['waterSource', 'Water', WATER_SOURCE_OPTIONS], ['sewerType', 'Sewer', SEWER_TYPE_OPTIONS], ['gasSupply', 'Gas', GAS_SUPPLY_OPTIONS]] as const).map(([k, l, opts]) => (
                  <div key={k}><label className={LABEL} htmlFor={`ni-${k}`}>{l}</label>
                    <select id={`ni-${k}`} className={FIELD} value={(f as any)[k]} onChange={e => set(k, e.target.value)}>
                      <option value="">Not given</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select></div>))}
              </div>
              <p className="text-xs text-muted">Utilities from the order. The inspector confirms or corrects them on site.</p>
            </div>
          </Card>

          <Card title="People">
            <div className="space-y-4">
              {personPicker(client, setClient, 'client', 'Client', true)}
              {personPicker(agent, setAgent, 'agent', 'Buyer’s agent', false)}
              {!contacts && <p className="text-xs text-muted">Your account has no access to Contacts, so people are typed in and not added to Contacts.</p>}
              {contacts && sources && (
                <SourcePicker idPrefix="ni" value={came} onChange={setCame} contacts={contacts} sources={sources}
                  agentId={agent.mode === 'pick' && agent.id ? agent.id : null} />
              )}
            </div>
          </Card>

          <Card title="Services">
            <div className="space-y-3">
              {services.length === 0 ? <p className="text-sm text-muted">No services yet. Add them under Company › Services &amp; prices.</p> : <>
                <div><label className={LABEL} htmlFor="ni-svc">Service</label>
                  <select id="ni-svc" className={FIELD} value={baseService} onChange={e => { setBaseService(e.target.value); setPrice(''); }}>
                    <option value="">No service picked</option>{services.map(s => <option key={s.id} value={s.id}>{s.name} · ${s.price.toFixed(2)}</option>)}
                  </select></div>
                {base && <div className="max-w-[180px]"><label className={LABEL} htmlFor="ni-price">Price for this job</label><input id="ni-price" className={FIELD} inputMode="decimal" placeholder={base.price.toFixed(2)} value={price} onChange={e => setPrice(e.target.value)} /></div>}
                <div><span className={LABEL}>Add-ons</span>
                  <div className="space-y-1">{services.filter(s => s.id !== baseService).map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={addons.has(s.id)} onChange={() => setAddons(p => new Set(p.has(s.id) ? [...p].filter(x => x !== s.id) : [...p, s.id]))} />{s.name} <span className="text-muted">· ${s.price.toFixed(2)}</span></label>))}
                  </div></div>
                {vendorsOk && addons.size > 0 && <div><label className={LABEL} htmlFor="ni-vendor">Vendor for the add-ons</label>
                  <select id="ni-vendor" className={FIELD} value={vendor} onChange={e => setVendor(e.target.value)}>
                    <option value="">None</option>{people('vendor').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>}
              </>}
            </div>
          </Card>

          <Card title="Access and notes">
            <div className="space-y-3">
              <div className="max-w-sm"><label className={LABEL} htmlFor="ni-lock">Lockbox / access</label><input id="ni-lock" className={FIELD} value={f.lockbox} onChange={e => set('lockbox', e.target.value)} /></div>
              <div><label className={LABEL} htmlFor="ni-notes">Notes for the inspector</label><textarea id="ni-notes" className={AREA} rows={3} value={f.notes} onChange={e => set('notes', e.target.value)} />
                <p className="mt-1 text-xs text-muted">Becomes the first entry in the job’s order notes, shared with the team.</p></div>
            </div>
          </Card>
        </div>

        <aside className="h-fit space-y-3 rounded-2xl border border-hairline bg-surface p-4 lg:sticky lg:top-4">
          <h2 className="text-sm font-semibold text-ink">Summary</h2>
          {base && <div className="flex justify-between text-sm"><span>{base.name}</span><span className="tabular-nums text-ink">${(Number.isFinite(priceNum) ? priceNum : 0).toFixed(2)}</span></div>}
          {addonList.map(s => <div key={s.id} className="flex justify-between text-sm"><span>{s.name}</span><span className="tabular-nums text-ink">${s.price.toFixed(2)}</span></div>)}
          {(base || addonList.length > 0) && <div className="flex justify-between border-t border-hairline pt-2 text-sm font-semibold text-ink"><span>Draft invoice</span><span className="tabular-nums">${total.toFixed(2)}</span></div>}
          <button className="w-full rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface hover:bg-ink/85 disabled:opacity-50" disabled={busy || !templateId} onClick={create}>{busy ? 'Creating…' : 'Create inspection'}</button>
          {error && <p role="alert" className="text-sm text-[#b42318]">{error}</p>}
          <p className="text-xs text-muted">Goes to the inspector’s phone at the next sync. A draft invoice is not sent until you send it from Invoices.</p>
        </aside>
      </div>
    </Page>
  );
}
