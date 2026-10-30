#!/usr/bin/env node
// verify-team — the desktop Team page's invite / revoke / role change (2026-10-21, owner-approved mockup).
//
//   node scripts/verify-team.mjs
//
//   §1 the decision model, EXECUTED: who may manage the team, which roles they may offer, whose role they may change.
//   §2 the same role list and owner rule as the phone (ledrix-app src/state/roleStore.ts), when that repo is beside this one.
//   §3 the write module, EXECUTED against a mock server: exactly the three operations, each confirmed by the server's
//      answer — an invitation that already names a member is refused, a silent RLS refusal is reported, a role change
//      is shown only when the read-back agrees.
//   §4 static: lib/team writes only company_invitations (insert/delete) and set_company_member_role; the page writes
//      nothing directly, gates every control on the role, and offers no member removal.
//   §5 mutations: each rule, broken on purpose, turns this red.
// The server's own rules (RLS, guard_invitation, set_company_member_role) are proven in ledrix-app's PGlite harnesses
// (verify:role-parity); this guard covers the browser side only.
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const SRC = { model: read('lib/team/model.ts'), api: read('lib/team/api.ts'), perm: read('lib/team/permissions.ts'), page: read('app/app/team/page.tsx') };

let run = 0;
async function load(src) {
  const dir = mkdtempSync(join(tmpdir(), 'team-'));
  writeFileSync(join(dir, 'model.mjs'), stripTypeScriptTypes(src.model));
  writeFileSync(join(dir, 'api.mjs'), stripTypeScriptTypes(src.api
    .replace("import { workspace } from '@/lib/workspace/client';", 'const workspace = new Proxy({}, { get: (_t, k) => globalThis.__WS[k] });')
    .replace("from './model';", "from './model.mjs';")));
  writeFileSync(join(dir, 'perm.mjs'), stripTypeScriptTypes(src.perm
    .replace("import { workspace } from '@/lib/workspace/client';", 'const workspace = new Proxy({}, { get: (_t, k) => globalThis.__WS[k] });')));
  run++;
  return {
    M: await import(pathToFileURL(join(dir, 'model.mjs')).href + `?r=${run}`),
    A: await import(pathToFileURL(join(dir, 'api.mjs')).href + `?r=${run}`),
    P: await import(pathToFileURL(join(dir, 'perm.mjs')).href + `?r=${run}`),
  };
}

// ── the mock server: records every call; answers from `world` ─────────────────────────────────────────────
function mockServer(world) {
  const calls = [];
  const q = (table) => {
    const st = { table, op: 'select', filters: [], payload: null, returning: false };
    const p = {
      select() { if (st.op !== 'select') st.returning = true; return p; },
      insert(v) { st.op = 'insert'; st.payload = v; return p; },
      delete() { st.op = 'delete'; return p; },
      update(v) { st.op = 'update'; st.payload = v; return p; },
      upsert(v) { st.op = 'upsert'; st.payload = v; return p; },
      eq(k, v) { st.filters.push(['eq', k, v]); return p; },
      ilike(k, v) { st.filters.push(['ilike', k, v]); return p; },
      is(k, v) { st.filters.push(['is', k, v]); return p; },
      order() { return p; }, limit() { return p; },
      maybeSingle() { st.single = true; return p; },
      then(res, rej) { calls.push(st); return Promise.resolve(world.answer(st)).then(res, rej); },
    };
    return p;
  };
  return {
    calls,
    client: {
      from: q,
      rpc: (fn, args) => ({ then(res, rej) { const st = { op: 'rpc', fn, args }; calls.push(st); return Promise.resolve(world.answer(st)).then(res, rej); } }),
    },
  };
}

