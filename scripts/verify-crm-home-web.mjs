#!/usr/bin/env node
// verify-crm-home-web — the website's CRM home and "where the job came from" (owner 2026-11-05: "when clicked from menu,
// it should open a CRM page similar to Salesforce home page … Marketing, Leads, Campaigns, Contacts, Accounts … have a
// page saying in construction"; CRM home mockup approved, "use recommendations"; "Add where the job came from", #114).
//
//   node scripts/verify-crm-home-web.mjs
//
//   §1 the menu and routes: "CRM" follows the crm permission; /app/crm and each tab route render the one CRM component
//      with their own tab; /app/contacts lands on CRM › Contacts; Follow-ups and Agents have no tab of their own
//   §2 the planned tabs (Leads, Campaigns, Marketing) are marked and open a page that says what they will do — never
//      an empty page (EXECUTED: PLANNED_TABS)
//   §3 the home's numbers and lists (EXECUTED, lib/crm/crmHome.ts): jobs this month, invoiced this month (no drafts, no
//      voids, none without the Invoices permission), follow-ups due within a week, overdue invoices, today and
//      tomorrow, top referrers in 90 days (the recorded referrer first, else the job's agent; cancelled jobs never),
//      recently added, accounts grouped from the brokerage / company field
//   §4 "Needs you" shows overdue invoices only to people who may read invoices; bookings confirm through confirm_booking
//   §5 where the job came from: offered only when the server answers crm_order_sources(); nothing sent otherwise; a job
//      with an agent and no source came from that agent; 'booking_page' is the server's alone; detail ≤ 200 (EXECUTED)
//   §6 the same function on the phone: lib/crm/crmHome.ts is a byte copy of ledrix-app src/core/crm/crmHome.ts, and the
//      website's New inspection and Schedule a job shape the order's source with it
//   §7 mutations — each rule broken once must fail here
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ? join(ROOT, process.env.LEDRIX_APP) : join(ROOT, '..', 'ledrix-app');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const TABS = ['contacts', 'accounts', 'schedule', 'leads', 'campaigns', 'marketing'];
const SRC = {
  home: read('lib/crm/crmHome.ts'), api: read('lib/crm/api.ts'), app: read('components/crm/CrmApp.tsx'),
  shell: read('components/workspace/WorkspaceShell.tsx'), redirect: read('app/app/contacts/page.tsx'), root: read('app/app/crm/page.tsx'),
  newJob: read('app/app/inspections/new/page.tsx'), office: read('lib/office/api.ts'),
  ...Object.fromEntries(TABS.map(t => [`route_${t}`, read(`app/app/crm/${t}/page.tsx`)])),
};
const dir = mkdtempSync(join(tmpdir(), 'crmhome-'));
let run = 0;

async function loadHome(src) {
  const f = join(dir, `home${++run}.mjs`);
  writeFileSync(f, stripTypeScriptTypes(src.home));
  return import(pathToFileURL(f).href);
}
async function loadApi(src) {
  const k = ++run;
  const home = join(dir, `h${k}.mjs`), core = join(dir, `c${k}.mjs`), api = join(dir, `a${k}.mjs`);
  writeFileSync(home, stripTypeScriptTypes(src.home));
  writeFileSync(core, stripTypeScriptTypes(read('lib/crm/contactsCore.ts')));
  writeFileSync(api, stripTypeScriptTypes(src.api
    .replace("import { workspace } from '@/lib/workspace/client';", 'const workspace = new Proxy({}, { get: (_, k) => globalThis.__ws[k] });')
    .replace("from '@/lib/crm/contactsCore';", `from ${JSON.stringify(pathToFileURL(core).href)};`)
    .replace("from '@/lib/crm/crmHome';", `from ${JSON.stringify(pathToFileURL(home).href)};`)));
  return import(pathToFileURL(api).href);
}
/** A stand-in Supabase client: records selects and rpc calls; answers from `answers`. */
function fakeServer(answers = {}) {
  const calls = [];
  const builder = (table) => {
    const q = { table, ops: [] };
    calls.push(q);
    const chain = new Proxy({}, {
      get(_, op) {
        if (op === 'then') { const res = answers.query?.(q) ?? { data: [], error: null }; return (ok, bad) => Promise.resolve(res).then(ok, bad); }
        return (...args) => { q.ops.push([op, ...args]); return chain; };
      },
    });
    return chain;
  };
  return { calls, from: (t) => builder(t), rpc: async (name, args) => { calls.push({ rpc: name, args }); return answers.rpc?.(name, args) ?? { data: null, error: null }; } };
}

