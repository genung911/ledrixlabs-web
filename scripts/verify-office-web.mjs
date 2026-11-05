#!/usr/bin/env node
// verify-office-web — the website's office pages (owner 2026-11-05: "Move all the office/admin work to be done on web as
// well as phone"; office pages mockup, "use all recommendations"):
//   §1 WHO: start a job = add_inspections (or no company); Services & prices = owner, admin or "company settings";
//      Payments = the owner only — executed on lib/office/access.ts, and the sidebar, button and pages use exactly these
//   §2 THE KEY: the Stripe key is sent through set_stripe_secret_key and never read back, rendered or kept — only
//      stripe_key_status is read, and the page clears its field after every save
//   §3 MONEY: a new job's price comes from Services & prices; its invoice is a DRAFT (create_invoice + set_invoice_lines)
//      and is never sent from here; the job's order carries no fee
//   §4 THE JOB IS THE PHONE'S: lib/newJob/create.ts, executed against a stand-in server and composer — it asks the
//      server what a phone asks, hands the composer the company's own template and hidden items, writes the composed
//      rows where a phone's first sync writes them, as the person, and refuses (writing nothing) without the
//      permission, with a template of another company, or with the form incomplete
//   §5 THE BOOKING PAGE: the public page lists the company's prices once the view names the company, else the page
//      owner's; Services & prices reads and writes the company page through #115's functions, the own row before it
//   §6 the phone's choices: the form's lists equal ledrix-app's (home types, extras, utilities, the stock templates)
//   §7 mutations — each must turn the suite red (in memory; nothing is written under the repository)
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ? join(ROOT, process.env.LEDRIX_APP) : join(ROOT, '..', 'ledrix-app');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const SRC = {
  access: read('lib/office/access.ts'), api: read('lib/office/api.ts'), create: read('lib/newJob/create.ts'), intake: read('lib/newJob/intake.ts'),
  route: read('app/api/inspections/new/route.ts'), newPage: read('app/app/inspections/new/page.tsx'), services: read('app/app/company/services/page.tsx'),
  payments: read('app/app/company/payments/page.tsx'), shell: read('components/workspace/WorkspaceShell.tsx'), button: read('components/office/NewInspectionButton.tsx'),
  book: read('app/book/[slug]/page.tsx'),
};
const dir = mkdtempSync(join(tmpdir(), 'officeweb-'));
let run = 0;
const mod = async (text, rewrite = (s) => s) => { const f = join(dir, `m${++run}.mjs`); writeFileSync(f, stripTypeScriptTypes(rewrite(text))); return import(pathToFileURL(f).href); };

const UID = '00000000-0000-4000-8000-00000000a001', CO = '00000000-0000-4000-8000-0000000c0a00', OTHER = '00000000-0000-4000-8000-0000000c0b00';
const TPL = '00000000-0000-4000-8000-0000000e0001', LEAD = '00000000-0000-4000-8000-00000000a004';
const RECORD = { address: '1 Main St', city: 'Boise', state: 'ID', zip: '83702', sqft: '2400', yearBuilt: '1978', homeType: 'Site-Built', deltas: 'None',
  inspectionType: 'Full Home Inspection', scheduledTime: '9:00 AM', clientName: 'Ann Buyer', clientEmail: 'ann@example.com' };

