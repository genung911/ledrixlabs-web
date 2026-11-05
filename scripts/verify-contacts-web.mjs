#!/usr/bin/env node
// verify-contacts-web — the website's Contacts page (owner 2026-11-05: Contacts mockup approved; office work on the web
// as well as the phone). The same records and rules as the phone's CRM (ledrix-app CRMService, SQL #78, #113).
//
//   node scripts/verify-contacts-web.mjs
//
//   §1 lib/crm/api.ts: the signed-in workspace client only; never an upsert; every update names the next row_version at
//      the loaded one; inserts send no server-owned field; the only server functions are confirm_booking and
//      crm_contact_types; it writes only the four CRM tables; it never reads an order's fee
//   §2 the page writes nothing directly; it follows the server's `crm` permission; a stale write reloads; no fee;
//      contact types come from the server's answer; the Contacts menu item follows the permission
//   §3 money from invoices only (EXECUTED) — and the same words as the phone's jobPayFrom when ../ledrix-app is there
//   §4 contact types and the CSV reader (EXECUTED, the byte copy of the phone's contactsCore.ts)
//   §5 the module against a stand-in server (EXECUTED): versions, conflicts, vendor gated, no fee sent
//   §6 mutations — each rule broken once must fail here
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
  api: read('lib/crm/api.ts'), model: read('lib/crm/model.ts'), core: read('lib/crm/contactsCore.ts'),
  page: read('app/app/contacts/page.tsx'), shell: read('components/workspace/WorkspaceShell.tsx'),
};
const dir = mkdtempSync(join(tmpdir(), 'contactsweb-'));
let run = 0;

async function load(src) {
  const k = ++run;
  const core = join(dir, `core${k}.mjs`), model = join(dir, `model${k}.mjs`), api = join(dir, `api${k}.mjs`);
  writeFileSync(core, stripTypeScriptTypes(src.core));
  writeFileSync(model, stripTypeScriptTypes(src.model));
  writeFileSync(api, stripTypeScriptTypes(src.api
    .replace("import { workspace } from '@/lib/workspace/client';", 'const workspace = new Proxy({}, { get: (_, k) => globalThis.__ws[k] });')
    .replace("from '@/lib/crm/contactsCore';", `from ${JSON.stringify(pathToFileURL(core).href)};`)
    .replace("from '@/lib/crm/model';", `from ${JSON.stringify(pathToFileURL(model).href)};`)));
  return {
    core: await import(pathToFileURL(core).href), model: await import(pathToFileURL(model).href), api: await import(pathToFileURL(api).href),
  };
}

/** A stand-in for the Supabase client: records every call; answers from `answers`. */
function fakeServer(answers = {}) {
  const calls = [];
  const builder = (table) => {
    const q = { table, ops: [] };
    const chain = new Proxy({}, {
      get(_, op) {
        if (op === 'then') {
          const res = answers.query?.(q) ?? { data: [], error: null };
          return (ok, bad) => Promise.resolve(res).then(ok, bad);
        }
        return (...args) => { q.ops.push([op, ...args]); if (['insert', 'update', 'upsert', 'delete'].includes(op)) calls.push(q); return chain; };
      },
    });
    return chain;
  };
  return {
    calls,
    from: (t) => builder(t),
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return answers.rpc?.(name, args) ?? { data: null, error: null }; },
  };
}

