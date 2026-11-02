#!/usr/bin/env node
// verify-finding-edit-web — editing a finding on the website (2026-11-02, owner: "Build it as shown"; ledrix-app SQL #91).
//
//   node scripts/verify-finding-edit-web.mjs
//
//   §1 the RULES, executed (lib/findings/rules.ts): who may edit, the confirm gate, the patches
//   §2 the SAVE (lib/findings/edit.ts, executed against a fake server): the lock is taken first; a row that moved
//      is not written; the base version, device and epoch ride every write; fields the server kept are reported
//   §3 the PAGE: one lock per page, released on leaving; the editor only for 'edit'; HITL wording updated
//   §4 mutations
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const SRC = { rules: read('lib/findings/rules.ts'), edit: read('lib/findings/edit.ts'),
  ui: read('components/workspace/FindingEditor.tsx'), page: read('app/app/inspections/[id]/page.tsx') };
let run = 0;
const mod = async (src, fake) => {
  const dir = mkdtempSync(join(tmpdir(), 'fe-web-'));
  globalThis.__FAKE = fake;
  const js = stripTypeScriptTypes(src).replace(/import \{ workspace \} from '@\/lib\/workspace\/client';/, 'const workspace = globalThis.__FAKE;');
  const f = join(dir, 'm.mjs'); writeFileSync(f, js);
  return import(pathToFileURL(f).href + `?r=${++run}`);
};

// A fake server: one row, a lock, and every update recorded.
function fakeServer({ rowVersion = 4, current = 4, keep = {} } = {}) {
  const log = { rpc: [], updates: [] };
  const row = { id: 'f1', row_version: current, description: 'old', severity: 'deficiency', status: 'proposed' };
  const q = (table) => {
    const s = { op: 'select', patch: null };
    const api = {
      select: () => api, eq: () => api,
      update: (p) => { s.op = 'update'; s.patch = p; return api; },
      maybeSingle: async () => {
        if (s.op === 'select') return { data: { ...row }, error: null };
        log.updates.push(s.patch);
        const out = { ...row, ...s.patch, ...keep, row_version: row.row_version + 1 };
        return { data: out, error: null };
      },
    };
    return api;
  };
  return { log, rowVersion, client: { from: q, rpc: async (name, args) => { log.rpc.push([name, args]); return { data: { epoch: 7 }, error: null }; } } };
}

