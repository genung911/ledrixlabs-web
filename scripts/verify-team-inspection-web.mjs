#!/usr/bin/env node
// verify-team-inspection-web — the website's team line on an inspection (ledrix-app increment 5c; DECISIONS
// "2026-10-30 (second)", SQL #81).
//
//   node scripts/verify-team-inspection-web.mjs
//
//   §1 lib/workspace/team.ts is READ ONLY: one function (job_team), one table read (inspection_lease_events), no write,
//      the signed-in workspace client, no service key; a server without #81 answers "no team" (executed)
//   §2 the inspection page never fails because of the team (both loads are caught) and shows nothing for a team of
//      one; it changes nothing (no team call from the page)
//   §3 the words (executed): one chip per person (sections, the lead holds the rest, editing), NOT SENT (#87), history
//   §4 mutations
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const SRC = { team: read('lib/workspace/team.ts'), page: read('app/app/inspections/[id]/page.tsx') };
let run = 0;

async function load(teamSrc, fake) {
  const dir = mkdtempSync(join(tmpdir(), 'team-web-'));
  globalThis.__FAKE = fake;
  const js = stripTypeScriptTypes(teamSrc).replace(/import \{ workspace \} from '\.\/client';/, 'const workspace = globalThis.__FAKE;');
  const f = join(dir, 'team.mjs');
  writeFileSync(f, js);
  return import(pathToFileURL(f).href + `?r=${++run}`);
}
const missingClient = {
  rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.job_team' } }),
  from: () => { const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }) }; return q; },
};

