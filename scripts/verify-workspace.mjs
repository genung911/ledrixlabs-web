// Guard for the inspector workspace (/app).
//
//   node scripts/verify-workspace.mjs            (WEB_SRC=<dir> to point at another checkout,
//                                                 LEDRIX_APP=<dir> for the severity parity check)
//
// 1. EXECUTES lib/workspace/model.ts and lib/workspace/nav.ts (Node type stripping) — dashboard
//    arithmetic, access decision, finding status normalisation, evidence refs, redirect safety.
// 2. STATIC rules over lib/workspace + app/app + components/workspace:
//      read-only (no insert/update/upsert/delete/rpc), no account creation (signUp / OTP), an
//      isolated session (own storageKey, detectSessionInUrl false), no service-role key in browser
//      code, named profile columns only, Sign in link only on the Inspect page.
// 3. MUTATIONS — every static rule is run against a deliberately broken copy and must FAIL, so a
//    rule that can never fire is caught (feedback: guards that cannot fail).
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = process.env.WEB_SRC ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ?? join(ROOT, '..', 'ledrix-app');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); } };
const read = p => readFileSync(join(ROOT, p), 'utf8');
const walk = dir => {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap(n => {
    const rel = join(dir, n);
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : (/\.(tsx?|mjs)$/.test(n) ? [rel] : []);
  });
};

// ── 1. Executed model ──────────────────────────────────────────────────────────
// Copy to a temp dir with a .ts extension Node will strip (the files have no imports).
const tmp = mkdtempSync(join(tmpdir(), 'ws-'));
for (const f of ['model.ts', 'nav.ts']) writeFileSync(join(tmp, f), read(`lib/workspace/${f}`));
const M = await import(pathToFileURL(join(tmp, 'model.ts')).href);
const N = await import(pathToFileURL(join(tmp, 'nav.ts')).href);