async function suite(src) {
  const out = [];
  const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
  const api = strip(src.api), page = strip(src.page), shell = strip(src.shell);

  // §1
  ok('§1 the signed-in workspace client only — no service key, no other client',
    /from '@\/lib\/workspace\/client'/.test(src.api) && !/SERVICE_ROLE|service_role|lib\/supabaseClient/i.test(api));
  ok('§1 never an upsert', !/\.upsert\s*\(/.test(api));
  const updates = [...api.matchAll(/\.update\(([^;]*?)\)\s*\n?\s*\.eq\('id', ([a-z.]+)\)\.eq\('row_version', ([a-z.]+)\)/g)];
  ok('§1 every update names the next version at the loaded one (… row_version: v + 1 … .eq(\'row_version\', v))',
    (api.match(/\.update\(/g) ?? []).length === 1 && updates.length === 1 && /row_version: version \+ 1/.test(updates[0][1]) && updates[0][3] === 'version');
  ok('§1 an update that changed nothing is a conflict, not a silent success', /if \(!res\.data\) fail\(\{ code: 'P0409' \}, ''\);/.test(api));
  ok('§1 inserts and updates send no server-owned field', /const SERVER_OWNED = \['id', 'company_id', 'created_at', 'updated_at', 'updated_by', 'row_version'\];/.test(api)
    && /\.insert\(clientFields\(row\)\)/.test(api) && /\.update\(\{ \.\.\.clientFields\(patch\), row_version: version \+ 1 \}\)/.test(api));
  const rpcs = [...new Set([...api.matchAll(/workspace\.rpc\('([a-z_]+)'/g)].map(m => m[1]))].sort();
  ok('§1 the only server functions: confirm_booking and crm_contact_types', JSON.stringify(rpcs) === '["confirm_booking","crm_contact_types"]', JSON.stringify(rpcs));
  const written = new Set();
  for (const m of api.matchAll(/crm(?:Insert|Update)\('([a-z_]+)'/g)) written.add(m[1]);
  for (const m of api.matchAll(/from\('([a-z_]+)'\)\.delete\(/g)) written.add(m[1]);
  ok('§1 it writes only the CRM tables', [...written].every(t => ['crm_contacts', 'crm_orders', 'crm_followups', 'crm_bookings'].includes(t)) && written.size === 4, [...written].join());
  ok('§1 an order’s fee is never read or sent (money is the invoice’s)', !/\bfee\b/.test(api));

  // §2
  ok('§2 the page writes nothing directly (only through lib/crm)', !/\.(insert|update|upsert|delete|rpc)\s*\(|workspace\./.test(page));
  ok('§2 the page follows the server’s crm permission', /if \(access\.companyId && caps\?\.crm !== true\) \{ setState\(\{ kind: 'denied' \}\); return; \}/.test(page));
  ok('§2 a stale write reloads before saying so', /if \(e instanceof CRMError && e\.conflict\) await load\(\);/.test(page));
  ok('§2 no fee on the page', !/\bfee\b/.test(page));
  ok('§2 contact types offered = the server’s answer (no hard-coded vendor choice)',
    /const choices = initial && !types\.includes\(initial\.type\) \? \[\.\.\.types, initial\.type\] : types;/.test(page)
    && /const t = new Set<ContactType>\(data\.types\);/.test(page) && !/type: 'vendor'|setType\('vendor'\)/.test(page));
  ok('§2 the Contacts menu item follows the server’s permission',
    /\{ href: '\/app\/contacts', label: 'Contacts', show: canCrm \}/.test(shell) && /setCanCrm\(!companyId \|\| c\?\.crm === true\)/.test(shell));

  let M;
  try { M = await load(src); } catch (e) { ok('§3 the modules run', false, String(e)); return out; }
  const { model, core } = M;

  // §3
  const inv = (o) => ({ id: 'i1', number: 1, order_id: 'o1', status: 'sent', shown_status: 'sent', total_cents: 45000, paid_cents: 0, balance_cents: 45000, ...o });
  const W = (invs) => model.payWords(model.payOf(invs));
  const CASES = [
    [], [inv({ shown_status: 'paid', paid_cents: 45000, balance_cents: 0 })], [inv({ shown_status: 'partly_paid', paid_cents: 20000, balance_cents: 25000 })],
    [inv({})], [inv({ shown_status: 'overdue', balance_cents: 25050 })], [inv({ status: 'draft', shown_status: 'draft' })],
    [inv({ status: 'void', shown_status: 'void' })], [inv({ number: 1, shown_status: 'paid', paid_cents: 45000, balance_cents: 0 }), inv({ id: 'i2', number: 2 })],
  ];
  ok('§3 no invoice → "No invoice", never an amount', W([]) === 'No invoice' && W([inv({ status: 'void', shown_status: 'void' })]) === 'No invoice');
  ok('§3 paid / part paid / unpaid (the balance) / draft', W(CASES[1]) === 'Paid · $450' && W(CASES[2]) === 'Part paid · $200 of $450'
    && W(CASES[3]) === 'Unpaid · $450 due' && W(CASES[4]) === 'Unpaid · $250.50 due' && W(CASES[5]) === 'Draft invoice · $450');
  ok('§3 the newest live invoice is the job’s', W(CASES[7]) === 'Unpaid · $450 due');
  ok('§3 invoiced = live invoices only', model.invoicedCents([inv({}), inv({ id: 'v', status: 'void', shown_status: 'void' })]) === 45000);
  const phoneFile = join(APP, 'src/core/services/jobPayment.ts');
  if (existsSync(phoneFile)) {
    const P = readFileSync(phoneFile, 'utf8');
    const a = P.indexOf('export type PayState'), b = P.indexOf('// ── The cache');
    const f = join(dir, `phone${run}.mjs`);
    writeFileSync(f, stripTypeScriptTypes(P.slice(a, b)));
    const Ph = await import(pathToFileURL(f).href);
    const diffs = CASES.map(c => [Ph.paySentence(Ph.jobPayFrom(c, null, null, 1)), W(c)]).filter(([p, w]) => p !== w);
    ok('§3 the same words as the phone’s jobPayFrom (no fee given)', diffs.length === 0, JSON.stringify(diffs));
  } else if (!process.env.ALLOW_NO_APP) ok('§3 ledrix-app beside this checkout (set ALLOW_NO_APP=1 to skip)', false, phoneFile);
  const r = model.referrals([{ order_date: '2026-11-01', status: 'completed' }, { order_date: '2026-09-20', status: 'completed' },
    { order_date: '2026-11-10', status: 'scheduled' }, { order_date: '2026-10-30', status: 'cancelled' }], '2026-11-05');
  ok('§3 referrals: plain counts, cancelled jobs excluded', r.total === 3 && r.last30 === 1 && r.prior30 === 1 && r.next === '2026-11-10' && r.last === '2026-11-01');
  ok('§3 the week starts on Monday; days group in order', model.weekStart('2026-11-05') === '2026-11-02' && model.weekStart('2026-11-02') === '2026-11-02'
    && JSON.stringify(model.byDay([{ order_date: '2026-11-04' }, { order_date: '2026-11-02' }, { order_date: '2026-11-09' }], '2026-11-02').map(d => d.day)) === '["2026-11-02","2026-11-04"]');
  const g = model.monthGrid([{ order_date: '2026-11-05', status: 'scheduled' }, { order_date: '2026-11-05', status: 'cancelled' }], '2026-11-17');
  ok('§3 the month grid covers the month, counts live jobs', g[0][0].day === '2026-10-26' && g.flat().find(c => c.day === '2026-11-05').count === 1 && g.at(-1).some(c => c.day === '2026-11-30'));

  // §4
  ok('§4 a server without crm_contact_types (or junk) → the base three, no vendor',
    JSON.stringify(core.acceptedContactTypes(null)) === '["agent","client","homeowner"]' && JSON.stringify(core.acceptedContactTypes({})) === '["agent","client","homeowner"]'
    && JSON.stringify(core.acceptedContactTypes(['agent'])) === '["agent","client","homeowner"]');
  ok('§4 a server that names vendor → vendor offered', JSON.stringify(core.acceptedContactTypes(['agent', 'client', 'homeowner', 'vendor'])) === '["agent","client","homeowner","vendor"]');
  ok('§4 a typed cell → a type (any case, plural); unknown → client', core.contactTypeFromCell('Vendors') === 'vendor' && core.contactTypeFromCell(' AGENT ') === 'agent'
    && core.contactTypeFromCell('lender') === 'client' && core.contactTypeFromCell('') === 'client');
  const csv = 'Name,Type,Email\nAnn,Agent,a@x.com\nRay Radon Lab,Vendor,r@x.com\n"Lee, Jr",client,l@x.com';
  const rows = core.parseGenericCSV(csv, { name: 'Name', type: 'Type', email: 'Email' });
  ok('§4 the generic CSV reads quoted commas and types', rows.length === 3 && rows[2].name === 'Lee, Jr' && rows[1].type === 'vendor');
  const split = core.importable(rows, core.acceptedContactTypes(null));
  ok('§4 a vendor is held back until the server takes it', split.rows.length === 2 && split.refused.length === 1 && split.refused[0].type === 'vendor');
  const isn = 'Agent First,Agent Last,Agent Email,Client First,Client Last,Address,Order Date,Order Status\nDana,W,d@x.com,Pat,O,1 Elm,11/01/2026,Completed';
  ok('§4 an ISN export → agent + client with the job', core.detectISNCSV(isn) && core.parseISNCSV(isn).map(x => x.type).join() === 'agent,client' && core.parseISNCSV(isn)[0].address === '1 Elm');

  // §5
  const { api: A } = M;
  globalThis.__ws = fakeServer({ rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }) });
  ok('§5 before #113 the page offers no vendor', !(await A.loadContactTypes()).includes('vendor'));
  globalThis.__ws = fakeServer({ rpc: () => ({ data: ['agent', 'client', 'homeowner', 'vendor'], error: null }) });
  ok('§5 after #113 it does', (await A.loadContactTypes()).includes('vendor'));
  const s1 = fakeServer({ query: (q) => (q.ops.some(o => o[0] === 'update') ? { data: { id: 'c1' }, error: null } : { data: { id: 'new' }, error: null }) });
  globalThis.__ws = s1;
  await A.saveContact({ id: 'c1', type: 'agent', row_version: 7 }, { type: 'client', name: ' Ann ', email: '' });
  const upd = s1.calls.find(c => c.ops.some(o => o[0] === 'update'));
  const body = upd.ops.find(o => o[0] === 'update')[1];
  ok('§5 an edit sends version 8 and asks for version 7', body.row_version === 8 && upd.ops.some(o => o[0] === 'eq' && o[1] === 'row_version' && o[2] === 7) && body.name === 'Ann' && body.email === null);
  globalThis.__ws = fakeServer({ query: () => ({ data: null, error: null }) });
  let conflict = null; try { await A.saveContact({ id: 'c1', type: 'agent', row_version: 7 }, { type: 'agent', name: 'Ann' }); } catch (e) { conflict = e; }
  ok('§5 a newer save elsewhere → a conflict the page reloads on', conflict?.conflict === true);
  globalThis.__ws = fakeServer({ query: () => ({ data: null, error: { code: 'P0409', message: 'crm_version_conflict' } }) });
  conflict = null; try { await A.changeJob({ id: 'o1', row_version: 2 }, { status: 'completed' }); } catch (e) { conflict = e; }
  ok('§5 the server’s P0409 is a conflict too', conflict?.conflict === true);
  const s2 = fakeServer({ query: () => ({ data: { id: 'x' }, error: null }) });
  globalThis.__ws = s2;
  await A.scheduleJob({ contactId: 'c1', address: '1 Elm', date: '2026-11-07' });
  await A.addContact({ type: 'agent', name: 'Ann' });
  const inserts = s2.calls.map(c => c.ops.find(o => o[0] === 'insert')?.[1]).filter(Boolean);
  ok('§5 inserts carry no company, version or fee', inserts.length === 2 && inserts.every(b => !('company_id' in b) && !('row_version' in b) && !('fee' in b)) && inserts[0].status === 'scheduled');
  const s3 = fakeServer({ query: () => ({ data: { id: 'x' }, error: null }) });
  globalThis.__ws = s3;
  const res = await A.importContacts(rows, core.acceptedContactTypes(null));
  const sentTypes = s3.calls.map(c => c.ops.find(o => o[0] === 'insert')?.[1]?.type).filter(Boolean);
  ok('§5 an import before #113 never sends a vendor, and says how many it held back', !sentTypes.includes('vendor') && res.refused === 1 && res.contacts === 2);
  return out;
}

let pass = 0, fail = 0;
const report = (rs) => { for (const r of rs) { if (r.pass) { pass++; console.log(`  ✓ ${r.name}`); } else { fail++; console.log(`  ✗ ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`); } } };
console.log('verify-contacts-web');
report(await suite(SRC));
console.log('\n§6 mutations');
const MUTANTS = [
  { f: 'shell', from: "{ href: '/app/contacts', label: 'Contacts', show: canCrm }", to: "{ href: '/app/contacts', label: 'Contacts', show: true }", why: 'the menu ignores the permission', expect: /^§2 the Contacts menu/ },
  { f: 'page', from: "if (access.companyId && caps?.crm !== true) { setState({ kind: 'denied' }); return; }", to: '', why: 'the page ignores the permission', expect: /^§2 the page follows/ },
  { f: 'page', from: 'if (e instanceof CRMError && e.conflict) await load();', to: '', why: 'a conflict does not reload', expect: /^§2 a stale write/ },
  { f: 'api', from: ".eq('id', id).eq('row_version', version)", to: ".eq('id', id)", why: 'an update without the version check', expect: /^§1 every update/ },
  { f: 'api', from: 'if (!res.data) fail({ code: \'P0409\' }, \'\');', to: '', why: 'a lost update looks like success', expect: /^§5 a newer save|^§1 an update that changed nothing/ },
  { f: 'api', from: "status: 'scheduled', notes: clean(j.notes) });", to: "status: 'scheduled', fee: 0, notes: clean(j.notes) });", why: 'scheduling sends a fee', expect: /^§1 an order’s fee|^§5 inserts carry/ },
  { f: 'api', from: "const SERVER_OWNED = ['id', 'company_id', 'created_at', 'updated_at', 'updated_by', 'row_version'];", to: "const SERVER_OWNED = ['id'];", why: 'server-owned fields sent', expect: /^§1 inserts and updates/ },
  { f: 'api', from: "  const { rows, refused } = importable(all, accepted);", to: "  const rows = all, refused = [];", why: 'import sends vendors before the server takes them', expect: /^§5 an import/ },
  { f: 'api', from: "return acceptedContactTypes(res.error ? null : res.data);", to: "return ['agent', 'client', 'homeowner', 'vendor'];", why: 'vendor offered without asking the server', expect: /^§5 before #113/ },
  { f: 'core', from: "  return BASE_CONTACT_TYPES.every(t => out.includes(t)) ? out : [...BASE_CONTACT_TYPES];", to: '  return out.length ? out : [...CONTACT_TYPES];', why: 'no answer = every type', expect: /^§4 a server without/ },
  { f: 'model', from: "    default:          return 'No invoice';", to: "    default:          return 'No invoice · $0';", why: 'no invoice shows an amount', expect: /^§3/ },
  { f: 'model', from: ".filter(i => i.status !== 'void' && i.shown_status !== 'void').sort", to: '.filter(i => true).sort', why: 'a void invoice counts', expect: /^§3/ },
  { f: 'model', from: "  const live = orders.filter(o => o.status !== 'cancelled');", to: '  const live = orders;', why: 'cancelled jobs count as referrals', expect: /^§3 referrals/ },
  { f: 'page', from: 'const choices = initial && !types.includes(initial.type) ? [...types, initial.type] : types;', to: "const choices = ['agent', 'client', 'homeowner', 'vendor'] as ContactType[];", why: 'the form hard-codes vendor', expect: /^§2 contact types/ },
];
for (const m of MUTANTS) {
  if (SRC[m.f].split(m.from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${m.why}`); continue; }
  const rs = await suite({ ...SRC, [m.f]: SRC[m.f].replace(m.from, m.to) });
  if (rs.some(r => !r.pass && m.expect.test(r.name))) { pass++; console.log(`  ✓ caught: ${m.why}`); } else { fail++; console.log(`  ✗ NOT caught: ${m.why}`); }
}
console.log(`\n${fail ? '✗' : '✓'} verify-contacts-web: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