async function suite(src) {
  const out = [];
  const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
  const team = strip(src.team), page = strip(src.page);

  ok('§1 one server function, one table read, nothing written',
    JSON.stringify([...team.matchAll(/workspace\.rpc\('([a-z_]+)'/g)].map(m => m[1])) === '["job_team"]'
    && JSON.stringify([...team.matchAll(/workspace\.from\('([a-z_]+)'/g)].map(m => m[1])) === '["inspection_lease_events"]'
    && !/\.(insert|update|upsert|delete)\s*\(/.test(team));
  ok('§1 the signed-in workspace client, never a service key', /from '\.\/client'/.test(src.team) && !/SERVICE_ROLE|service_role/i.test(team));
  let M;
  try { M = await load(src.team, missingClient); } catch (e) { ok('§1 loads', false, String(e)); return out; }
  let t = 'threw', ev = 'threw';
  try { t = await M.loadJobTeam('insp'); } catch {}
  try { ev = await M.loadLeaseEvents('insp'); } catch {}
  ok('§1 a server without #81 answers "no team" and no history (executed)', t === null && Array.isArray(ev) && ev.length === 0, JSON.stringify({ t, ev }));

  ok('§2 the page never fails because of the team', /loadJobTeam\(id\)\.catch\(\(\) => null\)/.test(page) && /loadLeaseEvents\(id\)\.catch\(/.test(page));
  ok('§2 a team of one shows nothing', /team && team\.people\.length > 1 \?/.test(page));
  ok('§2 the page changes nothing about the team', !/\.rpc\s*\(|(add_team_member|assign_section|hand_off_lead|take_over_lead|take_over_edit|remove_team_member)/.test(page));

  const TEAM = { lead: 'k', me: 'k', lease_period_seconds: 300, sections: { roofing: 's', exterior: 's', plumbing: 'j' },
    people: [{ user_id: 'k', name: 'Kelly Genung', is_lead: true, device_name: 'Kelly’s iPhone', live: true, heartbeat_at: null },
             { user_id: 's', name: 'Sam Rivera', is_lead: false, device_name: null, live: false, heartbeat_at: null },
             { user_id: 'j', name: 'Jordan Mills', is_lead: false, device_name: 'Jordan’s iPhone', live: true, heartbeat_at: null }] };
  TEAM.people[1].unsent = 3;
  const strip_ = M.teamStrip(TEAM, { roofing: 'Roof' });
  const chip = (u) => strip_.chips.find(c => c.user_id === u);
  ok('§3 one chip per person: who has which sections, the lead holds the rest', strip_.live === 2 && strip_.chips.length === 3
    && chip('k').is_lead && chip('k').detail === 'the rest · editing' && chip('k').initials === 'KG'
    && chip('s').detail === 'Roof, Exterior' && chip('j').detail === 'Plumbing · editing', JSON.stringify(strip_));
  ok('§3 a phone holding work is named NOT SENT; a server before #87 warns nobody',
    JSON.stringify(strip_.unsent) === '[{"user_id":"s","first":"Sam","count":3}]'
    && M.teamStrip({ ...TEAM, people: TEAM.people.map(({ unsent, ...p }) => p) }, {}).unsent.length === 0, JSON.stringify(strip_.unsent));
  ok('§3 the page shows the chips and the NOT SENT warning', /teamInfo\.chips\.map/.test(page) && /NOT SENT/.test(page) && /teamInfo\.unsent\.length > 0 && \(/.test(page));
  const names = { k: 'Kelly Genung', s: 'Sam Rivera' };
  ok('§3 history lines say who did what, in words', M.eventLine({ action: 'section_assigned', actor: 'k', subject_user: 's', detail: 'roofing' }, names, { roofing: 'Roof' }) === 'Kelly assigned Roof to Sam'
    && M.eventLine({ action: 'take_over', actor: 'k', subject_user: 'k', device_name: 'Kelly’s iPad' }, names, {}) === 'Kelly took over editing on Kelly’s iPad'
    && M.eventLine({ action: 'lead_handoff', actor: 'k', subject_user: 's' }, names, {}) === 'Kelly handed lead to Sam');
  return out;
}

let pass = 0, fail = 0;
const report = (rs) => { for (const r of rs) { if (r.pass) { pass++; console.log(`  ✓ ${r.name}`); } else { fail++; console.log(`  ✗ ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`); } } };
console.log('verify-team-inspection-web');
report(await suite(SRC));
console.log('\n§4 mutations');
const MUTANTS = [
  { f: 'team', why: 'a missing server breaks the page', from: "  if (error) { if (missing(error)) return null; throw", to: "  if (error) { throw", expect: /^§1 a server without/ },
  { f: 'page', why: 'the team load can fail the page', from: "loadJobTeam(id).catch(() => null)", to: "loadJobTeam(id)", expect: /^§2 the page never fails/ },
  { f: 'page', why: 'a team of one shows the banner', from: "team && team.people.length > 1 ?", to: "team ?", expect: /^§2 a team of one/ },
  { f: 'team', why: 'sections credited to the wrong person', from: "bySection.set(u, [...(bySection.get(u) ?? []), labels[k] ?? titled(k)]);", to: "bySection.set(team.lead, [...(bySection.get(team.lead) ?? []), labels[k] ?? titled(k)]);", expect: /^§3 one chip per person/ },
  { f: 'team', why: 'the lead stops holding the unassigned sections', from: "(mine.length ? [...mine, 'the rest'] : ['the rest'])", to: "mine", expect: /^§3 one chip per person/ },
  { f: 'team', why: 'NOT SENT names everyone', from: ".filter(p => (p.unsent ?? 0) > 0)", to: "", expect: /^§3 a phone holding work/ },
  { f: 'page', why: 'the page drops the NOT SENT warning', from: "{teamInfo.unsent.length > 0 && (", to: "{false && (", expect: /^§3 the page shows/ },
];
for (const m of MUTANTS) {
  if (SRC[m.f].split(m.from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${m.why}`); continue; }
  const res = await suite({ ...SRC, [m.f]: SRC[m.f].replace(m.from, m.to) });
  if (res.some(x => !x.pass && m.expect.test(x.name))) { pass++; console.log(`  ✓ caught: ${m.why}`); } else { fail++; console.log(`  ✗ NOT caught: ${m.why}`); }
}
console.log(`\nverify-team-inspection-web — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
