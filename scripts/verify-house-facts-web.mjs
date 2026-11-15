#!/usr/bin/env node
// verify-house-facts-web — Before you start on the website (owner 2026-11-14, mockup 4NAix7t4exh6Lg9CymodEP → "Approved").
//   §1 the model (lib/houseFacts/model.ts, EXECUTED): the app's facts in its order and groups; the utilities and garage from
//      the job's own columns, the types from their items' spec values; Backup heat only while What heats names a heat pump
//      or a mini-split; the several-answers rule with its absence alone; a type's None alone
//   §2 recorded work stays: a change that takes an item holding work off the checklist is refused and named (a type, and a
//      house fact read as the phone reads `house::…`); a change that takes nothing off goes
//   §3 the save path: the job's columns under the edit lock with the version the page saw (sync_base_version, the device,
//      the lock's epoch), re-read first; a type through put_inspection_values
//   §4 the page: Before you start first in the menu with what is left; view only for someone not on the job
//   §M (--mutate) each rule, removed, fails a check
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jitiFactory from 'jiti';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = join(ROOT, 'lib/houseFacts/model.ts'), API = join(ROOT, 'lib/houseFacts/api.ts');
const PANEL = join(ROOT, 'components/workspace/HouseFactsPanel.tsx'), PAGE = join(ROOT, 'app/app/inspections/[id]/page.tsx');
const read = (f) => readFileSync(f, 'utf8');

const T = (id, label, attrs, children) => ({ id, label, ...(attrs ? { attributes: attrs } : {}), ...(children ? { children } : {}) });
const SYSTEMS = [
  T('heating', 'Heating', null, [
    T('hvac_heating', 'Heating System', [{ id: 'fuel_source', label: 'Type', values: ['Gas Furnace', 'Electric Furnace', 'Heat Pump', 'Ductless Mini-Split'] }]),
    T('hvac_backup_heat', 'Backup Heat', [{ id: 'spec', label: 'Backup', values: ['Electric Strips', 'Gas Furnace (Dual Fuel)', 'None', 'Not Determined'] }]),
    T('hvac_elec_furnace_elements', 'Heating Elements / Sequencers'),
  ]),
  T('cooling', 'Cooling', null, [T('hvac_cooling', 'AC System', [{ id: 'spec', label: 'Type', values: ['Split System', 'Heat Pump AC'] }])]),
  T('interior', 'Interior', null, [T('gar_door', 'Garage Door')]),
];
const ROW = { id: 'i1', row_version: 7, gas_supply: 'Natural gas', water_source: null, sewer_type: 'Public sewer, Septic', garage_type: 'Attached' };