async function suite(src) {
  const out = [];
  const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
  const app = strip(src.app), shell = strip(src.shell);

  // §1
  ok('§1 the sidebar says CRM, opens /app/crm, and follows the crm permission',
    /\{ href: '\/app\/crm', label: 'CRM', show: canCrm \}/.test(shell) && /setCanCrm\(!companyId \|\| c\?\.crm === true\)/.test(shell) && !/href: '\/app\/contacts'/.test(shell));
  ok('§1 /app/crm is the CRM home', /return <CrmApp tab="home" \/>;/.test(src.root));
  ok('§1 each tab route renders the CRM with its own tab', TABS.every(t => new RegExp(`return <CrmApp tab="${t}" />;`).test(src[`route_${t}`])), TABS.filter(t => !new RegExp(`tab="${t}"`).test(src[`route_${t}`])).join());
  ok('§1 /app/contacts lands on CRM › Contacts', /redirect\('\/app\/crm\/contacts'\)/.test(src.redirect));
  const tabList = [...app.matchAll(/\{ tab: '([a-z]+)', label: '([A-Za-z]+)', href: '([^']+)'(, planned: true)? \}/g)].map(m => `${m[1]}:${m[2]}:${m[3]}${m[4] ? ':planned' : ''}`);
  ok('§1 the CRM tabs: Home · Contacts · Accounts · Schedule · Leads · Campaigns · Marketing (the last three planned)',
    JSON.stringify(tabList) === JSON.stringify(['home:Home:/app/crm', 'contacts:Contacts:/app/crm/contacts', 'accounts:Accounts:/app/crm/accounts',
      'schedule:Schedule:/app/crm/schedule', 'leads:Leads:/app/crm/leads:planned', 'campaigns:Campaigns:/app/crm/campaigns:planned', 'marketing:Marketing:/app/crm/marketing:planned']), JSON.stringify(tabList));
  ok('§1 Follow-ups and Agents have no tab of their own', !/FollowupsTab|AgentsTab|'followups'|'agents'/.test(app));
  ok('§1 the CRM follows the crm permission', /if \(access\.companyId && caps\?\.crm !== true\) \{ setState\(\{ kind: 'denied' \}\); return; \}/.test(app));

  let H;
  try { H = await loadHome(src); } catch (e) { ok('§2 crmHome runs', false, String(e)); return out; }

  // §2
  ok('§2 each planned tab says what it will do', ['leads', 'campaigns', 'marketing'].every(t => H.PLANNED_TABS[t]?.title && H.PLANNED_TABS[t].line && H.PLANNED_TABS[t].will.length >= 3));
  ok('§2 a planned tab opens its explanation page, which points back to what works',
    /\{isPlanned\(tab\) && <PlannedPage tab=\{tab\} \/>\}/.test(app) && /const p = PLANNED_TABS\[tab\];/.test(app)
    && /\{p\.will\.map\(w => <li key=\{w\}>\{w\}<\/li>\)\}/.test(app) && /href="\/app\/crm\/contacts">Contacts<\/Link>/.test(app));

  // §3 — a small company on 2026-11-05
  const today = '2026-11-05';
  const contacts = [
    { id: 'a1', type: 'agent', name: 'Dana', brokerage: 'Summit Realty', created_at: '2026-03-01T00:00:00Z' },
    { id: 'a2', type: 'agent', name: 'Eli', brokerage: '  summit   realty ', created_at: '2026-10-30T00:00:00Z' },
    { id: 'a3', type: 'agent', name: 'Fay', brokerage: 'Summit Realty Group', created_at: '2026-06-01T00:00:00Z' },
    { id: 'a4', type: 'agent', name: 'Gus', brokerage: null, created_at: '2026-01-01T00:00:00Z' },
    { id: 'v1', type: 'vendor', name: 'Ray', brokerage: 'Ridgeline Radon', created_at: '2026-11-04T00:00:00Z' },
    { id: 'c1', type: 'client', name: 'Ortiz', brokerage: 'Summit Realty', created_at: '2026-10-22T00:00:00Z' },
  ];
  const orders = [
    { id: 'o1', contact_id: 'c1', source_contact_id: 'a1', source: 'agent', order_date: '2026-11-05', status: 'scheduled' },
    { id: 'o2', contact_id: 'a2', order_date: '2026-11-06', status: 'scheduled' },                       // before #114: the agent is the contact
    { id: 'o3', contact_id: 'c1', source_contact_id: 'a1', order_date: '2026-10-20', status: 'completed' },
    { id: 'o4', contact_id: 'c1', source_contact_id: 'a1', order_date: '2026-10-21', status: 'cancelled' },  // cancelled: never counts
    { id: 'o5', contact_id: 'c1', source_contact_id: 'a3', order_date: '2026-07-01', status: 'completed' },  // older than 90 days
    { id: 'o6', contact_id: 'c1', order_date: '2026-11-08', status: 'scheduled' },                        // a client's job: no referrer
  ];
  const inv = (o) => ({ id: 'i', order_id: null, status: 'sent', shown_status: 'sent', issued_on: '2026-11-02', due_on: '2026-11-20', total_cents: 45000, paid_cents: 0, balance_cents: 45000, ...o });
  const invoices = [
    inv({ id: 'i1', order_id: 'o3', shown_status: 'paid', paid_cents: 45000, balance_cents: 0 }),
    inv({ id: 'i2', order_id: 'o1', status: 'draft', shown_status: 'draft', issued_on: '2026-11-04' }),
    inv({ id: 'i3', order_id: 'o5', shown_status: 'overdue', issued_on: '2026-07-02', due_on: '2026-07-16', total_cents: 39000, balance_cents: 39000 }),
    inv({ id: 'i4', status: 'void', shown_status: 'void', issued_on: '2026-11-03', total_cents: 99900 }),
    inv({ id: 'i5', shown_status: 'overdue', issued_on: '2026-10-01', due_on: '2026-10-15', total_cents: 20000, balance_cents: 20000 }),
  ];
  const followups = [
    { id: 'f1', due_date: '2026-10-30', completed: false }, { id: 'f2', due_date: '2026-11-12', completed: false },
    { id: 'f3', due_date: '2026-11-13', completed: false }, { id: 'f4', due_date: '2026-11-01', completed: true },
  ];
  const k = H.homeKpis({ orders, invoices, followups, bookings: 2, today });
  ok('§3 jobs this month vs last (cancelled jobs never count)', k.jobsThisMonth === 3 && k.jobsLastMonth === 1, JSON.stringify(k));
  ok('§3 invoiced this month: issued this month, no drafts, no voids', k.invoicedThisMonthCents === 45000 && k.paidThisMonthCents === 45000, JSON.stringify(k));
  ok('§3 no Invoices permission → no money on the home', H.homeKpis({ orders, invoices: null, followups, bookings: 0, today }).invoicedThisMonthCents === null);
  ok('§3 follow-ups due: open, within a week, overdue counted', k.followupsDue === 2 && k.followupsOverdue === 1
    && JSON.stringify(H.followupsDue(followups, today).map(f => f.id)) === '["f1","f2"]');
  ok('§3 booking requests waiting', k.bookingsWaiting === 2);
  ok('§3 overdue invoices, oldest first', JSON.stringify(H.overdueInvoices(invoices).map(i => i.id)) === '["i3","i5"]');
  ok('§3 today and tomorrow', JSON.stringify(H.todayTomorrow(orders, today).map(o => o.id)) === '["o1","o2"]');
  ok('§3 recently added, newest first', JSON.stringify(H.recentlyAdded(contacts, 3).map(c => c.id)) === '["v1","a2","c1"]');
  const top = H.topReferrers(orders, contacts, today);
  ok('§3 top referrers in 90 days: recorded referrer, else the job’s agent; never a cancelled job or a client',
    JSON.stringify(top.map(r => [r.contactId, r.count])) === '[["a1",2],["a2",1]]', JSON.stringify(top));
  const acc = H.accountsOf(contacts, orders, invoices, today);
  const summit = acc.find(a => a.key === 'brokerage:summit realty');
  ok('§3 accounts: one per brokerage as typed (case and spaces ignored, no guessing)',
    acc.length === 3 && summit && JSON.stringify(summit.contactIds) === '["a1","a2"]' && acc.some(a => a.key === 'brokerage:summit realty group'), JSON.stringify(acc.map(a => a.key)));
  ok('§3 a vendor’s company is its own kind; a client’s brokerage and an agent without one are not accounts',
    acc.some(a => a.kind === 'vendor' && a.name === 'Ridgeline Radon') && !acc.some(a => a.contactIds.includes('c1') || a.contactIds.includes('a4')));
  ok('§3 an account’s referrals and invoiced (live invoices of the jobs it sent)', !!summit && summit.referrals === 3 && summit.referralsRecent === 3 && summit.invoicedCents === 90000, JSON.stringify(summit));
  ok('§3 no Invoices permission → accounts show no money', H.accountsOf(contacts, orders, null, today).every(a => a.invoicedCents === null));

  // §4
  ok('§4 Needs you shows overdue invoices only from the invoices this person may read',
    /const overdue = data\.homeInvoices \? overdueInvoices\(data\.homeInvoices\) : \[\];/.test(app));
  ok('§4 a booking is confirmed through the server’s confirm_booking (lib/crm/api), never written here',
    /act\(\(\) => confirmBooking\(b\), 'Booking confirmed/.test(app) && !/\.(insert|update|upsert|delete|rpc)\s*\(|workspace\./.test(app));
  let A;
  try { A = await loadApi(src); } catch (e) { ok('§4 lib/crm/api runs', false, String(e)); return out; }
  globalThis.__ws = fakeServer({ query: () => ({ data: null, error: { code: '42501', message: 'permission denied for view invoice_list' } }) });
  ok('§4 without the Invoices permission the home gets no invoices (null)', (await A.loadHomeInvoices()) === null);

  // §5
  ok('§5 no #114 (error, missing, junk) → the field is hidden', H.acceptedOrderSources(null) === null && H.acceptedOrderSources({}) === null && H.acceptedOrderSources(['nope']) === null);
  const all = H.acceptedOrderSources(['agent', 'booking_page', 'repeat_client', 'search', 'social', 'referral', 'other']);
  ok('§5 #114 → every source', JSON.stringify(all) === JSON.stringify(H.ORDER_SOURCES));
  ok('§5 nothing is sent when the server takes no source', JSON.stringify(H.sourceFields({ source: 'search', referrerId: null, detail: 'Google' }, null, 'a1')) === '{}');
  ok('§5 a job with an agent and no source came from that agent', JSON.stringify(H.sourceFields(H.NO_SOURCE, all, 'a1')) === '{"source":"agent","source_contact_id":"a1","source_detail":null}');
  ok('§5 a picked source wins; detail trimmed and kept ≤ 200',
    JSON.stringify(H.sourceFields({ source: 'search', referrerId: null, detail: '  Google  ' }, all, 'a1')) === '{"source":"search","source_contact_id":null,"source_detail":"Google"}'
    && H.sourceFields({ source: 'other', referrerId: null, detail: 'x'.repeat(250) }, all).source_detail.length === 200);
  ok('§5 nothing picked and no agent → nothing sent', JSON.stringify(H.sourceFields(H.NO_SOURCE, all, null)) === '{}');
  ok('§5 "Booking page" is the server’s alone (not offered)', !H.PICKABLE_SOURCES.includes('booking_page') && H.PICKABLE_SOURCES.length === 6);
  ok('§5 a source the server does not take is not sent', JSON.stringify(H.sourceFields({ source: 'social', referrerId: null, detail: '' }, ['agent'], null)) === '{}');
  ok('§5 the job row reads "Agent · Dana · …"', H.sourceWords({ source: 'agent', source_contact_id: 'a1', source_detail: 'open house' }, id => (id === 'a1' ? 'Dana' : undefined)) === 'Agent · Dana · open house'
    && H.sourceWords({ source: null }, () => undefined) === '');
  globalThis.__ws = fakeServer({ rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }) });
  ok('§5 before #114 the page is told: no sources', (await A.loadOrderSources()) === null);
  globalThis.__ws = fakeServer({ rpc: () => ({ data: ['agent', 'booking_page', 'repeat_client', 'search', 'social', 'referral', 'other'], error: null }) });
  ok('§5 with #114 it is told every source', (await A.loadOrderSources())?.length === 7);
  const s1 = fakeServer({ query: () => ({ data: [], error: null }) });
  globalThis.__ws = s1; await A.loadOrders(false);
  const s2 = fakeServer({ query: () => ({ data: [], error: null }) });
  globalThis.__ws = s2; await A.loadOrders(true);
  const cols = (s) => s.calls.find(c => c.table === 'crm_orders')?.ops.find(o => o[0] === 'select')?.[1] ?? '';
  ok('§5 the source columns are read only when the server takes them', !/source/.test(cols(s1)) && /source, source_contact_id, source_detail/.test(cols(s2)));
  ok('§5 the CRM asks the server first and reads the columns only then', /const orders = await loadOrders\(sources != null\);/.test(app));
  ok('§5 "Came from" is drawn only when the server takes a source',
    /\{sources && <div className="sm:col-span-4"><SourcePicker /.test(app) && /\{data\.sources && <th className="px-2">Came from<\/th>\}/.test(app)
    && /\{contacts && sources && \(\s*<SourcePicker /.test(strip(src.newJob)));
  const s3 = fakeServer({ query: () => ({ data: { id: 'x' }, error: null }) });
  globalThis.__ws = s3;
  await A.scheduleJob({ contactId: 'a1', address: '1 Elm', date: '2026-11-07', source: H.sourceFields(H.NO_SOURCE, all, 'a1') });
  const ins = s3.calls.find(c => c.table === 'crm_orders')?.ops.find(o => o[0] === 'insert')?.[1];
  ok('§5 Schedule a job sends the source with the order (and no fee)', ins?.source === 'agent' && ins?.source_contact_id === 'a1' && !('fee' in ins), JSON.stringify(ins));

  // §6
  const phone = join(APP, 'src/core/crm/crmHome.ts');
  if (existsSync(phone)) ok('§6 lib/crm/crmHome.ts is a byte copy of the phone’s', readFileSync(phone, 'utf8') === src.home);
  else if (!process.env.ALLOW_NO_APP) ok('§6 ledrix-app beside this checkout (set ALLOW_NO_APP=1 to skip)', false, phone);
  ok('§6 New inspection shapes the order’s source with the phone’s sourceFields',
    /source: sourceFields\(came, sources, agentId\) \}\);/.test(src.newJob) && /\.\.\.\(j\.source \?\? \{\}\) \}\)\.select\('id'\)\.single\(\);/.test(src.office));
  ok('§6 Schedule a job does too (a job booked for an agent came from that agent)',
    /source: sourceFields\(came, sources, agentId\) \}\); \}\}>/.test(app));
  return out;
}

