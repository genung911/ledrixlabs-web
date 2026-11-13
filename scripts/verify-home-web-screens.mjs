#!/usr/bin/env node
// ─── Guard: the report link opens Ledrix Home's five sections (One Home phase 2, owner 2026-11-12) ───────────────
// Mockup https://claude.ai/artifact/GejuM8pyUwwkWUyVnuPFGD "approved". Static checks on app/share/[id]/page.tsx, each
// proved by an in-memory mutation (§M):
//   1. the rail is Home · Systems · Maintain · History · Report, and every older screen lights the section it belongs to
//   2. Systems and each System screen come from the shared model (lib/scope/core/home/homeSystemsModel.ts, the app's own
//      file), never a second copy of its rules here
//   3. a System screen: year made against its life, the CHECKED manual (the model's), its upkeep, its findings
//   4. Maintain holds upkeep, repair status and the repair request; History holds the service history and documents
//   5. no 3D house and no sensors on the web
//   6. claiming: an emailed code; on sign-in a homeowner profile, the client's reports, the report link's home (resident)
//   node scripts/verify-home-web-screens.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(join(repo, 'app/share/[id]/page.tsx'), 'utf8');

function checks(src) {
  const out = [];
  const ok = (n, c) => out.push({ n, c: !!c });
  ok('1 the rail is the five sections, in order', /const RAIL: \{ tab: Tab; label: string \}\[\] = \[\s*\{ tab: 'home', label: 'Home' \}, \{ tab: 'systems', label: 'Systems' \}, \{ tab: 'maintain', label: 'Maintain' \},\s*\{ tab: 'history', label: 'History' \}, \{ tab: 'report', label: 'Report' \},\s*\];/.test(src)
    && src.includes('<HomeRail active={tab} onPick={pick} />') && src.includes('const pick = (t: Tab) => { setHist([]); setTab(t); };'));
  ok('1 an older screen lights its section', src.includes("const RAIL_OF: Partial<Record<Tab, Tab>> = { findings: 'systems', specs: 'systems', reminders: 'maintain', projects: 'maintain', repairs: 'maintain', docs: 'history' };")
    && src.includes('const on = RAIL_OF[active] ?? active;'));
  ok('2 Systems reads the shared model', src.includes("import { homeSystems, type HomeSystem } from '@/lib/scope/core/home/homeSystemsModel';")
    && src.includes('homeSystems({ specs: Array.isArray(record.specs) ? record.specs : [], findings: anomalies, inspectedAt: record.inspection_date ?? null })')
    && !/isPastServiceLife|serviceLifeFor|manual_verified_at/.test(src.slice(src.indexOf('function SystemsTab('), src.indexOf('function MaintainTab('))));
  ok('3 a System screen: year vs life, the checked manual, its upkeep, its findings',
    src.includes('{s.made && (') && src.includes('Typical life {s.life.low}–{s.life.high} years.') && src.includes('{s.manual && (')
    && src.includes('<a href={s.manual.url} target="_blank" rel="noopener noreferrer"') && src.includes('{s.upkeep.length > 0 && (') && src.includes('s.findings.map((f, i) =>'));
  ok('3 the old specs link opens Systems', src.includes("(tab === 'systems' || tab === 'specs') && <SystemsTab") && src.includes("setTab(t === 'specs' ? 'systems' : t)"));
  ok('4 Maintain: upkeep, repair status, repair request', src.includes("const parts: [typeof part, string][] = [['upkeep', 'Upkeep'], ['projects', 'Repair status'], ['repairs', 'Repair request']];")
    && src.includes('showHistory={false} />}') && src.includes("{tab === 'maintain'  && <MaintainTab"));
  ok('4 History: the service history, then documents', /function HistoryTab[\s\S]{0,600}<ServiceHistory log=\{log\} onRefresh=\{onRefresh\} \/>[\s\S]{0,120}<DocsTab record=\{record\} \/>/.test(src)
    && src.includes("{tab === 'history'   && <HistoryTab"));
  // 6 (phase 3, owner 2026-11-12 "email code first", "spouse yes"): claim by an emailed code, then claim on sign-in
  ok('6 the emailed code signs in on this page', src.includes("await supabase.auth.verifyOtp({ email: email.trim(), token: t, type: 'email' });")
    && src.includes('autoComplete="one-time-code"'));
  ok('6 signed in: a homeowner, the client\'s reports, and (on the report\'s own link only) this home as resident',
    src.includes("await supabase.from('homeowner_profiles').upsert({ id: uid, email: session.user.email ?? null, origin: 'claim_link' });")
    && src.includes("await supabase.rpc('claim_my_reports');")
    && src.includes("if (canEdit() && PORTAL_TOKEN) { const r = await supabase.rpc('claim_by_link', { raw_token: PORTAL_TOKEN });"));
  ok('6 an inspector\'s email is told to use another', (src.match(/This email is registered as an inspector\. Use a different email for Ledrix Home\./g) ?? []).length === 2);
  ok('6 "Claim your home" shows to someone not signed in', src.includes('claim={!session ? <ClaimCard onClaim={() => setSubOpen(true)} /> : undefined}'));
  ok('5 no 3D house or sensors on the web', !/SpatialTwinGL|Dollhouse|SensorsLens|sensor_readings/.test(src));
  return out;
}

let fail = 0;
for (const x of checks(PAGE)) { console.log(`  ${x.c ? '✓' : '✗'} ${x.n}`); if (!x.c) fail++; }
console.log('\nmutations');
const MUT = [
  ['the rail loses History', "{ tab: 'history', label: 'History' }, ", ''],
  ['an old screen lights nothing', 'const on = RAIL_OF[active] ?? active;', 'const on = active;'],
  ['Systems ignores the inspection date', 'inspectedAt: record.inspection_date ?? null', 'inspectedAt: null'],
  ['an unchecked manual is linked from the page', '{s.manual && (', '{(s.manual || record.specs?.[0]) && ('],
  ['Maintain shows the history twice', 'showHistory={false} />}', 'showHistory />}'],
  ['History has no documents', '      <DocsTab record={record} />\n    </div>\n  );\n}\n\n/** "Make this home yours"', '    </div>\n  );\n}\n\n/** "Make this home yours"'],
  ['a view-only link claims the home', 'if (canEdit() && PORTAL_TOKEN) { const r', 'if (PORTAL_TOKEN) { const r'],
  ['the code is checked as a magic link', "token: t, type: 'email' });", "token: t, type: 'magiclink' });"],
  ['the claim card shows when signed in', 'claim={!session ? <ClaimCard', 'claim={true ? <ClaimCard'],
  ['the client\'s own reports are never claimed', "await supabase.rpc('claim_my_reports');", "({ data: [] });"],
  ['the specs link is a dead end', "(tab === 'systems' || tab === 'specs') && <SystemsTab", "tab === 'systems' && <SystemsTab"],
];
for (const [why, a, b] of MUT) {
  if (PAGE.split(a).length !== 2) { fail++; console.log(`  ✗ anchor present once: ${why}`); continue; }
  const caught = checks(PAGE.replace(a, b)).some(x => !x.c);
  console.log(`  ${caught ? '✓ caught' : '✗ NOT caught'}: ${why}`); if (!caught) fail++;
}
console.log(`\nverify-home-web-screens: ${fail ? fail + ' failed' : 'all passed'}`);
process.exit(fail ? 1 : 0);