async function suite(src) {
  const out = [];
  const ok = (name, cond, detail = '') => out.push({ name, pass: !!cond, detail });
  let L;
  try { L = await load(src); } catch (e) { ok('modules load', false, String(e)); return out; }
  const { M, A, P } = L;

  // §1
  ok('§1 owner, admin, manager and ledrix_admin manage the team; office and inspector do not',
    ['owner', 'admin', 'manager', 'ledrix_admin'].every(M.canManageTeam) && !['office', 'inspector', null, ''].some(M.canManageTeam));
  ok('§1 an owner may offer every role including owner', JSON.stringify(M.assignableRoles('owner')) === JSON.stringify(['inspector', 'office', 'manager', 'admin', 'owner']));
  ok('§1 an admin or manager may never offer owner', !M.assignableRoles('admin').includes('owner') && !M.assignableRoles('manager').includes('owner'));
  const me = { userId: 'u_me', role: 'manager' };
  ok('§1 no one changes their own role', !!M.roleLockReason({ userId: 'u1', role: 'owner' }, { id: 'u1', role: 'owner' }));
  ok('§1 a manager cannot change an owner’s role; an owner can', !!M.roleLockReason(me, { id: 'u_o', role: 'owner' }) && M.roleLockReason({ userId: 'u_me', role: 'owner' }, { id: 'u_o', role: 'owner' }) === null);
  ok('§1 a manager may change an inspector’s role; an inspector or office may change no one’s',
    M.roleLockReason(me, { id: 'u_i', role: 'inspector' }) === null && !!M.roleLockReason({ userId: 'x', role: 'inspector' }, { id: 'u_i', role: 'inspector' })
    && !!M.roleLockReason({ userId: 'x', role: 'office' }, { id: 'u_i', role: 'inspector' }));
  ok('§1 an invitation address is trimmed and lower-cased; a non-address is refused',
    M.cleanInviteEmail('  KellyGenung@Yahoo.com ') === 'kellygenung@yahoo.com' && M.cleanInviteEmail('nope') === null && M.cleanInviteEmail('a@b') === null);
  const now = Date.parse('2026-10-21T12:00:00Z');
  ok('§1 expiry reads as a date and the days left; past is "Expired"',
    /^Oct 28 · 7 days$/.test(M.expiresLabel('2026-10-28T12:00:00Z', now)) && M.expiresLabel('2026-10-20T00:00:00Z', now) === 'Expired' && M.expiresLabel(null, now) === '—');
  ok('§1 every role has a one-line summary', ['inspector', 'office', 'manager', 'admin', 'owner'].every(r => (M.ROLE_SUMMARY[r] ?? '').length > 10));

  // §3
  globalThis.__WS = null;
  const ask = async (world, fn) => { const s = mockServer(world); globalThis.__WS = s.client; let err = null; try { await fn(); } catch (e) { err = e; } return { calls: s.calls, err }; };
  const writes = (calls) => calls.filter(c => c.op !== 'select');

  let r = await ask({ answer: st => st.table === 'company_members' ? { data: [], error: null } : { data: [{ id: 'inv1' }], error: null } },
    () => A.createInvitation('co1', 'kellygenung@yahoo.com', 'inspector'));
  const ins = r.calls.find(c => c.op === 'insert');
  ok('§3 an invitation is ONE insert into company_invitations: company, address, role, a token, expiry in 7 days',
    !r.err && writes(r.calls).length === 1 && ins?.table === 'company_invitations' && ins.payload.company_id === 'co1' && ins.payload.email === 'kellygenung@yahoo.com'
    && ins.payload.role === 'inspector' && /^[0-9a-f]{48}$/.test(ins.payload.token)
    && Math.abs(Date.parse(ins.payload.expires_at) - Date.now() - 7 * 86_400_000) < 60_000, JSON.stringify(ins?.payload));
  r = await ask({ answer: st => st.table === 'company_members' ? { data: [{ id: 'm1' }], error: null } : { data: [{ id: 'x' }], error: null } },
    () => A.createInvitation('co1', 'kgenung7@gmail.com', 'inspector'));
  ok('§3 an address that already belongs to a member is refused BEFORE any write', !!r.err && writes(r.calls).length === 0 && /already belongs/.test(r.err.message));
  r = await ask({ answer: st => st.table === 'company_members' ? { data: [], error: null } : { data: null, error: { message: 'Only a company owner can invite another owner', code: '42501' } } },
    () => A.createInvitation('co1', 'x@y.com', 'owner'));
  ok('§3 a server refusal surfaces with the server’s own words', !!r.err && /Only a company owner can invite another owner/.test(r.err.message));
  r = await ask({ answer: st => st.table === 'company_members' ? { data: [], error: null } : { data: [], error: null } },
    () => A.createInvitation('co1', 'x@y.com', 'inspector'));
  ok('§3 an insert the server did not confirm (no row back) is reported, not shown as saved', !!r.err);

  r = await ask({ answer: () => ({ data: [], error: null }) }, () => A.revokeInvitation('co1', 'inv1'));
  ok('§3 a revoke the server silently refused (0 rows) is reported', !!r.err && writes(r.calls).length === 1);
  r = await ask({ answer: () => ({ data: [{ id: 'inv1' }], error: null }) }, () => A.revokeInvitation('co1', 'inv1'));
  const del = r.calls.find(c => c.op === 'delete');
  ok('§3 a revoke is ONE delete of that invitation, scoped to the company, confirmed by the row returned',
    !r.err && del?.table === 'company_invitations' && del.filters.some(f => f[1] === 'id' && f[2] === 'inv1') && del.filters.some(f => f[1] === 'company_id' && f[2] === 'co1') && del.returning);

  r = await ask({ answer: st => st.op === 'rpc' ? { data: null, error: null } : { data: { role: 'manager' }, error: null } }, () => A.setMemberRole('m1', 'manager'));
  const rpc = r.calls.find(c => c.op === 'rpc');
  ok('§3 a role change goes through set_company_member_role and is confirmed by reading the role back',
    !r.err && rpc?.fn === 'set_company_member_role' && rpc.args.p_member === 'm1' && rpc.args.p_role === 'manager'
    && r.calls.some(c => c.table === 'company_members' && c.op === 'select'));
  r = await ask({ answer: st => st.op === 'rpc' ? { data: null, error: null } : { data: { role: 'inspector' }, error: null } }, () => A.setMemberRole('m1', 'manager'));
  ok('§3 a read-back that disagrees is reported — never shown as changed', !!r.err);
  r = await ask({ answer: st => st.op === 'rpc' ? { data: null, error: { message: 'You cannot change your own role' } } : { data: { role: 'manager' }, error: null } }, () => A.setMemberRole('me', 'manager'));
  ok('§3 a refused role change surfaces the server’s reason', !!r.err && /own role/.test(r.err.message));

  // §4
  const api = strip(src.api);
  const writeCalls = [...api.matchAll(/\.(insert|update|upsert|delete|rpc)\s*\(/g)].map(m => m[1]);
  ok('§4 lib/team writes exactly: one insert, one delete, one rpc — no update, no upsert',
    JSON.stringify(writeCalls.sort()) === JSON.stringify(['delete', 'insert', 'rpc']), JSON.stringify(writeCalls));
  ok('§4 …the insert and delete are on company_invitations, the rpc is set_company_member_role',
    /from\('company_invitations'\)\.insert\(/.test(api) && /from\('company_invitations'\)\.delete\(/.test(api) && /\.rpc\('set_company_member_role'/.test(api));
  ok('§4 lib/team uses the signed-in workspace client and no service key', /from '@\/lib\/workspace\/client'/.test(src.api) && !/SERVICE_ROLE|service_role/i.test(api));
  const page = strip(src.page);
  ok('§4 the page writes nothing directly (only through lib/team)', !/\.(insert|update|upsert|delete|rpc)\s*\(/.test(page));
  ok('§4 the invite form, the pending list and the role picker are each gated on the role',
    /\{manages && \(\s*<Card title="Invite someone">/.test(page) && /manages && state\.invites\.length > 0/.test(page) && /manages && !lock \?/.test(page));
  ok('§4 the invite note says no email is sent', /Ledrix doesn’t send an email/.test(page));
  ok('§4 a role change asks first (a dialog), then calls the server', /setPending\(\{ member: m, role: e\.target\.value \}\)/.test(page) && /role="dialog"/.test(page) && /await setMemberRole\(pending\.member\.id, pending\.role\)/.test(page));
  ok('§4 no member removal is offered (the server has no such operation)', !/remove member|removeMember|Remove from team/i.test(page));

  // §6 per-person permissions (#76, 2026-10-29)
  const LIST = { role: 'office', can_change: true, permissions: [{ capability: 'crm', preset: true, allowed: false, changed: true }] };
  let r6 = await ask({ answer: () => ({ data: LIST, error: null }) }, () => P.setMemberPermission('m1', 'crm', false));
  const set = r6.calls.find(c => c.op === 'rpc');
  ok('§6 a permission change is one call to set_member_permission with the member, the permission and the value',
    !r6.err && r6.calls.length === 1 && set?.fn === 'set_member_permission' && set.args.p_member === 'm1' && set.args.p_cap === 'crm' && set.args.p_allowed === false);
  let shown = null;
  await ask({ answer: () => ({ data: LIST, error: null }) }, async () => { shown = await P.setMemberPermission('m1', 'crm', false); });
  ok('§6 …and returns the list as the server has it', shown?.permissions?.[0]?.changed === true);
  r6 = await ask({ answer: () => ({ data: null, error: { message: 'Only the company owner can change a member\'s permissions' } }) }, () => P.setMemberPermission('m1', 'crm', true));
  ok('§6 a refusal reads in plain words', !!r6.err && /Only the company owner can change permissions/.test(r6.err.message));
  r6 = await ask({ answer: () => ({ data: null, error: null }) }, () => P.resetMemberPermissions('m1'));
  ok('§6 a reset the server did not confirm is reported', !!r6.err);
  let caps = 'unset';
  await ask({ answer: () => ({ data: null, error: { message: 'boom' } }) }, async () => { caps = await P.loadMyCapabilities(); });
  ok('§6 when the server cannot say, my permissions are null (the page falls back to the role)', caps === null);
  ok('§6 the Access column: owner Everything, changes counted, otherwise the role’s defaults',
    P.accessLabel('owner', null) === 'Everything' && P.accessLabel('office', LIST) === 'Custom · 1 change'
    && P.accessLabel('manager', { role: 'manager', can_change: true, permissions: [] }) === 'Manager defaults');
  const perm = strip(src.perm);
  const permCalls = [...perm.matchAll(/\.rpc\('([a-z_]+)'/g)].map(m => m[1]).sort();
  ok('§6 lib/team/permissions calls exactly the four permission functions and touches no table',
    JSON.stringify(permCalls) === JSON.stringify(['member_permissions', 'my_capabilities', 'reset_member_permissions', 'set_member_permission'])
    && !/\.from\(|\.(insert|update|upsert|delete)\s*\(/.test(perm), JSON.stringify(permCalls));
  ok('§6 who manages the team comes from the server’s team permission, the role only as fallback',
    /const manages = typeof caps\?\.team === 'boolean' \? caps\.team : canManageTeam\(access\.role\);/.test(page));
  ok('§6 a switch can be changed only when the server says this viewer may (the owner)', /disabled=\{!perms\.can_change \|\| busy\}/.test(page));
  ok('§6 the Permissions button is never offered on yourself or an owner',
    /const grantable = manages && m\.id !== access\.userId && m\.role !== 'owner' && m\.role !== 'ledrix_admin';/.test(page));
  return out;
}

let pass = 0, fail = 0;
const report = (rs, quiet = false) => { for (const r of rs) { if (r.pass) pass++; else fail++; if (!quiet) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${!r.pass && r.detail ? `\n      ${r.detail}` : ''}`); } };
console.log('verify-team — desktop invite / revoke / role change');
report(await suite(SRC));

// §2 the phone's rule
const appRole = join(ROOT, '..', 'ledrix-app', 'src', 'state', 'roleStore.ts');
if (existsSync(appRole)) {
  const s = readFileSync(appRole, 'utf8');
  const phone = s.match(/export const TEAM_ROLES = (\[[^\]]*\]) as const;/)?.[1];
  const web = SRC.model.match(/export const TEAM_ROLES = (\[[^\]]*\]) as const;/)?.[1];
  report([{ name: '§2 the same TEAM_ROLES as the phone', pass: !!phone && phone === web, detail: `${phone} vs ${web}` },
          { name: '§2 the phone also offers owner only to an owner or ledrix_admin', pass: /actor === 'owner' \|\| actor === 'ledrix_admin' \? \[\.\.\.TEAM_ROLES, 'owner'\]/.test(s) }]);
} else console.log('  · §2 skipped: ledrix-app is not beside this repo');

// §5 mutations
console.log('\n§5 mutations');
const MUTANTS = [
  { f: 'model', from: "return OWNERS.includes(String(actorRole ?? '')) ? [...TEAM_ROLES, 'owner'] : [...TEAM_ROLES];", to: "return [...TEAM_ROLES, 'owner'];", why: 'a manager may offer owner', expect: /^§1/ },
  { f: 'model', from: "if (member.id === actor.userId) return 'You can’t change your own role';", to: '', why: 'your own role is editable', expect: /^§1/ },
  { f: 'model', from: "const MANAGES_TEAM = ['ledrix_admin', 'owner', 'admin', 'manager'];", to: "const MANAGES_TEAM = ['ledrix_admin', 'owner', 'admin', 'manager', 'office'];", why: 'office manages the team', expect: /^§1/ },
  { f: 'api', from: "  if ((member.data ?? []).length) throw new TeamError('That email already belongs to a team member');\n", to: '', why: 'an existing member is invited again', expect: /^§3/ },
  { f: 'api', from: "  if (!(res.data ?? []).length) throw new TeamError('The invitation was not revoked — it may already be gone, or you may not be allowed');\n", to: '', why: 'a silent revoke refusal looks like success', expect: /^§3/ },
  { f: 'api', from: "  if (back.error || (back.data as { role?: string } | null)?.role !== role) {", to: "  if (back.error) {", why: 'a role change is shown without the read-back agreeing', expect: /^§3/ },
  { f: 'page', from: "{manages && (\n          <Card title=\"Invite someone\">", to: "{(\n          <Card title=\"Invite someone\">", why: 'the invite form shows for every role', expect: /^§4/ },
  { f: 'page', from: "disabled={!perms.can_change || busy}", to: "disabled={busy}", why: 'a manager gets live permission switches', expect: /^§6/ },
  { f: 'perm', from: "  if (res.error || !res.data) throw new PermissionError('Permissions were not reset', res.error);", to: "  if (res.error) throw new PermissionError('Permissions were not reset', res.error);", why: 'an unconfirmed reset looks done', expect: /^§6/ },
  { f: 'page', from: "const manages = typeof caps?.team === 'boolean' ? caps.team : canManageTeam(access.role);", to: "const manages = canManageTeam(access.role);", why: 'the page ignores the owner’s team permission', expect: /^§6/ },
];
for (const m of MUTANTS) {
  if (SRC[m.f].split(m.from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${m.why}`); continue; }
  const rs = await suite({ ...SRC, [m.f]: SRC[m.f].replace(m.from, m.to) });
  const caught = rs.some(r => !r.pass && m.expect.test(r.name));
  if (caught) { pass++; console.log(`  ✓ caught: ${m.why}`); } else { fail++; console.log(`  ✗ NOT caught: ${m.why}`); }
}

console.log(`\n${fail ? '✗' : '✓'} verify-team: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
