#!/usr/bin/env node
// verify-web-kit — the website Apple pass (owner 2026-11-23, mockup CXThxTV8YKrVAaDGGa64to: "Mock up approved") and a
// ratchet so no page slides back.
//   §1 the kit in components/workspace/ui.tsx: Group (11-px grey capitals heading by style), Row, Toggle, Seg, PinnedBar,
//      FieldRow (saves when you leave it), Sheet (Cancel / commit at the top), useReloadOnFocus (no Refresh buttons)
//   §2 the phone's words: the inspection page says To review · Confirmed · Checklist · Review & send; the seal panel
//      says Review & send and Send report; the CRM's planned tabs say "Being built" (owner: "just say being built")
//   §3 the ratchet over every signed-in page and its components: no "Refresh" button, no "←" back link, no capitals
//      title in JSX text (two capitals words or more); the Company profile is editable (owner: "Yes")
//   §M mutations, in memory: each must fail a check.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
function walk(d) {
  return readdirSync(join(ROOT, d)).flatMap(f => {
    const p = join(d, f);
    if (/prototype|node_modules/.test(p)) return [];
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.tsx$/.test(f) ? [p] : [];
  });
}
const FILES = [...walk('app/app'), ...walk('components/workspace'), ...walk('components/crm'), ...walk('components/office'), 'components/templates/PhonePreview.tsx', 'components/templates/LocationSuggestions.tsx'];

const CAPS = /^[A-Z][A-Z0-9&'’.\-]+(?: [A-Z0-9&'’.\-·]+)+$/;
export function drift(src) {
  const s = strip(src);
  const caps = [...s.matchAll(/>\s*([^<>{}\n]{4,60}?)\s*</g)].map(m => m[1].trim()).filter(t => CAPS.test(t) && /[A-Z]{3}/.test(t));
  const refresh = (s.match(/>\s*Refresh\s*</g) ?? []).length;
  const arrows = (s.match(/>\s*←\s*[A-Za-z]/g) ?? []).length;
  return { caps, refresh, arrows };
}

function checks(S) {
  const out = []; const ok = (n, c) => out.push({ n, c: !!c });
  const ui = S['components/workspace/ui.tsx'];
  ok('§1 the kit exports Group, Row, Toggle, Seg, PinnedBar, FieldRow, Sheet and useReloadOnFocus',
    ['export function Group(', 'export function Row(', 'export function Toggle(', 'export function Seg<', 'export function PinnedBar(', 'export function FieldRow(', 'export function Sheet(', 'export function useReloadOnFocus('].every(x => ui.includes(x)));
  ok('§1 group headings are small grey capitals by style (11 px, uppercase), the text itself sentence case',
    /<h2 className="text-\[11px\] font-semibold uppercase tracking-\[0\.06em\] text-muted">\{heading\}<\/h2>/.test(ui));
  ok('§1 a FieldRow saves when you leave it, and says Saved / Not saved', /onBlur=\{async \(\) => \{\s*if \(v === value\) return;/.test(ui) && /'Saved'/.test(ui) && /Not saved/.test(ui));
  ok('§1 a Sheet has Cancel and its commit at the top', /onClick=\{onCancel\} className="text-sm text-accent-ink hover:underline">Cancel</.test(ui) && /\{busy \? 'Saving…' : doneLabel\}/.test(ui));
  const insp = S['app/app/inspections/[id]/page.tsx'];
  ok('§2 the inspection page uses the phone\'s words', ["label: 'To review'", "label: 'Confirmed'", "label: 'Checklist'", "label: 'Review & send'"].every(x => insp.includes(x))
    && !/label: 'Seal & send'|label: 'Review queue'|label: 'Confirmed findings'/.test(insp));
  ok('§2 the inspection page groups findings by system', /const bySystem = groupBySystem\(list\);/.test(insp) && /function groupBySystem\(/.test(insp));
  const seal = S['components/workspace/SealPanel.tsx'];
  ok('§2 the seal panel says Review & send and Send report', />Review &amp; send<\/h2>/.test(seal) && />Send report<\/button>/.test(seal) && !/SEAL &amp; SEND/.test(seal));
  const crm = S['components/crm/CrmApp.tsx'];
  ok('§2 the CRM\'s planned tabs stay and say "Being built"', />Being built<\/span>\}/.test(crm) && /planned: true/.test(crm) && !/>Planned</.test(crm));
  const co = S['app/app/company/page.tsx'];
  ok('§3 the Company profile is editable: the name saves as you go, the logo uploads', /<FieldRow label="Name" value=\{state\.name\}/.test(co) && /saveCompanyName\(/.test(co) && /saveCompanyLogo\(/.test(co));
  const bad = [];
  for (const f of FILES) { const d = drift(S[f] ?? ''); if (d.caps.length || d.refresh || d.arrows) bad.push(`${f}: ${[...d.caps.map(c => `"${c}"`), d.refresh ? `${d.refresh} Refresh` : '', d.arrows ? `${d.arrows} ←` : ''].filter(Boolean).join(', ')}`); }
  ok(`§3 no page has a Refresh button, a "←" back link or a capitals title (${FILES.length} files)${bad.length ? ' — ' + bad.join('; ') : ''}`, bad.length === 0);
  ok('§3 the scan sees the website (a plausible number of files) and finds what it looks for',
    FILES.length > 25 && drift('<h2>SEAL AND SEND</h2>').caps.length === 1 && drift('<button>Refresh</button>').refresh === 1 && drift('<a>← Inspections</a>').arrows === 1
    && drift('<h2>Review and send</h2>').caps.length === 0 && drift('<span>OK</span>').caps.length === 0);
  return out;
}

const SRC = Object.fromEntries(FILES.map(f => [f, read(f)]));
const S = { ...SRC };
let fail = 0;
for (const r of checks(S)) { console.log(`  ${r.c ? '✓' : '✗'} ${r.n}`); if (!r.c) fail++; }

console.log('\n§M mutations');
const MUT = [
  ['a Refresh button comes back on Today', 'app/app/page.tsx', 'actions={<NewInspectionButton />}', 'actions={<><button>Refresh</button><NewInspectionButton /></>}'],
  ['a capitals title comes back', 'app/app/reports/page.tsx', '<PageHeader title="Reports"', '<h2>TO SEND</h2><PageHeader title="Reports"'],
  ['an arrow back comes back', 'app/app/inspections/[id]/page.tsx', '>‹ Inspections</a>', '>← Inspections</a>'],
  ['Seal & send is the name again', 'app/app/inspections/[id]/page.tsx', "label: 'Review & send'", "label: 'Seal & send'"],
  ['the planned tabs are hidden', 'components/crm/CrmApp.tsx', '>Being built</span>}', '></span>}'],
  ['the company name is read-only again', 'app/app/company/page.tsx', '<FieldRow label="Name" value={state.name}', '<Row label="Name" value={state.name}'],
  ['a FieldRow saves on every key', 'components/workspace/ui.tsx', 'if (v === value) return;', 'return;'],
];
for (const [why, f, from, to] of MUT) {
  if (SRC[f].split(from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${why}`); continue; }
  const caught = checks({ ...SRC, [f]: SRC[f].replace(from, to) }).some(r => !r.c);
  console.log(`  ${caught ? '✓ caught' : '✗ NOT caught'}: ${why}`); if (!caught) fail++;
}
console.log(`\n${fail ? '✗' : '✓'} verify-web-kit: ${fail ? fail + ' failed' : 'all passed'}`);
process.exit(fail ? 1 : 0);
