#!/usr/bin/env node
// ─── Guard: the portal reaches its data only through the token ───────────────────────
//
// (Ledrix security fix, 2026-08-29.) The portal's seven tables were readable and DELETABLE by
// anyone holding the anon key, straight through /api/proxy. This asserts the shape of the fix:
// /api/proxy is gone, every portal call goes through /api/portal, and /api/portal cannot be
// steered at a share the caller has not proven a token for.
//
// A guard, not a live probe — it reads the source. The live probe that FOUND the hole (an anon
// no-match DELETE returning 204) is recorded in the fix's own commit and in CURRENT_STATE; this
// keeps the fix from silently regressing.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0; const failures = [];
const ok = (l, c, d) => { checks++; if (!c) failures.push(d ? `${l}\n      ${d}` : l); };
const read = (rel) => existsSync(join(root, rel))
  ? readFileSync(join(root, rel), 'utf8') : null;

const strip = (t) => t ? t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1') : t;
const route   = read('app/api/portal/route.ts');
const routeCode = strip(route);
const page    = read('app/share/[id]/page.tsx');
const repairs = read('app/share/[id]/repairs/page.tsx');
const sql     = read('supabase_portal_lockdown.sql');
// The allow-list and filter grammar moved here 2026-10-19; the route enforces them.
const policy  = read('lib/portalPolicy.ts');
// Token resolution (with scopes and revocation) moved here 2026-10-19; every route calls it.
const access  = strip(read('lib/shareAccess.ts'));
const policyCode = strip(policy);

// ── 1. THE OPEN PASSTHROUGH IS GONE ─────────────────────────────────────────────────
ok('A1 /api/proxy is deleted', !existsSync(join(root, 'app/api/proxy/route.ts')),
  'It forwarded any table + any op with the anon key — the hole itself.');
ok('A1 nothing calls /api/proxy any more',
  !!page && !!repairs &&
  !/fetch\(`\/api\/proxy/.test(page) && !/fetch\(`\/api\/proxy/.test(repairs) &&
  !/fetch\('\/api\/proxy/.test(page + repairs),
  'a single surviving anon call keeps the whole table world-writable');

// ── 2. THE NEW ROUTE HOLDS THE SERVICE ROLE AND VALIDATES A TOKEN ──────────────────
ok('A2 /api/portal exists', !!route);
if (route) {
  ok('A2 it uses the service role, server-side',
    /SUPABASE_SERVICE_ROLE_KEY/.test(route) && /export const runtime = 'nodejs'/.test(route),
    'the whole point is that the powerful key lives on the server, never in the client');
  ok('A2 the anon key is never used to authorize a request',
    !/ANON/i.test(routeCode),
    'reaching for the anon key in CODE (comments explaining the old hole are fine) would be ' +
    'rebuilding the proxy');
  ok('A2 the token is resolved to a share_id server-side',
    !!access && /home_records\?share_token=eq\./.test(access)
      && /const access = await resolvePortalToken\(token\);/.test(routeCode),
    'a caller must not be able to assert which share they are — the server decides from the token');
  ok('A2 a bad or unknown token is a 404, indistinguishable from a miss',
    /if \(!access \|\| !scopeAllows\(access\.scope, table, op\)\) return notFound\(\);/.test(routeCode),
    'telling a wrong token from an unknown one is an enumeration oracle');
}

// ── 3. EVERY OPERATION IS CONFINED TO THE RESOLVED SHARE ───────────────────────────
if (route) {
  ok('A3 a client-supplied share_id is stripped, not trusted',
    !!policyCode && /if \(col === 'share_id'\) continue;/.test(policyCode)
      && /const terms = cleanFilter\(payload\.filter, op\);/.test(routeCode),
    'accepting the client share_id is exactly the harvestable-token hole, reopened one layer up');
  ok('A3 the resolved share_id is forced onto the filter',
    /return \[`share_id=eq\.\$\{encodeURIComponent\(shareId\)\}`, \.\.\.terms\]\.join\('&'\)/.test(routeCode)
      && (routeCode.match(/scoped\(terms, shareId\)/g) ?? []).length === 2
      && /scoped\(\[\.\.\.terms, \.\.\.guard\], shareId\)/.test(routeCode),
    'a read or a delete with no scope is a read or delete of every share');
  ok('A3 an insert is forced under the resolved share',
    /\(\{ \.\.\.row, share_id: shareId \}\)\)/.test(routeCode),
    'without this a homeowner could file a row under someone else\'s share');
  // Updates keep only allow-listed columns; no table's update list may name share_id or id.
  const updateLists = [...(policyCode ?? '').matchAll(/update: set\(([^)]*)\)/g)].map(m => m[1]);
  ok('A3 an update cannot move a row to another share',
    /const patch = cleanRow\(table, 'update', payload\.body\);/.test(routeCode)
      && updateLists.length >= 3 && updateLists.every(l => !/'share_id'|'id'/.test(l)),
    'the WHERE confines which rows change; this stops the change itself relocating one');

  // ── 4. LEAST PRIVILEGE, NOT `for all` ────────────────────────────────────────────
  ok('A4 only known tables are reachable',
    /export const PORTAL_POLICY: Record<string, TablePolicy>/.test(policyCode ?? '') &&
    /Object\.prototype\.hasOwnProperty\.call\(PORTAL_POLICY, table\)/.test(routeCode) &&
    /if \(!policy \|\| !policy\.ops\.has\(op\)\) return notFound\(\)/.test(routeCode),
    'an unlisted table or an operation a table does not need must be refused');
  // The read-only tables really are read-only.
  ok('A4 home_reports and floor_plans are select-only',
    /home_reports: \{ ops: set<Op>\('select'\) \}/.test(policyCode ?? '') &&
    /floor_plans:  \{ ops: set<Op>\('select'\) \}/.test(policyCode ?? ''),
    'the portal never writes these; granting more would be privilege it does not use');
}

// ── 5. THE CLIENT CARRIES THE TOKEN, NOT A SHARE_ID ────────────────────────────────
ok('A5 the portal token is set from the URL slug on load',
  !!page && /setPortalToken\(routeId\)/.test(page),
  'the slug IS the credential; the child tables must be reached with it, not with an id');
ok('A5 the client helpers route through /api/portal',
  !!page && /fetch\('\/api\/portal'/.test(page),
  'the four supa* helpers are the only path the portal has to its data');

// ── 6. AND THE SERVER SIDE IS ACTUALLY LOCKED ──────────────────────────────────────
ok('A6 a lockdown migration revokes anon on the seven tables',
  !!sql && /revoke all on %I from anon/.test(sql) &&
  ['home_reminders','home_projects','home_repairs','home_documents',
   'home_maintenance_log','home_reports','floor_plans'].every(t => sql.includes(`'${t}'`)),
  'the code change is only half of it — while any anon policy names these tables the door is open');
ok('A6 and the migration says to deploy the code first',
  !!sql && /deploy the (vercel )?build .* first/i.test(sql),
  'revoking anon before the new path is live would break the portal instead of securing it');

console.log('\nportal auth\n');
console.log(`  ${checks} checks\n`);
if (failures.length) { for (const f of failures) console.log(`  FAIL  ${f}`); console.log(`\nFAILED — ${failures.length} of ${checks}\n`); process.exit(1); }
console.log('OK — the portal reaches its data only through a valid token\n');