let pass = 0, fail = 0;
const report = (rs) => { for (const r of rs) { if (r.pass) { pass++; console.log(`  ✓ ${r.name}`); } else { fail++; console.log(`  ✗ ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`); } } };
console.log('verify-crm-home-web');
report(await suite(SRC));

console.log('\n§7 mutations');
const MUTANTS = [
  { f: 'shell', from: "{ href: '/app/crm', label: 'CRM', show: canCrm }", to: "{ href: '/app/crm', label: 'CRM', show: true }", why: 'the CRM menu ignores the permission', expect: /^§1 the sidebar/ },
  { f: 'redirect', from: "redirect('/app/crm/contacts')", to: "redirect('/app/crm')", why: '/app/contacts lands somewhere else', expect: /^§1 \/app\/contacts/ },
  { f: 'route_leads', from: 'return <CrmApp tab="leads" />;', to: 'return <CrmApp tab="home" />;', why: 'a tab route shows the wrong tab', expect: /^§1 each tab route/ },
  { f: 'app', from: "{ tab: 'leads', label: 'Leads', href: '/app/crm/leads', planned: true },", to: "{ tab: 'leads', label: 'Leads', href: '/app/crm/leads' },", why: 'a planned tab not marked', expect: /^§1 the CRM tabs/ },
  { f: 'app', from: '{isPlanned(tab) && <PlannedPage tab={tab} />}', to: '', why: 'a planned tab opens an empty page', expect: /^§2 a planned tab opens/ },
  { f: 'home', from: "      'Convert a lead into a client and a scheduled job in one step'],", to: '      ],', why: 'a planned tab says too little', expect: /^§2 each planned tab/ },
  { f: 'home', from: "const live = (o: HomeOrder) => o.status !== 'cancelled';", to: 'const live = (o: HomeOrder) => true;', why: 'cancelled jobs count', expect: /^§3 jobs this month|^§3 top referrers/ },
  { f: 'home', from: "i.status !== 'draft' && i.shown_status !== 'draft';", to: 'true;', why: 'drafts counted as invoiced', expect: /^§3 invoiced this month/ },
  { f: 'home', from: "  return o.contact_id && typeOf(o.contact_id) === 'agent' ? o.contact_id : null;", to: '  return o.contact_id ?? null;', why: 'a client counted as a referrer', expect: /^§3 top referrers/ },
  { f: 'home', from: '    if (o.order_date < since) continue;', to: '', why: 'referrers ignore the 90-day window', expect: /^§3 top referrers/ },
  { f: 'home', from: "export const accountKey = (kind: AccountKind, company: string) => `${kind}:${company.trim().replace(/\\s+/g, ' ').toLowerCase()}`;",
    to: 'export const accountKey = (kind: AccountKind, company: string) => `${kind}:${company}`;', why: 'accounts split on spacing and case', expect: /^§3 accounts: one per brokerage/ },
  { f: 'home', from: "    if (!company || (c.type !== 'agent' && c.type !== 'vendor')) continue;", to: '    if (!company) continue;', why: 'a client’s brokerage becomes an account', expect: /^§3 a vendor’s company|^§3 accounts/ },
  { f: 'home', from: "  return followups.filter(f => !f.completed && f.due_date <= until)", to: '  return followups.filter(f => !f.completed)', why: 'follow-ups due ignore the week', expect: /^§3 follow-ups due/ },
  { f: 'app', from: 'const overdue = data.homeInvoices ? overdueInvoices(data.homeInvoices) : [];', to: 'const overdue = overdueInvoices(data.invoices ?? []);', why: 'Needs you ignores the Invoices permission', expect: /^§4 Needs you/ },
  { f: 'api', from: '  if (res.error) return null;\n  return ((res.data ?? []) as unknown as HomeInvoiceRow[])', to: '  return ((res.data ?? []) as unknown as HomeInvoiceRow[])', why: 'a refusal reads as no invoices instead of no permission', expect: /^§4 without the Invoices/ },
  { f: 'home', from: '  if (!Array.isArray(answer)) return null;', to: '  if (!Array.isArray(answer)) return [...ORDER_SOURCES];', why: 'the field offered without #114', expect: /^§5 no #114/ },
  { f: 'home', from: '  if (!accepted) return {};', to: "  if (!accepted) accepted = ORDER_SOURCES;", why: 'a source sent to a server without #114', expect: /^§5 nothing is sent/ },
  { f: 'home', from: "  if (!source && agentContactId) { source = 'agent'; referrer = agentContactId; }", to: '', why: 'an agent’s job not credited to the agent', expect: /^§5 a job with an agent/ },
  { f: 'home', from: "export const PICKABLE_SOURCES: readonly OrderSource[] = ORDER_SOURCES.filter(s => s !== 'booking_page');", to: 'export const PICKABLE_SOURCES: readonly OrderSource[] = ORDER_SOURCES;', why: 'a person may pick "Booking page"', expect: /^§5 "Booking page"/ },
  { f: 'home', from: '  const detail = choice.detail.trim().slice(0, SOURCE_DETAIL_MAX);', to: '  const detail = choice.detail;', why: 'detail not trimmed or limited', expect: /^§5 a picked source wins/ },
  { f: 'api', from: "select(ORDER_COLS + (withSource ? SOURCE_COLS : ''))", to: 'select(ORDER_COLS + SOURCE_COLS)', why: 'the source columns read before #114', expect: /^§5 the source columns/ },
  { f: 'app', from: 'const orders = await loadOrders(sources != null);', to: 'const orders = await loadOrders(true);', why: 'the CRM reads the columns without asking', expect: /^§5 the CRM asks/ },
  { f: 'app', from: '{sources && <div className="sm:col-span-4"><SourcePicker', to: '{<div className="sm:col-span-4"><SourcePicker', why: '"Came from" drawn without #114', expect: /^§5 "Came from" is drawn/ },
  { f: 'api', from: "notes: clean(j.notes), ...(j.source ?? {}) });", to: 'notes: clean(j.notes) });', why: 'Schedule a job drops the source', expect: /^§5 Schedule a job sends/ },
  { f: 'newJob', from: 'source: sourceFields(came, sources, agentId) });', to: "source: { source: 'agent' } });", why: 'New inspection makes its own source', expect: /^§6 New inspection/ },
  { f: 'home', from: "  agent: 'Agent', booking_page: 'Booking page',", to: "  agent: 'Agent ', booking_page: 'Booking page',", why: 'the copy drifts from the phone’s', expect: /^§6 lib\/crm\/crmHome\.ts is a byte copy|^§5 the job row/ },
];
for (const m of MUTANTS) {
  if (SRC[m.f].split(m.from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${m.why}`); continue; }
  const rs = await suite({ ...SRC, [m.f]: SRC[m.f].replace(m.from, m.to) });
  if (rs.some(r => !r.pass && m.expect.test(r.name))) { pass++; console.log(`  ✓ caught: ${m.why}`); } else { fail++; console.log(`  ✗ NOT caught: ${m.why}`); }
}
console.log(`\n${fail ? '✗' : '✓'} verify-crm-home-web: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