console.log('model');
{
  const today = '2026-10-17';
  const insp = (id, o = {}) => ({ id, inspector_id: 'u1', assigned_inspector_id: null, address: id, inspection_type: 'home', status: 'active', started_at: null, completed_at: null, updated_at: '2026-10-17T10:00:00Z', deleted_at: null, ...o });
  const d = M.buildDashboard({
    today,
    inspections: [
      insp('a'),                                                          // in progress, 2 proposed
      insp('b', { status: 'completed' }),                                 // completed, not delivered
      insp('c', { status: 'completed' }),                                 // completed, delivered twice
      insp('d', { deleted_at: '2026-10-14T00:00:00Z', status: 'completed' }), // tombstone
      insp('e', { status: 'completed' }),                                 // completed with a proposal left
    ],
    findings: M.countFindings([
      { inspection_id: 'a', status: 'proposed' }, { inspection_id: 'a', status: 'inferred' },
      { inspection_id: 'a', status: 'confirmed' }, { inspection_id: 'e', status: 'processing' },
      { inspection_id: 'd', status: 'proposed' },
    ]),
    orders: [
      { id: 'o1', inspection_id: 'a', address: 'x', order_date: today, status: 'scheduled', inspector_id: 'u1' },
      { id: 'o2', inspection_id: null, address: 'y', order_date: today, status: 'cancelled', inspector_id: 'u1' },
      { id: 'o3', inspection_id: null, address: 'z', order_date: '2026-10-20', status: 'scheduled', inspector_id: 'u1' },
      { id: 'o4', inspection_id: null, address: 'w', order_date: '2026-11-30', status: 'scheduled', inspector_id: 'u1' },
      { id: 'o5', inspection_id: null, address: 'v', order_date: '2026-10-16', status: 'scheduled', inspector_id: 'u1' },
    ],
    reports: [
      { share_id: 'c', version: 'v1', published_at: '2026-10-10T00:00:00Z', pdf_path: 'p1', html_path: null },
      { share_id: 'c', version: 'v2', published_at: '2026-10-12T00:00:00Z', pdf_path: 'p2', html_path: null },
    ],
  });
  ok('today = scheduled orders on today only (cancelled excluded)', d.today.map(o => o.id).join() === 'o1', d.today.map(o => o.id).join());
  ok('upcoming = after today within 14 days', d.upcoming.map(o => o.id).join() === 'o3', d.upcoming.map(o => o.id).join());
  ok('tombstoned inspection never counted', d.totals.inspections === 4 && !d.attention.some(a => a.inspection.id === 'd'));
  ok('proposed total counts proposed+inferred+processing of live rows', d.totals.proposed === 3, String(d.totals.proposed));
  ok('review attention for a and e', ['a', 'e'].every(id => d.attention.some(x => x.inspection.id === id && x.reason === 'review')));
  ok('deliver attention for completed-undelivered b only', d.attention.filter(x => x.reason === 'deliver').map(x => x.inspection.id).join() === 'b');
  ok('completed with open proposals is review, not deliver', !d.attention.some(x => x.inspection.id === 'e' && x.reason === 'deliver'));
  ok('delivered uses latest version', d.delivered.length === 1 && d.delivered[0].latest.version === 'v2');
  ok('in progress = a only', d.inProgress.map(i => i.id).join() === 'a');
  ok('server "active" status reads as in progress', M.inspectionPhase({ status: 'active', completed_at: null }) === 'in_progress');
  ok('completed_at without status reads as completed', M.inspectionPhase({ status: null, completed_at: 'x' }) === 'completed');
  ok('addDays crosses month', M.addDays('2026-10-31', 1) === '2026-11-01');

  ok('unknown status is a proposal, never confirmed', M.normalizeFindingStatus('weird') === 'proposed');
  ok('legacy inferred is a proposal', M.normalizeFindingStatus('inferred') === 'proposed');
  ok('missing status is legacy confirmed', M.normalizeFindingStatus(null) === 'confirmed');

  ok('no profile → refused', M.decideAccess(null).ok === false);
  const insp1 = M.decideAccess({ id: 'u', full_name: 'A', company_id: 'c', role: 'inspector' });
  ok('inspector does not manage company', insp1.ok && insp1.managesCompany === false);
  const mgr = M.decideAccess({ id: 'u', full_name: 'A', company_id: 'c', role: 'manager' });
  ok('manager with company manages', mgr.ok && mgr.managesCompany === true);
  const solo = M.decideAccess({ id: 'u', full_name: 'A', company_id: null, role: 'owner' });
  ok('role without company manages nothing', solo.ok && solo.managesCompany === false);
  const odd = M.decideAccess({ id: 'u', full_name: 'A', company_id: 'c', role: 'superuser' });
  ok('unknown role collapses to inspector', odd.ok && odd.role === 'inspector' && !odd.managesCompany);

  ok('file:// photo is device-only', M.photoRef('file:///var/x.jpg')?.kind === 'device');
  ok('bare path is storage', M.photoRef('insp_1/a.jpg')?.kind === 'storage' && M.photoRef('/insp_1/a.jpg').path === 'insp_1/a.jpg');
  ok('https stays url', M.photoRef('https://x/y.jpg')?.kind === 'url');
  ok('empty → null', M.photoRef('') === null && M.photoRef(null) === null);

  ok('legacy anomaly severity → deficiency', M.parseSeverity('anomaly') === 'deficiency');

  // 2026-10-26 (ledrix-app cardDefinition.isPriorityUnset): an unconfirmed photo-only draft has no priority —
  // its severity column is a placeholder. Derived from synced columns, the same answer as the phone.
  ok('priority: an unconfirmed photo-only draft is NOT SET', M.isPriorityUnset({ source: 'document_photo', status: 'proposed' }) === true);
  ok('priority: a confirmed photo-only finding is graded', M.isPriorityUnset({ source: 'document_photo', status: 'confirmed' }) === false
    && M.isPriorityUnset({ source: 'document_photo', status: null }) === false);
  ok('priority: a worded proposal keeps its stated priority', M.isPriorityUnset({ source: 'text_chat', status: 'proposed' }) === false);
  ok('priority: the inspection page passes it to the pill', /<PriorityPill severity=\{r\.severity\} unset=\{isPriorityUnset\(r\)\} suggested=\{isPrioritySuggested\(r\)\} \/>/.test(read('app/app/inspections/[id]/page.tsx')));
  // 2026-11-01: Ledrix's recommended priority (ai_severity) is a priority, tagged LEDRIX SUGGESTS until decided.
  ok('priority: a photo-only draft with Ledrix\'s recommendation is set', M.isPriorityUnset({ source: 'document_photo', status: 'proposed', severity: 'critical', ai_severity: 'critical' }) === false);
  ok('priority: …and reads as Ledrix\'s suggestion', M.isPrioritySuggested({ source: 'document_photo', status: 'proposed', severity: 'critical', ai_severity: 'critical' }) === true);
  ok('priority: changed or confirmed, it is no longer a suggestion', M.isPrioritySuggested({ source: 'document_photo', status: 'proposed', severity: 'maintenance', ai_severity: 'critical' }) === false
    && M.isPrioritySuggested({ source: 'document_photo', status: 'confirmed', severity: 'critical', ai_severity: 'critical' }) === false);

  // 2026-10-21 (approved parity mockup): the Reports page and the sync line.
  const I = (id, status, extra = {}) => ({ id, status, inspector_id: null, assigned_inspector_id: null, updated_at: `2026-10-${10 + id.length}`, ...extra });
  const rl = M.buildReportsList(
    [I('a', 'completed'), I('bb', 'completed'), I('ccc', 'completed'), I('dddd', 'in_progress'), I('eeeee', 'completed', { deleted_at: '2026-10-20' })],
    [{ share_id: 'a', version: '1', published_at: '2026-10-11', pdf_path: 'p1', html_path: null }, { share_id: 'a', version: '2', published_at: '2026-10-12', pdf_path: 'p2', html_path: null }],
    { bb: { proposed: 1, confirmed: 0, rejected: 0 } });
  ok('reports: a completed inspection with a published report is SENT, latest version first',
    rl.sent.length === 1 && rl.sent[0].latest.version === '2' && rl.sent[0].versions === 2);
  ok('reports: without one it is TO SEND — or REVIEW while proposed findings remain (the dashboard\'s rule)',
    rl.toSend.map(i => i.id).join() === 'ccc' && rl.review.map(i => i.id).join() === 'bb');
  ok('reports: in-progress and tombstoned inspections are not reports', ![...rl.toSend, ...rl.review, ...rl.sent.map(x => x.inspection)].some(i => i.id === 'dddd' || i.id === 'eeeee'));
  // 2026-11-01: a sync that changed only findings must move the inspection's "Updated" (server times, not the phone's).
  {
    const rows = [{ id: 'k', updated_at: '2026-10-31T14:59:35Z', server_updated_at: '2026-10-31T15:03:41Z' }, { id: 'q', updated_at: '2026-10-20T00:00:00Z' }];
    const out = M.withLatestActivity(rows, [{ inspection_id: 'k', server_updated_at: '2026-11-01T22:54:39Z' }, { inspection_id: 'k', server_updated_at: null }, { inspection_id: 'x', server_updated_at: '2026-12-01T00:00:00Z' }]);
    ok('activity: a finding synced today moves its inspection\'s Updated to today', out[0].updated_at === '2026-11-01T22:54:39Z');
    ok('activity: an inspection with no newer work keeps its own time', out[1].updated_at === '2026-10-20T00:00:00Z');
    ok('activity: the inspection\'s server time wins over its phone clock', M.withLatestActivity([rows[0]], [])[0].updated_at === '2026-10-31T15:03:41Z');
    // A phone's photo-to-room records (empty value, ledrix-app capturePipeline) are not specs: the Specs table skips them
    ok('specs: a photo-to-room placeholder (empty value) is not listed as a spec', /return rows\.filter\(r => !isPhotoPlaceholder\(r\)\);/.test(read('lib/workspace/data.ts'))
      && /export const isPhotoPlaceholder = \(s: \{ id\?: string \| null; material\?: string \| null \}\) => !String\(s\?\.material \?\? ''\)\.trim\(\);/.test(read('lib/workspace/data.ts')));
    ok('activity: the loaders apply it and re-sort the list on it', /return \(await withActivity\(rows\)\)\.sort\(/.test(read('lib/workspace/data.ts'))
      && /return row \? \(await withActivity\(\[row\]\)\)\[0\] : null;/.test(read('lib/workspace/data.ts')));
  }
  ok('sync line: the newest updated_at, or null for no rows', M.latestUpdate([{ updated_at: '2026-10-01' }, { updated_at: '2026-10-19' }, { updated_at: null }]) === '2026-10-19' && M.latestUpdate([]) === null);
}

console.log('redirect');
{
  for (const [inp, want] of [
    ['/app/inspections/x', '/app/inspections/x'], ['/app', '/app'], ['/app?x=1', '/app?x=1'],
    ['https://evil.com', '/app'], ['//evil.com/app', '/app'], ['/apple', '/app'], ['/app\\..\\x', '/app'],
    ['/app/login?next=//evil', '/app'], [null, '/app'], ['/share/abc', '/app'],
  ]) ok(`safeNext(${JSON.stringify(inp)})`, N.safeNext(inp) === want, N.safeNext(inp));
}

// Severity parity with the app (skipped, and said so, when the app checkout is absent).
console.log('severity parity');
{
  const p = join(APP, 'src/core/theme/SeverityConfig.ts');
  if (!existsSync(p)) console.log('  · skipped — ledrix-app not found at', APP);
  else {
    const src = readFileSync(p, 'utf8');
    const block = name => (src.match(new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\};`)) ?? [])[1] ?? '';
    const pairs = b => Object.fromEntries([...b.matchAll(/(\w+):\s*'([^']+)'/g)].map(m => [m[1], m[2]]));
    const short = pairs(block('SEVERITY_SHORT_LABELS')), color = pairs(block('SEVERITY_COLOR'));
    ok('app short labels found', Object.keys(short).length === 5);
    for (const s of M.SEVERITIES_IN_ORDER) {
      ok(`label ${s} matches app`, M.SEVERITY_SHORT_LABELS[s] === short[s], `${M.SEVERITY_SHORT_LABELS[s]} vs ${short[s]}`);
      ok(`color ${s} matches app`, M.SEVERITY_COLOR[s] === color[s], `${M.SEVERITY_COLOR[s]} vs ${color[s]}`);
    }
  }
}

// ── 2. Static rules ────────────────────────────────────────────────────────────
const files = [...walk('lib/workspace'), ...walk('app/app'), ...walk('components/workspace')];
const srcs = Object.fromEntries(files.map(f => [f, read(f)]));
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const READ_RPCS = /\.rpc\('job_team',/g;
const RULES = {
  // Photos (ledrix-app PLAN_2026-10-28_photos_to_server P5): a deleted photo is a tombstone on the server — never shown.
  'photos: a deleted photo is never shown': all => {
    const d = strip(all['lib/workspace/data.ts'] ?? '');
    const fn = d.slice(d.indexOf('export async function loadPhotos('), d.indexOf('export async function loadItemLabels('));
    return /from\('inspection_photos'\)/.test(fn) && /\.is\('deleted_at', null\)/.test(fn) ? [] : ['lib/workspace/data.ts'];
  },
  // 2026-10-30: READ_RPCS are server functions that only read (job_team returns the team of a job, #81). Named one by
  // one — any other .rpc( is still a write.
  'read-only: no write calls': all => Object.entries(all).filter(([, s]) => /\.(insert|update|upsert|delete|rpc)\s*\(/.test(strip(s).replace(READ_RPCS, ''))).map(([f]) => f),
  'read-only: no storage upload/remove': all => Object.entries(all).filter(([, s]) => /\.(upload|remove|move|copy)\s*\(/.test(strip(s))).map(([f]) => f),
  'no account creation': all => Object.entries(all).filter(([, s]) => /signUp\s*\(|signInWithOtp\s*\(|signInWithOAuth\s*\(/.test(strip(s))).map(([f]) => f),
  'no service-role key in browser code': all => Object.entries(all).filter(([, s]) => /SERVICE_ROLE/.test(s)).map(([f]) => f),
  'only the workspace client is used': all => Object.entries(all).filter(([, s]) => /lib\/supabaseClient/.test(strip(s))).map(([f]) => f),
  'profile read names its columns': all => {
    const s = strip(all['lib/workspace/data.ts'] ?? '');
    const m = s.match(/from\('inspector_profiles'\)\.select\('([^']*)'\)/);
    return !m || /\*|stripe/i.test(m[1]) ? ['lib/workspace/data.ts'] : [];
  },
  'isolated session': all => {
    const s = strip(all['lib/workspace/client.ts'] ?? '');
    return /storageKey:\s*WORKSPACE_STORAGE_KEY/.test(s) && /detectSessionInUrl:\s*false/.test(s) && /WORKSPACE_STORAGE_KEY = '(?!sb-)[^']+'/.test(s) ? [] : ['lib/workspace/client.ts'];
  },
  'login uses password sign-in and safe redirect': all => {
    const s = strip(all['app/app/login/page.tsx'] ?? '');
    return /signInWithPassword\(/.test(s) && /safeNext\(/.test(s) ? [] : ['app/app/login/page.tsx'];
  },
  'workspace is noindex': all => /robots:\s*\{\s*index:\s*false/.test(all['app/app/layout.tsx'] ?? '') ? [] : ['app/app/layout.tsx'],
};

console.log('static');
for (const [name, rule] of Object.entries(RULES)) { const bad = rule(srcs); ok(name, bad.length === 0, bad.join(', ')); }

{
  const inspect = read('app/inspect/page.tsx'), nav = read('components/marketing/Navbar.tsx');
  ok('Inspect page passes signInHref=/app/login', /signInHref="\/app\/login"/.test(inspect));
  ok('Navbar renders Sign in from the prop (desktop + mobile)', (nav.match(/\{signInHref && \(/g) ?? []).length === 2);
  const others = ['app/page.tsx', 'app/home/page.tsx', 'app/about/page.tsx', 'app/ethix/page.tsx'].filter(p => existsSync(join(ROOT, p)) && /signInHref/.test(read(p)));
  ok('Sign in link not on non-Inspect pages', others.length === 0, others.join(', '));
  ok('Request a demo CTA still present', /Request a demo/.test(nav));
  // 2026-10-21: one vocabulary with the phone, and the permanent banner replaced by the sync line.
  const shell = read('components/workspace/WorkspaceShell.tsx');
  const labels = [...shell.matchAll(/\{ href: '([^']+)', label: '([^']+)'/g)].map(m => m[2]);
  // 2026-10-30: Invoices added (ledrix-app PLAN_2026-10-29 Part E4, approved mockup; the phone's name for it too).
  // 2026-11-05: Contacts added (approved Contacts mockup; the phone's word — ContactsScreen).
  // 2026-11-05: the office pages (approved office mockup, "use all recommendations"): Services & prices, Payments.
  // 2026-11-05: Contacts became the CRM (CRM home mockup approved: "when clicked from menu, it should open a CRM page").
  // 2026-11-05 (owner, "Use recommendations"): seven items — Team, Services & prices and Payments are Company's tabs.
  ok('sidebar: Today · Inspections · CRM · Reports · Invoices · Templates · Company', labels.join(' · ') === 'Today · Inspections · CRM · Reports · Invoices · Templates · Company', labels.join(' · '));
  ok('every sidebar page exists', [...shell.matchAll(/\{ href: '\/app([^']*)'/g)].every(m => existsSync(join(ROOT, `app/app${m[1]}/page.tsx`))));
  const pages = ['app/app/page.tsx', 'app/app/inspections/page.tsx', 'app/app/inspections/[id]/page.tsx', 'app/app/reports/page.tsx'];
  ok('no page shows the permanent "View only" banner; each shows the sync line', pages.every(p => !/<ReadOnlyNotice/.test(read(p)) && /<SyncLine /.test(read(p))));
}

// ── 3. Mutations: each rule must catch a broken copy ───────────────────────────
console.log('mutations');
const MUT = {
  'photos: a deleted photo is never shown': s => ({ ...s, 'lib/workspace/data.ts': s['lib/workspace/data.ts'].replace(".eq('inspection_id', inspectionId).is('deleted_at', null).", ".eq('inspection_id', inspectionId).") }),   // anchored on the filter alone (2026-11-04: the cover-photo .neq after it moved the old anchor)
  'read-only: no write calls': s => ({ ...s, 'lib/workspace/data.ts': s['lib/workspace/data.ts'] + "\nworkspace.from('anomalies').update({ status: 'confirmed' });" }),
  'read-only: no storage upload/remove': s => ({ ...s, 'lib/workspace/data.ts': s['lib/workspace/data.ts'] + "\nworkspace.storage.from('x').upload('a', b);" }),
  'no account creation': s => ({ ...s, 'app/app/login/page.tsx': s['app/app/login/page.tsx'] + "\nworkspace.auth.signUp({ email, password });" }),
  'no service-role key in browser code': s => ({ ...s, 'lib/workspace/client.ts': s['lib/workspace/client.ts'] + "\nconst k = process.env.SUPABASE_SERVICE_ROLE_KEY;" }),
  'only the workspace client is used': s => ({ ...s, 'app/app/page.tsx': "import { supabase } from '@/lib/supabaseClient';\n" + s['app/app/page.tsx'] }),
  'profile read names its columns': s => ({ ...s, 'lib/workspace/data.ts': s['lib/workspace/data.ts'].replace("select('id, full_name, company_id, role')", "select('*')") }),
  'isolated session': s => ({ ...s, 'lib/workspace/client.ts': s['lib/workspace/client.ts'].replace('detectSessionInUrl: false', 'detectSessionInUrl: true') }),
  'login uses password sign-in and safe redirect': s => ({ ...s, 'app/app/login/page.tsx': s['app/app/login/page.tsx'].replace(/safeNext\(/g, 'String(') }),
  'workspace is noindex': s => ({ ...s, 'app/app/layout.tsx': s['app/app/layout.tsx'].replace('index: false', 'index: true') }),
};
for (const [name, mutate] of Object.entries(MUT)) {
  const mutated = mutate(srcs);
  const changed = Object.keys(mutated).some(k => mutated[k] !== srcs[k]);
  ok(`mutation applies: ${name}`, changed);
  ok(`mutation caught: ${name}`, RULES[name](mutated).length > 0);
}
ok('every rule has a mutation', Object.keys(RULES).every(r => r in MUT));

// ── 4. Navigation (owner 2026-11-05: icon rail, Template Builder tabs, Company tabs) ───────────────────────────
// Static rules over the real sources, each proven by an in-memory mutation below (nothing is written to disk).
console.log('navigation');
const NAV_SRC = {
  shell: read('components/workspace/WorkspaceShell.tsx'), tabs: read('components/workspace/CompanyTabs.tsx'),
  tpl: read('app/app/templates/[id]/page.tsx'),
  company: read('app/app/company/page.tsx'), team: read('app/app/team/page.tsx'),
  services: read('app/app/company/services/page.tsx'), payments: read('app/app/company/payments/page.tsx'),
};
const NAV_RULES = {
  'rail: ~56px at rest, slides out OVER the page on hover and focus, tucks back on leave/blur/Escape': s => {
    const t = s.shell, bad = [];
    if (!/function Rail\(/.test(t) || !/<Rail nav=\{nav\}/.test(t)) bad.push('no rail');
    if (!/className="relative hidden w-14 shrink-0 lg:sticky lg:top-0 lg:block lg:h-screen"/.test(t)) bad.push('rail slot is not 56px / desktop-only');
    if (!/absolute inset-y-0 left-0 z-40/.test(t) || !/open \? 'w-60 shadow-xl' : 'w-14'/.test(t)) bad.push('menu does not overlay / expand');
    if (!/onMouseEnter=\{\(\) => setOpen\(true\)\}/.test(t) || !/onFocusCapture=\{\(\) => setOpen\(true\)\}/.test(t)) bad.push('no hover/focus open');
    if (!/onMouseLeave=/.test(t) || !/onBlurCapture=/.test(t) || !/e\.key === 'Escape'/.test(t)) bad.push('does not tuck back');
    if (!/motion-reduce:transition-none/.test(t)) bad.push('ignores reduced motion');
    return bad;
  },
  'rail: every icon link has a name and the active item is marked': s => {
    const t = s.shell, bad = [];
    if (!/aria-label=\{n\.label\}/.test(t)) bad.push('icon link without aria-label');
    if (!/<span className=\{`whitespace-nowrap \$\{open \? '' : 'sr-only'\}`\}>\{n\.label\}<\/span>/.test(t)) bad.push('label not kept for screen readers');
    if (!/aria-current=\{on \? 'page' : undefined\}/.test(t)) bad.push('active not marked');
    const icons = [...t.matchAll(/^  '(\/app[^']*)': 'M/gm)].map(m => m[1]);
    const hrefs = [...t.matchAll(/\{ href: '(\/app[^']*)', label:/g)].map(m => m[1]);
    for (const h of hrefs) if (!icons.includes(h)) bad.push(`no icon for ${h}`);
    return bad;
  },
  'rail: the account (name, Appearance, Sign out) sits behind an initials button': s => {
    const t = s.shell, bad = [];
    if (!/aria-label=\{`Account: \$\{name \?\? 'Signed in'\}`\}/.test(t) || !/\{initialsOf\(name\)\}/.test(t)) bad.push('no initials button');
    if (!/function UserBlock[\s\S]{0,600}<AppearanceSwitch \/>[\s\S]{0,300}onClick=\{signOut\}/.test(t)) bad.push('account menu lacks Appearance / Sign out');
    if (!/\{menu && \(\s*<div role="dialog" aria-label="Account"/.test(t)) bad.push('account menu not behind the button');
    return bad;
  },
  'phones and tablets keep the top bar': s => {
    const t = s.shell, bad = [];
    if (!/flex h-14 items-center justify-between border-b border-hairline bg-surface px-4 lg:hidden/.test(t)) bad.push('top bar gone');
    if (!/<aside className=\{`\$\{navOpen \? 'block' : 'hidden'\} border-b border-hairline bg-surface lg:hidden`\}>/.test(t)) bad.push('mobile menu gone');
    return bad;
  },
  'menu: seven items in order, each gated as before': s => {
    const t = s.shell, bad = [];
    const want = [["'/app'", "'Today'", 'true'], ["'/app/inspections'", "'Inspections'", 'true'], ["'/app/crm'", "'CRM'", 'canCrm'], ["'/app/reports'", "'Reports'", 'true'],
      ["'/app/invoices'", "'Invoices'", 'canInvoice'], ["'/app/templates'", "'Templates'", '!!access.companyId'], ["'/app/company'", "'Company'", '!!access.companyId || canServices || canPayments']];
    const got = [...t.matchAll(/\{ href: ('[^']+'), label: ('[^']+'), show: ([^}]+?) \}/g)].map(m => [m[1], m[2], m[3]]);
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(JSON.stringify(got));
    if (!/COMPANY_PATHS = \['\/app\/company', '\/app\/team'\]/.test(t)) bad.push('Company not lit on Team');
    return bad;
  },
  'company: Profile · Team · Services & prices · Payments, gated as their menu items were': s => {
    const t = s.tabs, bad = [];
    const got = [...t.matchAll(/\{ href: '([^']+)', label: '([^']+)', show: (.*) \},?$/gm)].map(m => `${m[2]}=${m[1]}:${m[3]}`);
    const want = ['Profile=/app/company:true', 'Team=/app/team:!!access.companyId', 'Services & prices=/app/company/services:canServices',
      'Payments=/app/company/payments:mayManagePayments({ companyId: access.companyId, role: access.role })'];
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(JSON.stringify(got));
    if (!/\.filter\(t => t\.show\)/.test(t)) bad.push('hidden tabs are shown');
    for (const [k, f] of [['company', 'app/app/company/page.tsx'], ['team', 'app/app/team/page.tsx'], ['services', 'app/app/company/services/page.tsx'], ['payments', 'app/app/company/payments/page.tsx']])
      if (!/<CompanyTabs \/>/.test(s[k])) bad.push(`${f} has no Company tabs`);
    return bad;
  },
  'old URLs: each company page keeps its route, and refuses as before': s => {
    const bad = [];
    for (const f of ['app/app/company/page.tsx', 'app/app/team/page.tsx', 'app/app/company/services/page.tsx', 'app/app/company/payments/page.tsx'])
      if (!existsSync(join(ROOT, f))) bad.push(`${f} missing`);
    if (!/if \(!owner\) return <Page><CompanyTabs \/><ErrorBox message="Only the company owner connects payments\." \/><\/Page>;/.test(s.payments)) bad.push('Payments no longer refuses a non-owner');
    if (!/setEditable\(mayEditServices\(/.test(s.services)) bad.push('Services no longer checks who may edit');
    return bad;
  },
  'template: seven tabs in order, publish controls in the header, version box on Overview': s => {
    const t = s.tpl, bad = [];
    const labels = [...t.matchAll(/\{ id: '[a-z]+', label: '([^']+)', icon:/g)].map(m => m[1]);
    // 2026-11-06 (owner): Building Types left the rail — buildings are the strip across the top of Systems.
    if (labels.join(' · ') !== 'Overview · Systems · Gates · How Many? · Requirements · Report Content · Review & Publish') bad.push(labels.join(' · '));
    if (!/<nav aria-label="Template sections" className="-mb-3 mt-2 flex min-w-0 flex-1 gap-1 overflow-x-auto">/.test(t)) bad.push('sections are not a scrolling tab row');   // 2026-11-06: shares its row with Edit / Preview
    const header = t.slice(t.indexOf('{/* top bar */}'), t.indexOf('<nav aria-label="Template sections"'));
    if (!/>Publish<\/button>/.test(header) || !/>Save draft<\/button>/.test(header) || !/>Discard draft<\/button>/.test(header)) bad.push('publish controls left the header');
    if (/xl:w-\[220px\]/.test(t)) bad.push('the second column is still there');
    const overview = t.slice(t.indexOf("{section === 'overview' && ("), t.indexOf("{section === 'buildings' && ("));
    if (!/aria-label="Template version"/.test(overview) || !/Each inspection keeps the copy of the template it started with\./.test(overview)) bad.push('version box not on Overview');
    return bad;
  },
};
for (const [name, rule] of Object.entries(NAV_RULES)) { const bad = rule(NAV_SRC); ok(name, bad.length === 0, bad.join('; ')); }
const NAV_MUT = [
  ['rail: ~56px at rest, slides out OVER the page on hover and focus, tucks back on leave/blur/Escape', 'shell', "open ? 'w-60 shadow-xl' : 'w-14'", "'w-60'"],
  ['rail: ~56px at rest, slides out OVER the page on hover and focus, tucks back on leave/blur/Escape', 'shell', "absolute inset-y-0 left-0 z-40", "relative"],
  ['rail: ~56px at rest, slides out OVER the page on hover and focus, tucks back on leave/blur/Escape', 'shell', "if (e.key === 'Escape')", "if (false)"],
  ['rail: every icon link has a name and the active item is marked', 'shell', "aria-label={n.label} ", ""],
  ['rail: every icon link has a name and the active item is marked', 'shell', "  '/app/invoices': 'M", "  '/app/billing': 'M"],
  ['rail: the account (name, Appearance, Sign out) sits behind an initials button', 'shell', "{menu && (", "{true && ("],
  ['phones and tablets keep the top bar', 'shell', "border-b border-hairline bg-surface lg:hidden`}>", "border-b border-hairline bg-surface hidden`}>"],
  ['menu: seven items in order, each gated as before', 'shell', "{ href: '/app/invoices', label: 'Invoices', show: canInvoice }", "{ href: '/app/invoices', label: 'Invoices', show: true }"],
  ['menu: seven items in order, each gated as before', 'shell', "{ href: '/app/company', label: 'Company', show: !!access.companyId || canServices || canPayments },", "{ href: '/app/company', label: 'Company', show: !!access.companyId || canServices || canPayments },\n    { href: '/app/team', label: 'Team', show: !!access.companyId },"],
  ['company: Profile · Team · Services & prices · Payments, gated as their menu items were', 'tabs', "label: 'Payments', show: mayManagePayments({ companyId: access.companyId, role: access.role })", "label: 'Payments', show: true"],
  ['company: Profile · Team · Services & prices · Payments, gated as their menu items were', 'team', "<CompanyTabs />", "<div />"],
  ['old URLs: each company page keeps its route, and refuses as before', 'payments', "if (!owner) return <Page><CompanyTabs /><ErrorBox", "if (false) return <Page><CompanyTabs /><ErrorBox"],
  ['template: seven tabs in order, publish controls in the header, version box on Overview', 'tpl', "{ id: 'systems', label: 'Systems',", "{ id: 'systems', label: 'Systems & Components',"],
  ['template: seven tabs in order, publish controls in the header, version box on Overview', 'tpl', '<section aria-label="Template version"', '<section aria-label="Version"'],
];
for (const [rule, f, from, to] of NAV_MUT) {
  const applies = NAV_SRC[f].split(from).length === 2;
  ok(`nav mutation applies: ${rule.slice(0, 40)}… (${to.slice(0, 30)})`, applies);
  if (applies) ok(`nav mutation caught: ${rule.slice(0, 40)}… (${to.slice(0, 30)})`, NAV_RULES[rule]({ ...NAV_SRC, [f]: NAV_SRC[f].replace(from, to) }).length > 0);
}
ok('every navigation rule has a mutation', Object.keys(NAV_RULES).every(r => NAV_MUT.some(m => m[0] === r)));

console.log(`\n${fail ? '✗' : '✓'} verify-workspace: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