/** A stand-in server for create.ts: answers by URL, records every request. */
function server({ addInspections = true, templateCompany = CO, insertRows = 1 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = String(url), method = init.method ?? 'GET';
    calls.push({ url: u, method, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.endsWith('/auth/v1/user')) return json(200, { id: UID, email: 'owner@example.com' });
    if (u.includes('/rest/v1/inspector_profiles')) return json(200, [{ company_id: CO, company_name: 'Acme', full_name: 'Kelly' }]);
    if (u.endsWith('/rpc/my_capabilities')) return json(200, { add_inspections: addInspections });
    if (u.includes('/rest/v1/company_templates')) return json(200, u.includes(`company_id=eq.${templateCompany}`) && templateCompany === CO
      ? [{ id: TPL, name: 'Full Home', base: 'internachi', template: { systems: [] }, updated_at: '2026-11-01T00:00:00Z', deleted_at: null }] : []);
    if (u.includes('/rest/v1/company_node_overrides')) return json(200, [{ hidden_ids: ['cooling_x'] }]);
    if (/select=\w+&limit=0/.test(u)) return json(u.includes('staged_limitation') ? 400 : 200, []);
    if (u.endsWith('/rpc/inspection_values_kinds')) return json(200, ['condition', 'spec', 'limitation']);   // a server before #105
    if (u.endsWith('/rpc/inspection_document_keys')) return json(200, ['order_notes']);
    if (u.includes('/rest/v1/inspections?on_conflict=id') && method === 'POST') return json(201, Array.from({ length: insertRows }, () => ({ id: 'insp_web_1' })));
    if (u.includes('/rest/v1/inspection_templates') && method === 'POST') return json(201, null);
    if (u.includes('/rest/v1/inspections?id=eq.') && method === 'PATCH') return json(200, [{ id: 'insp_web_1' }]);
    if (u.endsWith('/rpc/put_inspection_values') || u.endsWith('/rpc/put_inspection_documents')) return json(200, { accepted: [], refused: [] });
    return json(404, null);
  };
  const composed = [];
  const loadComposer = async () => ({ createComposer: () => ({ composeNewInspection: async (a) => {
    composed.push(a);
    return { id: a.input.id, record: a.input.record, templateName: 'Full Home',
      rows: { inspection: { id: a.input.id, inspector_id: a.userId }, assignment: a.input.leadId ? { assigned_inspector_id: a.input.leadId } : null,
        template: { inspection_id: a.input.id, snapshot: { systems: [] } }, values: [{ structure: 'main', key: 'system:roofing', kind: 'limitation', section: 'roofing', value: {} }],
        documents: [{ key: 'order_notes', payload: [] }] } };
  } }) });
  return { calls, composed, deps: { supaUrl: 'https://db.example', anonKey: 'anon', token: 'tok', fetch, loadComposer, newId: () => 'insp_web_1' } };
}

async function suite(S) {
  const out = [];
  const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });

  // §1
  const A = await mod(S.access);
  const own = { companyId: CO, role: 'owner' }, adm = { companyId: CO, role: 'admin' }, off = { companyId: CO, role: 'office' }, ins = { companyId: CO, role: 'inspector' }, solo = { companyId: null, role: 'inspector' };
  ok('§1 starting a job follows add_inspections (or no company)', A.mayStartJobs(off, { add_inspections: true }) && !A.mayStartJobs(own, { add_inspections: false }) && A.mayStartJobs(solo, null) && !A.mayStartJobs(ins, null));
  ok('§1 Services & prices: owner, admin, or “company settings”', A.mayEditServices(own, {}) && A.mayEditServices(adm, {}) && !A.mayEditServices(off, { crm: true }) && A.mayEditServices(off, { company_settings: true }) && !A.mayEditServices(ins, {}) && A.mayEditServices(solo, null));
  ok('§1 Payments: the owner only', A.mayManagePayments(own) && !A.mayManagePayments(adm) && !A.mayManagePayments(off) && A.mayManagePayments(solo));
  const shell = strip(S.shell);
  ok('§1 the sidebar shows Services & prices and Payments by these rules',
    /\{ href: '\/app\/company\/services', label: 'Services & prices', show: canServices \}/.test(shell) && /setCanServices\(mayEditServices\(\{ companyId, role: gate\.access\.role \}, c as any\)\)/.test(shell)
    && /\{ href: '\/app\/company\/payments', label: 'Payments', show: mayManagePayments\(\{ companyId: access\.companyId, role: access\.role \}\) \}/.test(shell));
  ok('§1 the button and the pages check the same rules', /mayStartJobs\(\{ companyId: access\.companyId, role: access\.role \}, c as any\)/.test(S.button)
    && /const ok = !access\.companyId \|\| caps\?\.add_inspections === true;/.test(S.newPage)
    && /const owner = mayManagePayments\(\{ companyId: access\.companyId, role: access\.role \}\);/.test(S.payments) && /if \(!owner\) return/.test(S.payments)
    && /setEditable\(mayEditServices\(/.test(S.services));

  // §2
  const all = Object.values(S).map(strip).join('\n');
  ok('§2 nothing reads the key: no payment_secrets, no stripe_secret_key column', !/payment_secrets|(?<!set_)stripe_secret_key/.test(all));
  ok('§2 the key goes only through set_stripe_secret_key; only stripe_key_status is read',
    /workspace\.rpc\('set_stripe_secret_key', \{ p_key: key\.trim\(\) \}\)/.test(S.api) && /workspace\.rpc\('stripe_key_status'\)/.test(S.api));
  ok('§2 the page clears the key after every save, and shows only the last four', /finally \{ setKey\(''\); setBusy\(false\); \}/.test(S.payments)
    && !/\{key\}/.test(strip(S.payments).replace(/value=\{key\}/, '')) && /status\.last4/.test(S.payments));

  // §3
  const api = strip(S.api), page = strip(S.newPage);
  ok('§3 the draft invoice is create_invoice + set_invoice_lines, never sent from here',
    /workspace\.rpc\('create_invoice', \{ p_order: orderId \}\)/.test(api) && /workspace\.rpc\('set_invoice_lines'/.test(api)
    && !/mark_invoice_sent|send-invoice|emailIt|markSent/.test(api + page));
  ok('§3 the lines are the services picked, at their prices (the base editable for this job)',
    /description: base\.name, quantity: 1, unit_cents: cents\(priceNum\)/.test(page) && /addonList\.map\(s => \(\{ description: s\.name, quantity: 1, unit_cents: cents\(s\.price\) \}\)\)/.test(page)
    && /const priceNum = price\.trim\(\) === '' \? \(base\?\.price \?\? 0\) : Number\(price\);/.test(page));
  // 2026-11-05 (#114): the order also carries where the job came from — crmHome.sourceFields' fields, never a fee.
  ok('§3 the job’s order carries no fee', /from\('crm_orders'\)\.insert\(\{ inspection_id: j\.inspectionId, contact_id: j\.contactId, address: j\.address\.trim\(\),\s*order_date: j\.date, status: 'scheduled', package_id: j\.packageId, \.\.\.\(j\.source \?\? \{\}\) \}\)/.test(api) && !/\bfee\b/.test(api));
  ok('§3 services are scoped to the company (or the person), never every company’s active prices',
    /q = scope\.companyId \? q\.eq\('company_id', scope\.companyId\) : q\.eq\('inspector_id', scope\.userId\);/.test(api));
  ok('§3 no CRM table is upserted', !/\.upsert\(/.test(api));
  const I = await mod(S.intake);
  ok('§3 cents are whole and never negative', I.cents(450) === 45000 && I.cents(12.345) === 1235 && I.cents(-5) === 0);

  // §4
  const C = await mod(S.create, s => s.replace("import { serial } from '../report/sealedReport';", 'const serial = (fn) => fn();'));
  {
    const sv = server();
    const r = await C.createJobFromWebsite({ device: 'web_abc', templateId: TPL, record: RECORD, leadId: LEAD, notes: 'Dog', extras: {} }, sv.deps);
    const a = sv.composed[0];
    ok('§4 a job is made', r.ok === true && r.id === 'insp_web_1', JSON.stringify(r));
    ok('§4 the composer gets the person, their company’s template (scoped to it) and its hidden items',
      a?.userId === UID && a?.companyId === CO && a?.template?.id === TPL && JSON.stringify(a?.hiddenIds) === '["cooling_x"]'
      && sv.calls.some(c => c.url.includes(`company_templates?id=eq.${TPL}&company_id=eq.${CO}`)));
    ok('§4 …and what the server takes, asked of the server', a?.caps?.columns?.['inspections.client_name'] === true && a?.caps?.columns?.['anomalies.staged_limitation'] === false
      && JSON.stringify(a?.caps?.valueKinds) === '["condition","spec","limitation"]' && JSON.stringify(a?.caps?.documentKeys) === '["order_notes"]');
    const writes = sv.calls.filter(c => c.method !== 'GET' && !/rpc\/(my_capabilities|inspection_values_kinds|inspection_document_keys)$/.test(c.url));
    ok('§4 the rows go where a phone’s first sync puts them, in its order',
      JSON.stringify(writes.map(c => `${c.method} ${c.url.replace('https://db.example', '')}`)) === JSON.stringify([
        'POST /rest/v1/inspections?on_conflict=id', 'POST /rest/v1/inspection_templates', 'PATCH /rest/v1/inspections?id=eq.insp_web_1',
        'POST /rest/v1/rpc/put_inspection_values', 'POST /rest/v1/rpc/put_inspection_documents']), JSON.stringify(writes.map(c => c.url)));
    ok('§4 the insert is the phone’s: on conflict (id) do nothing', /resolution=ignore-duplicates/.test(writes[0]?.headers?.Prefer ?? ''));
    ok('§4 …as the person (their token, never a service key)', sv.calls.every(c => c.headers.Authorization === 'Bearer tok') && !/SERVICE_ROLE/.test(S.create + S.route));
  }
  {
    const sv = server({ addInspections: false });
    const r = await C.createJobFromWebsite({ device: 'web_abc', templateId: TPL, record: RECORD }, sv.deps);
    ok('§4 without “Add inspections” nothing is written', r.ok === false && r.code === 'not_allowed' && !sv.calls.some(c => c.method === 'POST' && !c.url.includes('/rpc/')));
  }
  {
    const sv = server({ templateCompany: OTHER });
    const r = await C.createJobFromWebsite({ device: 'web_abc', templateId: TPL, record: RECORD }, sv.deps);
    ok('§4 a template that is not this company’s makes nothing', r.ok === false && r.code === 'template_unavailable' && sv.composed.length === 0);
  }
  {
    const sv = server();
    const r = await C.createJobFromWebsite({ device: 'web_abc', templateId: TPL, record: { ...RECORD, yearBuilt: '', clientEmail: '' } }, sv.deps);
    ok('§4 an incomplete form is refused in the phone’s words', r.ok === false && r.code === 'missing_fields' && /Year Built/.test(r.error) && /Client Phone or Email/.test(r.error) && sv.calls.length === 0);
    const r2 = await C.createJobFromWebsite({ device: 'web_abc', templateId: TPL, record: RECORD }, { ...sv.deps, token: '' });
    ok('§4 signed out is refused', r2.ok === false && r2.code === 'signed_out');
  }
  ok('§4 the route runs create.ts with the caller’s token, on Node', /createJobFromWebsite\(/.test(S.route) && /export const runtime = 'nodejs';/.test(S.route) && /\{ supaUrl: SUPA_URL, anonKey: ANON, token \}/.test(S.route));
  ok('§4 the composer is the phone’s bundle', /await import\('\.\.\/report\/newjob\.mjs'\)/.test(S.create) && existsSync(join(ROOT, 'lib/report/newjob.mjs'))
    && /export function createComposer\(\)/.test(readFileSync(join(ROOT, 'lib/report/newjob.mjs'), 'utf8')));

  // §5
  ok('§5 the public page lists the company’s prices when it names its company, else the owner’s',
    /const scope = p\.company_id \? `company_id=eq\.\$\{encodeURIComponent\(p\.company_id\)\}` : `inspector_id=eq\.\$\{encodeURIComponent\(p\.id\)\}`;/.test(S.book)
    && /crm_packages\?\$\{scope\}&active=eq\.true/.test(S.book));
  ok('§5 the booking page is read and written through #115’s functions, the own row before them',
    /workspace\.rpc\('company_booking_settings'\)/.test(api) && /workspace\.rpc\('set_company_booking_settings'/.test(api)
    && /if \(r\.error && !missingFn\(r\.error\)\) fail/.test(api) && /\.eq\('id', me\.userId\)/.test(api));

  // §6
  const appHome = readFileSync(join(APP, 'src/core/taxonomy/homeProfile.ts'), 'utf8'), appExtras = readFileSync(join(APP, 'src/core/services/InspectionExtrasService.ts'), 'utf8');
  const appScreen = readFileSync(join(APP, 'src/app/AddInspectionScreen.tsx'), 'utf8');
  const lit = (src, name) => { const m = new RegExp(`export const ${name}\\s*=\\s*(\\[[^\\]]*\\])`).exec(src); return m ? JSON.stringify(JSON.parse(m[1].replace(/'/g, '"'))) : null; };
  ok('§6 home types and “also on the property” are the phone’s', JSON.stringify(I.HOME_TYPES) === lit(appHome, 'HOME_TYPES') && JSON.stringify(I.DELTA_OPTIONS) === lit(appHome, 'DELTA_OPTIONS'));
  ok('§6 water, sewer and gas are the phone’s', JSON.stringify(I.WATER_SOURCE_OPTIONS) === lit(appExtras, 'WATER_SOURCE_OPTIONS')
    && JSON.stringify(I.SEWER_TYPE_OPTIONS) === lit(appExtras, 'SEWER_TYPE_OPTIONS') && JSON.stringify(I.GAS_SUPPLY_OPTIONS) === lit(appExtras, 'GAS_SUPPLY_OPTIONS'));
  ok('§6 the stock template per type is the phone’s', /'Full Home Inspection': 'internachi',\s*'4-Point':\s*'fourpoint',/.test(appScreen)
    && I.TYPE_DEFAULT_TEMPLATE['Full Home Inspection'] === 'internachi' && I.TYPE_DEFAULT_TEMPLATE['4-Point'] === 'fourpoint');
  return out;
}

const MUT = (f, from, to, expect, why) => ({ f, from, to, expect, why });
const MUTANTS = [
  MUT('access', "!a.companyId || caps?.add_inspections === true", "true", /^§1 starting a job/, 'anyone may start a job'),
  MUT('access', "a.role === 'owner' || a.role === 'admin' ||", "a.role === 'owner' || a.role === 'admin' || a.role === 'office' ||", /^§1 Services & prices/, 'office edits prices'),
  MUT('access', "!a.companyId || a.role === 'owner' || a.role === 'ledrix_admin'", "!a.companyId || a.role === 'owner' || a.role === 'admin' || a.role === 'ledrix_admin'", /^§1 Payments/, 'an admin manages payments'),
  MUT('shell', "label: 'Payments', show: mayManagePayments({ companyId: access.companyId, role: access.role })", "label: 'Payments', show: true", /^§1 the sidebar/, 'everyone sees Payments'),
  MUT('api', "const r = await workspace.rpc('stripe_key_status');", "const r = await workspace.from('payment_secrets').select('stripe_secret_key').maybeSingle();", /^§2 nothing reads the key/, 'the key is read back'),
  MUT('payments', "finally { setKey(''); setBusy(false); }", "finally { setBusy(false); }", /^§2 the page clears/, 'the key stays in the page'),
  MUT('api', "  if (s.error) fail(s.error, 'The draft invoice’s lines were not saved.');", "  if (s.error) fail(s.error, 'The draft invoice’s lines were not saved.');\n  await workspace.rpc('mark_invoice_sent', { p_invoice: id, p_version: 2, p_via: 'link' });", /^§3 the draft invoice/, 'the invoice is marked sent'),
  MUT('api', "order_date: j.date, status: 'scheduled', package_id: j.packageId, ...(j.source ?? {}) })", "order_date: j.date, status: 'scheduled', package_id: j.packageId, ...(j.source ?? {}), fee: 450 })", /^§3 the job’s order carries no fee/, 'the order carries a fee'),
  MUT('api', "q = scope.companyId ? q.eq('company_id', scope.companyId) : q.eq('inspector_id', scope.userId);", "", /^§3 services are scoped/, 'every company’s active prices are listed'),
  MUT('create', "if (companyId && caps.data?.add_inspections !== true) {", "if (false) {", /^§4 without/, 'the permission is not asked'),
  MUT('create', "company_templates?id=eq.${templateId}&company_id=eq.${companyId}", "company_templates?id=eq.${templateId}", /^§4 (a template that is not|the composer gets)/, 'any company’s template is used'),
  MUT('create', "headers: { ...J, Prefer: 'resolution=ignore-duplicates,return=representation' }", "headers: { ...J, Prefer: 'resolution=merge-duplicates,return=representation' }", /^§4 the insert is the phone/, 'the insert overwrites an existing job'),
  MUT('create', "    if (job.rows.documents.length) {", "    if (false) {", /^§4 the rows go/, 'the first note is not sent'),
  MUT('create', "const valueKinds = kinds.ok && Array.isArray(kinds.data) ? kinds.data.map(String) : [];", "const valueKinds = ['condition', 'spec', 'limitation', 'node'];", /^§4 …and what the server takes/, 'the server is not asked what it takes'),
  MUT('book', "const scope = p.company_id ? `company_id=eq.${encodeURIComponent(p.company_id)}` : `inspector_id=eq.${encodeURIComponent(p.id)}`;", "const scope = `inspector_id=eq.${encodeURIComponent(p.id)}`;", /^§5 the public page/, 'the public page lists only the owner’s prices'),
  MUT('intake', "'Condo/Townhome'] as const;", "'Condo'] as const;", /^§6 home types/, 'a home type the phone does not know'),
];

const results = await suite(SRC);
let fail = 0;
for (const r of results) { console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.pass || !r.detail ? '' : `\n      ${String(r.detail).slice(0, 400)}`}`); if (!r.pass) fail++; }
console.log('\n§7 mutations');
for (const m of MUTANTS) {
  if (SRC[m.f].split(m.from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${m.why}`); continue; }
  let res;
  try { res = await suite({ ...SRC, [m.f]: SRC[m.f].replace(m.from, m.to) }); } catch (e) { res = [{ name: '(crashed)', pass: false }]; }
  const caught = res.some(r => !r.pass && (m.expect.test(r.name) || r.name === '(crashed)'));
  if (!caught) fail++;
  console.log(`  ${caught ? '✓ caught' : '✗ NOT caught'}: ${m.why}`);
}
console.log(`\nverify-office-web — ${results.length + MUTANTS.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
