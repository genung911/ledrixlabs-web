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

const RULES = {
  'read-only: no write calls': all => Object.entries(all).filter(([, s]) => /\.(insert|update|upsert|delete|rpc)\s*\(/.test(strip(s))).map(([f]) => f),
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
}

// ── 3. Mutations: each rule must catch a broken copy ───────────────────────────
console.log('mutations');
const MUT = {
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

console.log(`\n${fail ? '✗' : '✓'} verify-workspace: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
