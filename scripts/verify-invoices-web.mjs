#!/usr/bin/env node
// verify-invoices-web — the website's Invoices page and module (ledrix-app PLAN_2026-10-29 Part E4).
//
//   node scripts/verify-invoices-web.mjs
//
//   §1 lib/invoices/api.ts changes invoices ONLY through the server's functions (the same list the phone uses) and the
//      send-invoice function; it writes no table and never records a card payment; it uses the signed-in workspace
//      client, never a service key
//   §2 the page writes nothing directly; a person records check, cash, transfer or other — never card; a stale write
//      reloads; the Invoices menu item shows only with the server's `invoices` permission (or no company)
//   §3 amounts typed by a person → cents (executed)
//   §4 mutations
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const SRC = { api: read('lib/invoices/api.ts'), page: read('app/app/invoices/page.tsx'), shell: read('components/workspace/WorkspaceShell.tsx') };
let run = 0;

async function suite(src) {
  const out = [];
  const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
  const api = strip(src.api), page = strip(src.page), shell = strip(src.shell);

  const rpcs = [...new Set([...api.matchAll(/workspace\.rpc\('([a-z_]+)'/g)].map(m => m[1]))].sort();
  ok('§1 changes go only through the invoice functions the server offers the app',
    JSON.stringify(rpcs) === JSON.stringify(['create_invoice', 'mark_invoice_sent', 'record_invoice_payment', 'reverse_invoice_payment', 'revise_invoice', 'set_invoice_lines', 'update_invoice_details', 'void_invoice']), JSON.stringify(rpcs));
  ok('§1 no table is written from the browser', !/\.(insert|update|upsert|delete)\s*\(/.test(api));
  ok('§1 email goes through send-invoice as the signed-in person', /workspace\.functions\.invoke\('send-invoice'/.test(api));
  ok('§1 it never records a card payment and holds no service key', !/record_stripe_payment/.test(api) && !/SERVICE_ROLE|service_role/i.test(api)
    && /from '@\/lib\/workspace\/client'/.test(src.api));

  ok('§2 the page writes nothing directly (only through lib/invoices)', !/\.(insert|update|upsert|delete|rpc)\s*\(|workspace\./.test(page));
  ok('§2 a person records check, cash, transfer or other — never card',
    /<option value="check">/.test(page) && !/<option value="card">/.test(page));
  ok('§2 a stale write reloads before saying so', /if \(e instanceof InvoiceError && e\.conflict\) await Promise\.all\(\[load\(\), loadSel\(selId\)\]\);/.test(page));
  ok('§2 the Invoices menu item follows the server’s permission',
    /\{ href: '\/app\/invoices', label: 'Invoices', show: canInvoice \}/.test(shell) && /setCanInvoice\(!companyId \|\| c\?\.invoices === true\)/.test(shell));
  ok('§2 user text in the printed PDF is escaped', /const esc = /.test(page) && /\$\{esc\(l\.description\)\}/.test(page) && !/\$\{l\.description\}/.test(page));

  const dir = mkdtempSync(join(tmpdir(), 'invweb-'));
  writeFileSync(join(dir, 'api.mjs'), stripTypeScriptTypes(src.api.replace("import { workspace } from '@/lib/workspace/client';", 'const workspace = {};')));
  try {
    const M = await import(pathToFileURL(join(dir, 'api.mjs')).href + `?r=${++run}`);
    ok('§3 typed amounts become cents; zero, negative and text are refused',
      M.toCents('$1,234.50') === 123450 && M.toCents('0') === null && M.toCents('-3') === null && M.toCents('x') === null);
    ok('§3 unpaid = a sent invoice still owed (draft, paid and void are not)',
      M.isUnpaid({ shown_status: 'overdue', balance_cents: 1 }) && !M.isUnpaid({ shown_status: 'draft', balance_cents: 500 }) && !M.isUnpaid({ shown_status: 'void', balance_cents: 500 }));
  } catch (e) { ok('§3 the module runs', false, String(e)); }
  return out;
}

let pass = 0, fail = 0;
const report = (rs) => { for (const r of rs) { if (r.pass) { pass++; console.log(`  ✓ ${r.name}`); } else { fail++; console.log(`  ✗ ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`); } } };
console.log('verify-invoices-web');
report(await suite(SRC));
console.log('\n§4 mutations');
const MUTANTS = [
  { f: 'page', from: '<option value="check">Check</option>', to: '<option value="card">Card</option><option value="check">Check</option>', why: 'a person can record a card payment', expect: /^§2 a person/ },
  { f: 'shell', from: "{ href: '/app/invoices', label: 'Invoices', show: canInvoice }", to: "{ href: '/app/invoices', label: 'Invoices', show: true }", why: 'the menu ignores the permission', expect: /^§2 the Invoices menu/ },
  { f: 'api', from: "  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;", to: "  return Number.isFinite(n) ? Math.round(n * 100) : null;", why: 'negative amounts accepted', expect: /^§3 typed/ },
  { f: 'page', from: "${esc(l.description)}${l.quantity !== 1", to: "${l.description}${l.quantity !== 1", why: 'PDF line text not escaped', expect: /^§2 user text/ },
];
for (const m of MUTANTS) {
  if (SRC[m.f].split(m.from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${m.why}`); continue; }
  const rs = await suite({ ...SRC, [m.f]: SRC[m.f].replace(m.from, m.to) });
  if (rs.some(r => !r.pass && m.expect.test(r.name))) { pass++; console.log(`  ✓ caught: ${m.why}`); } else { fail++; console.log(`  ✗ NOT caught: ${m.why}`); }
}
console.log(`\n${fail ? '✗' : '✓'} verify-invoices-web: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
