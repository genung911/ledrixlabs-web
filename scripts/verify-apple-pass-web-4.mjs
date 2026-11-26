#!/usr/bin/env node
// verify-apple-pass-web-4 — the website Apple pass, batch 4 (owner 2026-11-25, mockup Xz88Phv45CdsgNoCuuhaEA, "Approved mock
// up"): a coloured tile per section in the left list; Company as a settings page (People and work · Getting paid · Ledrix);
// Team with initials and its own "Waiting to join"; Invoices as rows opening on Unpaid with "Jobs not invoiced" as a group;
// the CRM's lists as rows with their counts. `--mutate` proves each check can fail (in memory).
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const real = { shell: read('components/workspace/WorkspaceShell.tsx'), company: read('app/app/company/page.tsx'), team: read('app/app/team/page.tsx'),
  inv: read('app/app/invoices/page.tsx'), crm: read('components/crm/CrmApp.tsx') };

function checks(S) {
  const out = []; const ok = (n, c) => out.push([n, !!c]);
  ok('each section has its own coloured tile, in the rail and the phone menu', /const NAV_TINT: Record<string, string> = \{/.test(S.shell)
    && (S.shell.match(/tint=\{NAV_TINT\[n\.href\]\}/g) ?? []).length === 2 && S.shell.includes('style={{ background: tint ??'));
  ok('Company: People and work — Team, Templates, Services & prices', S.company.includes('<Group heading="People and work">') && S.company.includes('label="Services & prices"'));
  ok('Company: Getting paid — Payments (Stripe connected / Not connected) and the Booking page', S.company.includes('<Group heading="Getting paid"')
    && S.company.includes("state.extra.stripe.connected ? `Stripe connected") && S.company.includes('label="Booking page"'));
  ok('a part that can\'t be read simply isn\'t listed', S.company.includes('{state.extra.services !== null && <Row') && S.company.includes('{state.extra.stripe && <Row'));
  ok('Team: initials before each name', S.team.includes('{initials(m.full_name || m.email)}'));
  ok('Team: invitations in their own "Waiting to join" group', S.team.includes('{manages && state.invites.length > 0 && <Group heading="Waiting to join"'));
  ok('Invoices open on Unpaid, Unpaid · Paid · Drafts · All', S.inv.includes("useState<'all' | 'unpaid' | 'draft' | 'paid'>('unpaid')")
    && S.inv.includes("{ key: 'unpaid', label: 'Unpaid' }, { key: 'paid', label: 'Paid' }, { key: 'draft', label: 'Drafts' }, { key: 'all', label: 'All' },"));
  ok('an invoice is a row: number · address, client · due, the balance — overdue in amber', S.inv.includes("{invoiceNumber(r)}{r.property_address ? ` · ${r.property_address}` : ''}")
    && S.inv.includes("${late ? 'text-amber-700 dark:text-amber-400' : 'text-ink'}") && !/<table className="w-full min-w-\[620px\]/.test(S.inv));
  ok('Jobs not invoiced is its own group, the first few with Create invoice', S.inv.includes('<Group heading={`Jobs not invoiced · ${state.jobs.length}`}>') && S.inv.includes('value="Create invoice"'));
  ok('CRM: its lists as rows with their counts', S.crm.includes('<Row label="Contacts" value={String(data.contacts.length)} href="/app/crm/contacts" />')
    && S.crm.includes("data.contacts.filter(c => c.type === 'agent').length"));
  return out;
}
const MUTS = [
  ['the phone menu loses its tiles', 'shell', '<NavIcon d={NAV_ICON[n.href] ?? NAV_ICON[\'/app\']} tint={NAV_TINT[n.href]} />{n.label}', '{n.label}'],
  ['Getting paid gone', 'company', '<Group heading="Getting paid"', '<Group heading="Payments"'],
  ['Services listed for someone who can\'t see them', 'company', '{state.extra.services !== null && <Row', '{<Row'],
  ['invitations back in People', 'team', '{manages && state.invites.length > 0 && <Group heading="Waiting to join"', '{manages && state.invites.length > 0 && <Group heading="People"'],
  ['Invoices open on All', 'inv', "('unpaid');", "('all');"],
  ['overdue not marked', 'inv', "${late ? 'text-amber-700 dark:text-amber-400' : 'text-ink'}", "text-ink"],
  ['no Jobs not invoiced group', 'inv', '<Group heading={`Jobs not invoiced · ${state.jobs.length}`}>', '<Group>'],
];
let fail = 0;
for (const [n, v] of checks(real)) { console.log(`${v ? '✓' : '✗'} ${n}`); if (!v) fail++; }
if (process.argv.includes('--mutate')) {
  let caught = 0;
  for (const [why, f, a, b] of MUTS) {
    if (real[f].split(a).length !== 2) { console.log(`✗ anchor present once: ${why}`); fail++; continue; }
    const hit = checks({ ...real, [f]: real[f].replace(a, b) }).some(([, v]) => !v);
    console.log(`${hit ? '✓' : '✗'} caught: ${why}`); hit ? caught++ : fail++;
  }
  console.log(`${caught}/${MUTS.length} mutations caught`);
}
console.log(`\nverify-apple-pass-web-4 — ${fail ? 'FAILED' : 'ok'}`);
process.exit(fail ? 1 : 0);