async function suite(src) {
  const out = [];
  const ok = (name, c, d = '') => out.push({ name, pass: !!c, detail: d });
  let R;
  try { R = await mod(src.rules, null); } catch (e) { ok('§1 the rules load', false, String(e)); return out; }
  const team = { lead: 'lead', me: 'lead', people: [{ user_id: 'lead' }, { user_id: 'mike' }] };
  const base = { status: 'proposed', severity: 'deficiency', description: 'Pipe ends high', inspector_notes: '', room: 'Basement', location: 'Basement',
    level: '1', unit: 'PLUMBING', is_safety: false, inspector_id: 'mike', staged_limitation: false, source: 'voice_dictation', ai_severity: null };
  ok('§1 the lead edits every finding on their job', R.editAccess(base, team) === 'edit');
  ok('§1 a teammate edits their own finding, not someone else’s', R.editAccess(base, { ...team, me: 'mike' }) === 'edit'
    && R.editAccess({ ...base, inspector_id: 'lead' }, { ...team, me: 'mike' }) === 'not_yours');
  ok('§1 someone not on the job edits nothing', R.editAccess(base, { ...team, me: 'office' }) === 'not_on_job' && R.editAccess(base, null) === 'not_on_job');
  ok('§1 a staged limitation is confirmed on the phone', R.editAccess({ ...base, staged_limitation: true }, team) === 'limitation');

  const photo = { ...base, source: 'document_photo', ai_severity: null };
  const d0 = R.draftOf(photo);
  ok('§1 a photo draft with no suggestion has no priority until someone picks one', d0.severity === '' && R.missingForConfirm(photo, d0).includes('Priority'));
  const sug = { ...photo, ai_severity: 'maintenance', severity: 'maintenance' };
  ok('§1 Ledrix’s suggestion counts, and confirming records it', R.draftOf(sug).severity === 'maintenance' && R.confirmPatch(sug, R.draftOf(sug)).severity === 'maintenance');
  ok('§1 confirm needs description, system and location too', JSON.stringify(R.missingForConfirm({ ...base, unit: '' }, { ...R.draftOf(base), description: ' ', room: '' })) === '["Description","System","Location"]');
  const cp = R.confirmPatch({ ...base, description: 'Possible duplicate — review: Pipe ends high' }, R.draftOf({ ...base, description: 'Possible duplicate — review: Pipe ends high' }));
  ok('§1 confirming is one write: the edits, the status, and the duplicate marker off', cp.status === 'confirmed' && cp.description === 'Pipe ends high');
  const ch = R.changesOf(base, { ...R.draftOf(base), room: 'Utility room', is_safety: true });
  ok('§1 only what changed is sent; room and location move together', JSON.stringify(ch) === '{"is_safety":true,"room":"Utility room","location":"Utility room"}', JSON.stringify(ch));
  ok('§1 restore goes back to the queue as proposed, never confirmed', R.restorePatch('t').status === 'proposed' && R.restorePatch('t').rejected_at === null);
  ok('§1 GOOD is not a finding priority', !R.PICKABLE_PRIORITIES.includes('spec') && R.PICKABLE_PRIORITIES.length === 4);

  // §2
  let E;
  const s1 = fakeServer();
  try { E = await mod(src.edit, s1.client); } catch (e) { ok('§2 the save loads', false, String(e)); return out; }
  globalThis.window = { localStorage: { getItem: () => 'web_test', setItem: () => {} } };
  const saved = await E.saveFinding({ id: 'f1', row_version: 4 }, { description: 'new' }, { epoch: 7 }, R.notTaken);
  const u = s1.log.updates[0] ?? {};
  ok('§2 a save names its base version, this browser and its lock epoch', saved.kind === 'saved' && u.sync_base_version === 4 && u.sync_device === 'web_test' && u.lease_epoch === 7, JSON.stringify(u));
  const s2 = fakeServer({ current: 5 });
  const E2 = await mod(src.edit, s2.client);
  const moved = await E2.saveFinding({ id: 'f1', row_version: 4 }, { description: 'new' }, { epoch: 7 }, R.notTaken);
  ok('§2 a finding that changed since the page loaded is not written', moved.kind === 'changed' && s2.log.updates.length === 0);
  const s3 = fakeServer({ keep: { description: 'theirs' } });
  const E3 = await mod(src.edit, s3.client);
  const lost = await E3.saveFinding({ id: 'f1', row_version: 4 }, { description: 'mine', severity: 'critical' }, { epoch: 7 }, R.notTaken);
  ok('§2 a field the server kept (someone got there first) is reported, not shown as saved', lost.kind === 'changed' && JSON.stringify(lost.fields) === '["description"]', JSON.stringify(lost));
  const s4 = fakeServer(); const E4 = await mod(src.edit, s4.client);
  await E4.moveLeaseHere('insp');
  ok('§2 Edit here instead moves your own lock (#91)', s4.log.rpc[0]?.[0] === 'move_edit_here' && s4.log.rpc[0][1].p_device === 'web_test');

  // §3
  const ui = src.ui, page = src.page;
  ok('§3 every save takes the lock first, and a refused lock shows the banner', /const lease = await lock\.ensure\(\);\s*if \(!lease\) return;/.test(ui) && /else if \(r\.kind === 'locked'\) lock\.lost\(\);/.test(ui));
  ok('§3 the lock is checked in while held and let go when the page closes', /checkInLease\(inspectionId, lease\)/.test(ui) && /addEventListener\('pagehide', leave\)/.test(ui) && /leave\(\); \};/.test(ui));
  ok('§3 controls only for someone who may edit, and not while their phone has the job', /const editable = access === 'edit' && !lock\.heldBy;/.test(ui));
  ok('§3 Confirm waits for a complete card', /disabled=\{!!busy \|\| missing\.length > 0\}/.test(ui));
  ok('§3 one lock per page, and a save replaces the row', /const lock = useEditLock\(id, phoneHolderOf\(/.test(page) && /findings: s\.data\.findings\.map\(f => f\.id === row\.id \? row : f\)/.test(page));
  return out;
}

let pass = 0, fail = 0;
const report = (rs) => { for (const r of rs) { if (r.pass) { pass++; console.log(`  ✓ ${r.name}`); } else { fail++; console.log(`  ✗ ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`); } } };
console.log('verify-finding-edit-web');
report(await suite(SRC));
console.log('\n§4 mutations');
const MUTANTS = [
  { f: 'rules', why: 'a teammate may edit anyone’s finding', from: "if (team.me !== team.lead && row.inspector_id !== team.me) return 'not_yours';", to: '', expect: /^§1 a teammate/ },
  { f: 'rules', why: 'limitations confirmed on the website', from: "  if (row.staged_limitation === true) return 'limitation';\n", to: '', expect: /^§1 a staged limitation/ },
  { f: 'rules', why: 'an unpicked priority counts', from: "if (!d.severity) m.push('Priority');", to: '', expect: /^§1 a photo draft/ },
  { f: 'rules', why: 'restore confirms', from: "return { status: 'proposed', rejected_at: null, restored_at: nowIso };", to: "return { status: 'confirmed', rejected_at: null, restored_at: nowIso };", expect: /^§1 restore/ },
  { f: 'edit', why: 'no re-read before the write', from: "if (Number(current.row_version) !== Number(row.row_version)) return { kind: 'changed', row: current, fields: [] };", to: '', expect: /^§2 a finding that changed/ },
  { f: 'edit', why: 'the base version is not sent', from: 'sync_base_version: row.row_version, ', to: '', expect: /^§2 a save names/ },
  { f: 'edit', why: 'a kept field is reported as saved', from: "return missed.length ? { kind: 'changed', row: saved, fields: missed } : { kind: 'saved', row: saved };", to: "return { kind: 'saved', row: saved };", expect: /^§2 a field the server kept/ },
  { f: 'ui', why: 'controls shown while the phone has the job', from: "const editable = access === 'edit' && !lock.heldBy;", to: "const editable = access === 'edit';", expect: /^§3 controls only/ },
  { f: 'ui', why: 'the lock is never let go', from: "window.addEventListener('pagehide', leave);", to: '', expect: /^§3 the lock is checked/ },
];
for (const m of MUTANTS) {
  if (SRC[m.f].split(m.from).length !== 2) { fail++; console.log(`  ✗ mutation anchor present once: ${m.why}`); continue; }
  const res = await suite({ ...SRC, [m.f]: SRC[m.f].replace(m.from, m.to) });
  if (res.some(x => !x.pass && m.expect.test(x.name))) { pass++; console.log(`  ✓ caught: ${m.why}`); } else { fail++; console.log(`  ✗ NOT caught: ${m.why}`); }
}
console.log(`\nverify-finding-edit-web — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