function suite() {
  const out = []; const ok = (n, c) => out.push({ n, c: !!c });
  let M;
  try { M = jitiFactory(import.meta.url, { alias: { '@': ROOT }, interopDefault: true, cache: false, requireCache: false })(MODEL); }
  catch (e) { ok(`§1 the model loads (${e.message})`, false); return out; }
  const vm = (pairs, cond = {}) => new Map([
    ...Object.entries(pairs).map(([k, v], i) => [`spec|${k}`, { structure_id: 'main', node_key: k, kind: 'spec', section_key: null, value: { value: v }, seq: i + 1 }]),
    ...Object.entries(cond).map(([k, v], i) => [`condition|${k}`, { structure_id: 'main', node_key: k, kind: 'condition', section_key: null, value: { values: v }, seq: 100 + i }]),
  ]);
  const ids = (vals, row = ROW) => M.factsView(SYSTEMS, vals, row).map(v => v.fact.id).join(',');
  ok('§1 the facts this job asks, in the app\'s order — the types only where their item is in the checklist',
    // RE-ANCHORED 2026-11-14 (app 6f9f84020, #127): Front faces is the first fact
    // RE-ANCHORED 2026-11-15 (app b24196efb, #128): Stories, a job column like the utilities, is always asked
    ids(vm({ 'hvac_heating::fuel_source': 'Gas Furnace' })) === 'front,gas,water,sewer,heats,cools,stories,garage');
  ok('§1 Backup heat follows What heats only for a heat pump or a mini-split',
    ids(vm({ 'hvac_heating::fuel_source': 'Heat Pump' })) === 'front,gas,water,sewer,heats,backup_heat,cools,stories,garage'
    && ids(vm({ 'hvac_heating::fuel_source': 'Gas Furnace, Ductless Mini-Split' })).includes('backup_heat'));
  const v = M.factsView(SYSTEMS, vm({ 'hvac_heating::fuel_source': 'Heat Pump' }), ROW);
  const by = (id) => v.find(x => x.fact.id === id);
  ok('§1 the utilities read the job\'s own columns, several picks shown joined', by('sewer').display === 'Public sewer + Septic' && by('water').value === ''
    && by('gas').target.column === 'gas_supply' && by('garage').target.column === 'garage_type');
  ok('§1 a type reads its item\'s spec value', by('heats').value === 'Heat Pump' && by('heats').target.key === 'hvac_heating::fuel_source');
  ok('§1 a tap adds, takes off, and an absence stands alone', M.nextAnswer(by('gas'), 'Natural gas', 'Propane') === 'Natural gas, Propane'
    && M.nextAnswer(by('gas'), 'Natural gas, Propane', 'No gas service') === 'No gas service' && M.nextAnswer(by('gas'), 'No gas service', 'Propane') === 'Propane'
    && by('gas').absence === 'No gas service' && !by('gas').options.includes('No gas service'));
  ok('§1 a type\'s None stands alone', M.nextAnswer(by('heats'), 'Heat Pump', M.NONE_ANSWER) === M.NONE_ANSWER && M.nextAnswer(by('heats'), M.NONE_ANSWER, 'Heat Pump') === 'Heat Pump');
  // §2
  const elec = vm({ 'hvac_heating::fuel_source': 'Electric Furnace' }, { hvac_elec_furnace_elements: ['OK'] });
  const ve = M.factsView(SYSTEMS, elec, ROW).find(x => x.fact.id === 'heats');
  const b1 = M.blockedBy(ve, 'Heat Pump', SYSTEMS, elec, ROW, () => 0);
  ok('§2 a type change that takes an item with a Satisfactory mark off the checklist is refused and named',
    b1.length === 1 && b1[0].label === 'Heating Elements / Sequencers' && b1[0].why === 'a Satisfactory mark'
    && M.blockedSentence(b1).startsWith('Heating Elements / Sequencers has a Satisfactory mark.'));
  ok('§2 a change that keeps the item goes', M.blockedBy(ve, 'Electric Furnace, Heat Pump', SYSTEMS, elec, ROW, () => 0).length === 0);
  const gv = M.factsView(SYSTEMS, vm({}), ROW).find(x => x.fact.id === 'garage');
  ok('§2 a house fact reads as the phone reads house::garage: Detached alone takes the Garage Door and its finding is named',
    M.blockedBy(gv, 'Detached', SYSTEMS, vm({}), ROW, id => (id === 'gar_door' ? 2 : 0)).map(x => `${x.label}:${x.why}`).join() === 'Garage Door:2 findings'
    && M.blockedBy(gv, 'Attached, Detached', SYSTEMS, vm({}), ROW, id => (id === 'gar_door' ? 2 : 0)).length === 0);
  // §3 / §4 — source
  const api = read(API), panel = read(PANEL), page = read(PAGE);
  ok('§3 the job\'s columns: re-read first, the version the page saw, this browser, the lock\'s epoch',
    api.includes('if (Number(current.row_version) !== Number(row.row_version)) return { kind: \'changed\', row: current };')
    && api.includes('sync_base_version: row.row_version, sync_device: webDevice(), lease_epoch: lease.epoch'));
  ok('§3 the lock is taken before any save; a type goes through put_inspection_values; recorded work is checked first',
    panel.includes('const lease = await lock.ensure();') && panel.includes("await putValue(inspectionId, { key: t.key, kind: 'spec', section: t.section, value, baseSeq: t.seq });")
    && panel.includes('if (blocked.length) { setNote({ tone: \'bad\', text: blockedSentence(blocked) }); return; }'));
  ok('§4 Before you start is first in the menu, with what is left', page.includes("{ id: 'facts', label: 'Before you start', count: factsLeftN || undefined, show: true },\n    { id: 'review',"));
  ok('§4 view only for someone not on the job (and the Office role)', page.includes('canEdit={findingsVisible && (!team || team.people.some(p => p.user_id === team.me))}')
    && panel.includes('const editable = canEdit && !lock.heldBy;'));
  return out;
}

let fail = 0;
for (const x of suite()) { console.log(`  ${x.c ? '✓' : '✗'} ${x.n}`); if (!x.c) fail++; }
// Read-only by default, as every guard the pre-push runs (scripts/git-hooks/pre-push); --mutate proves each check can fail.
if (process.argv.includes('--mutate')) {
console.log('\n§M mutations');
const MUT = [
  [MODEL, 'Backup heat for every house', 'return factsAsked(inTemplate, valueOf).map(f => {', 'return inTemplate.map(f => {'],
  [MODEL, 'an absence stacks with picks', "  if (v.target.kind === 'extras') return togglePick(current, opt, [...v.options, ...(v.absence ? [v.absence] : [])]);", "  if (v.target.kind === 'extras') { const n = splitPicks(current); return (n.includes(opt) ? n.filter(x => x !== opt) : [...n, opt]).join(', '); }"],
  [MODEL, 'recorded work is not protected', '    if (before && !after) out.push(', '    if (false) out.push('],
  [MODEL, 'a house fact is not read as the phone reads house::garage', "Object.keys(HOUSE_KEY).find(k => HOUSE_KEY[k] === (v.target as { key: ExtrasKey }).key)!", '(v.target as { key: ExtrasKey }).key'],
  [API, 'a save does not name its version', 'sync_base_version: row.row_version, ', ''],
  [PANEL, 'a save skips the lock', '      const lease = await lock.ensure();\n      if (!lease) return;\n', '      const lease = { epoch: 0 };\n'],
  [PAGE, 'anyone can change it', 'canEdit={findingsVisible && (!team || team.people.some(p => p.user_id === team.me))}', 'canEdit={true}'],
];
for (const [path, why, a, b] of MUT) {
  const src = read(path);
  if (src.split(a).length !== 2) { fail++; console.log(`  ✗ anchor present once: ${why}`); continue; }
  writeFileSync(path, src.replace(a, b));
  let caught = false;
  try { caught = suite().some(x => !x.c); } finally { writeFileSync(path, src); }
  console.log(`  ${caught ? '✓ caught' : '✗ NOT caught'}: ${why}`); if (!caught) fail++;
}
}
console.log(`\nverify-house-facts-web — ${fail ? fail + ' failed' : 'all passed'}`);
process.exit(fail ? 1 : 0);
