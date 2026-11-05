#!/usr/bin/env node
// verify-app-parity — every place the website restates the phone's logic still says what the phone says.
//
//   node scripts/verify-app-parity.mjs            (LEDRIX_APP=<dir> another app checkout; ALLOW_NO_APP=1 to skip)
//   node scripts/verify-app-parity.mjs --mutate   prove each check can fail (on scratch copies; never the checkout)
//
// ledrix-app DECISIONS 2026-11-04, Batch 4 ("keep copies honest"). The website runs the phone's report builder from
// the generated bundle (lib/report/render.mjs + assemble.mjs, checked by verify-report-render) and the phone's pure
// rules as byte-identical copies (ledrix-app scripts/web-preview-sync.json). What is left are a few places that must
// stay the website's own code — a server row is not a phone row, a print page is not a phone screen — but that state
// a phone rule in their own words. Each is checked here against the app's source, by running both where they run:
//   1 · every copy the app's manifest lists is byte-identical, and the exported pack rule fields match
//   2 · priority vocabulary: workspace/model.ts, the sealed page's sopTemplate.ts and the share page's PRIO table name
//       the phone's tiers, words, colours and order (SeverityConfig.ts); legacy words map where the phone maps them
//   3 · finding editing (lib/findings/rules.ts): the "no priority yet" test, the confirm gate's fields, the duplicate
//       marker and the priorities offered are the phone's (cardDefinition.ts, findingConfirmation.ts, FindingEditor)
//   4 · the seal page (lib/sealPayload.ts) reads every field the phone's seal payload writes (report/sealPayload.ts)
//   5 · the website's own report (the old /api/reports route) stays retired: one report, the phone's
// Not in the Vercel build: the app checkout is not there. It runs in both repos' pre-push hooks (scripts/git-hooks).
import { readFileSync, existsSync, mkdtempSync, cpSync, writeFileSync, rmSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = resolve(process.env.WEB_ROOT ?? HERE);
const APP = resolve(process.env.LEDRIX_APP ?? join(HERE, '..', 'ledrix-app'));

if (process.argv.includes('--mutate')) { await mutate(); process.exit(0); }

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};
if (!existsSync(join(APP, 'scripts/web-preview-sync.json'))) {
  if (process.env.ALLOW_NO_APP) { console.log(`  · SKIPPED — no ledrix-app at ${APP} (ALLOW_NO_APP set)`); process.exit(0); }
  console.log(`  ✗ ledrix-app found at ${APP} (set LEDRIX_APP, or ALLOW_NO_APP=1 to skip)`); process.exit(1);
}
const app = p => readFileSync(join(APP, p), 'utf8');
const web = p => (existsSync(join(WEB, p)) ? readFileSync(join(WEB, p), 'utf8') : null);
const load = (root, p) => import(pathToFileURL(join(root, p)).href);
const SYNC = 'run in ledrix-app: node scripts/sync-web-preview.mjs';

// ── 1 · byte-identical copies ─────────────────────────────────────────────────────────────────────────────────────
console.log('\n1 · the copies the app lists (scripts/web-preview-sync.json)\n');
const M = JSON.parse(app('scripts/web-preview-sync.json'));
const pairs = Object.entries(M.copies).flatMap(([from, to]) => (Array.isArray(to) ? to : [to]).map(t => [from, t]));
ok('the manifest lists copies', pairs.length >= 20, `${pairs.length}`);
for (const [from, to] of pairs) ok(`${to} = app ${from}`, web(to) === app(from), SYNC);
{
  const pack = JSON.parse(app(M.pack.from));
  const want = {};
  for (const sys of pack.systems) for (const n of sys.nodes) if (n.requires || n.dependsOnSpec)
    want[n.id] = { ...(n.requires ? { requires: n.requires } : {}), ...(n.dependsOnSpec ? { dependsOnSpec: n.dependsOnSpec } : {}) };
  const mine = JSON.parse(web(M.pack.to) ?? '{}');
  ok(`${M.pack.to} carries the pack's rule fields (pack ${pack.packVersion})`,
    JSON.stringify(mine.nodes) === JSON.stringify(want) && mine.packVersion === pack.packVersion, SYNC);
}

// ── 2 · priority vocabulary ───────────────────────────────────────────────────────────────────────────────────────
console.log('\n2 · priority words, colours and order (app src/core/theme/SeverityConfig.ts)\n');
const SC = await load(APP, 'src/core/theme/SeverityConfig.ts');
const TIERS = [...SC.SEVERITIES_IN_ORDER];
const WM = await load(WEB, 'lib/workspace/model.ts');
ok('workspace/model.ts: the five tiers, in the phone\'s order', JSON.stringify(WM.SEVERITIES_IN_ORDER) === JSON.stringify(TIERS));
ok('workspace/model.ts: the phone\'s short labels', JSON.stringify(WM.SEVERITY_SHORT_LABELS) === JSON.stringify(SC.SEVERITY_SHORT_LABELS));
ok('workspace/model.ts: the phone\'s colours', JSON.stringify(WM.SEVERITY_COLOR) === JSON.stringify(SC.SEVERITY_COLOR));
const WORDS = [...TIERS, 'anomaly', 'cosmetic', 'safety hazard', 'observation', 'CRITICAL', ' Spec ', 'nonsense', '', null, 3];
const sevDiff = WORDS.filter(w => (WM.parseSeverity(w) ?? null) !== (SC.parseSeverity(w) ?? null));
ok('workspace/model.ts: parseSeverity reads every word as the phone does', sevDiff.length === 0, `differs on ${JSON.stringify(sevDiff)}`);

const title = s => s.toLowerCase().replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase());
const SOP = await load(WEB, 'lib/sopTemplate.ts');
ok('sopTemplate.ts: exactly the phone\'s tiers', JSON.stringify(Object.keys(SOP.SEVERITY_META).sort()) === JSON.stringify([...TIERS].sort()));
for (const t of TIERS) {
  const m = SOP.SEVERITY_META[t] ?? {};
  ok(`sopTemplate.ts: ${t} reads "${title(SC.SEVERITY_SHORT_LABELS[t])}", rank ${SC.SEVERITY_ORDER[t]}`,
    m.label === title(SC.SEVERITY_SHORT_LABELS[t]) && m.rank === SC.SEVERITY_ORDER[t], JSON.stringify(m));
}

const share = web('app/share/[id]/page.tsx') ?? '';
const prioSrc = /const PRIO = (\{[\s\S]*?\n\}) as const;/.exec(share)?.[1];
const mapSrc = /const SEV_TO_PRIO: Record<string, PrioKey> = (\{[\s\S]*?\});/.exec(share)?.[1];
ok('share page: the PRIO table and its severity map are found', !!prioSrc && !!mapSrc);
const PRIO = prioSrc ? Function(`return ${prioSrc}`)() : {};
const S2P = mapSrc ? Function(`return ${mapSrc}`)() : {};
for (const t of TIERS) {
  const p = PRIO[S2P[t]] ?? {};
  ok(`share page: ${t} → "${SC.SEVERITY_SHORT_LABELS[t]}" ${SC.SEVERITY_COLOR[t]}`,
    p.label === SC.SEVERITY_SHORT_LABELS[t] && p.color === SC.SEVERITY_COLOR[t], JSON.stringify(p));
  ok(`share page and sealed page print ${t} in one colour`, !!p.report && p.report === SOP.SEVERITY_META[t]?.color,
    `${p.report} vs ${SOP.SEVERITY_META[t]?.color}`);
}
ok('share page: the tiers rank in the phone\'s order', TIERS.every((t, i) => i === 0 || (PRIO[S2P[TIERS[i - 1]]]?.rank ?? 0) < (PRIO[S2P[t]]?.rank ?? -1)));
const aliasDiff = Object.keys(S2P).filter(w => S2P[w] !== S2P[SC.parseSeverity(w) ?? '']);
ok('share page: every legacy word lands on the tier the phone reads it as', aliasDiff.length === 0, `differs on ${JSON.stringify(aliasDiff)}`);

// ── 3 · finding editing ───────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3 · editing a finding (lib/findings/rules.ts vs the phone\'s cardDefinition, findingConfirmation, FindingEditor)\n');
const R = await load(WEB, 'lib/findings/rules.ts');
const CD = await load(APP, 'src/core/report/cardDefinition.ts');
const appPrefix = /export const AMBIGUOUS_PREFIX = '([^']*)';/.exec(app('src/core/services/findingConfirmation.ts'))?.[1];
ok('the "possible duplicate" marker is the phone\'s', !!appPrefix && R.AMBIGUOUS_PREFIX === appPrefix, `${JSON.stringify(R.AMBIGUOUS_PREFIX)} vs ${JSON.stringify(appPrefix)}`);
const excluded = /const FINDING_TIERS = SEVERITIES_IN_ORDER\.filter\(sv => sv !== '(\w+)'\);/.exec(app('src/app/FindingEditorScreen.tsx'))?.[1];
ok('the priorities offered are the phone\'s (every tier but the one its editor leaves out)',
  !!excluded && JSON.stringify([...R.PICKABLE_PRIORITIES]) === JSON.stringify(TIERS.filter(t => t !== excluded)),
  `${JSON.stringify(R.PICKABLE_PRIORITIES)}; phone leaves out ${excluded}`);
// A server row as the phone would hold it after a pull (syncRecordMapping: status null → 'confirmed'; ai_severity → ai.severity).
const asPhone = row => ({ source: row.source ?? undefined, status: row.status == null || row.status === '' ? 'confirmed' : row.status,
  aiOriginalState: row.ai_severity ? { severity: row.ai_severity } : undefined });
const rows = [];
for (const source of ['document_photo', 'capture', 'voice', null])
  for (const status of ['proposed', 'confirmed', 'rejected', null, ''])
    for (const ai_severity of [null, '', 'deficiency', '  '])
      rows.push({ source, status, ai_severity, severity: 'deficiency' });
const unsetDiff = rows.filter(r => R.priorityUnset(r) !== CD.isPriorityUnset(asPhone(r)));
ok(`"no priority yet" agrees with the phone on all ${rows.length} kinds of row`, unsetDiff.length === 0,
  `differs on ${JSON.stringify(unsetDiff.slice(0, 3))}`);
// The confirm gate: the phone requires every field a finding card carries (cardRequiredFields). The website's draft
// holds them under its own names — this map is the one place that says which is which; a new required field fails.
const FIELD_LABEL = { issue: 'Description', observations: 'Description', system: 'System', priority: 'Priority', location: 'Location' };
const req = [...CD.cardRequiredFields('finding')];
ok('every field the phone requires to confirm a finding has its place on the website', req.every(f => FIELD_LABEL[f]),
  `unmapped: ${req.filter(f => !FIELD_LABEL[f]).join(', ')}`);
const row = { status: 'proposed', severity: 'deficiency', description: 'Cracked truss.', inspector_notes: '', room: 'Attic', location: 'Attic',
  level: '', unit: 'ATTIC', is_safety: false, inspector_id: 'u', staged_limitation: false, source: 'capture', ai_severity: null };
const full = R.draftOf(row);
ok('a complete finding may be confirmed', R.missingForConfirm(row, full).length === 0, JSON.stringify(R.missingForConfirm(row, full)));
const wantAll = [...new Set(req.map(f => FIELD_LABEL[f]).filter(Boolean))].sort();
const empty = { ...full, description: '', severity: '', room: '' };
ok('an empty finding names exactly the phone\'s required fields', JSON.stringify(R.missingForConfirm({ ...row, unit: '' }, empty).sort()) === JSON.stringify(wantAll),
  `${JSON.stringify(R.missingForConfirm({ ...row, unit: '' }, empty))} vs ${JSON.stringify(wantAll)}`);
for (const [label, r2, d2] of [['Description', row, { ...full, description: '' }], ['System', { ...row, unit: '' }, full],
  ['Priority', row, { ...full, severity: '' }], ['Location', row, { ...full, room: '' }]]) {
  ok(`missing ${label} alone stops confirm`, JSON.stringify(R.missingForConfirm(r2, d2)) === JSON.stringify([label]), JSON.stringify(R.missingForConfirm(r2, d2)));
}
ok('confirming strips the duplicate marker, as the phone does',
  R.confirmPatch({ ...row, description: appPrefix + 'Cracked truss.' }, { ...full, description: appPrefix + 'Cracked truss.' }).description === 'Cracked truss.');

// ── 4 · the seal page reads what the phone seals ──────────────────────────────────────────────────────────────────
console.log('\n4 · the seal page (lib/sealPayload.ts) vs the phone\'s seal payload (src/core/report/sealPayload.ts)\n');
const SP = await load(APP, 'src/core/report/sealPayload.ts');
const WS = await load(WEB, 'lib/sealPayload.ts');
const digest = 'ab'.repeat(32);
const payload = SP.sealPayload({ id: 'i1', address: '1 Test St' }, digest, 7);
ok('a phone seal reads as a digest seal', WS.sealPayloadKind(JSON.parse(JSON.stringify(payload))) === 'digest');
const facts = WS.digestSealFacts(payload);
ok('the page shows its fingerprint, photo count and template', facts.digest === digest && facts.evidenceCount === 7 && facts.templateVersion === payload.template_version, JSON.stringify(facts));
ok('the phone seals nothing the page does not show', JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(['evidence_count', 'input_digest', 'inspection', 'template_version']),
  `phone payload keys: ${Object.keys(payload).join(', ')} — show the new one on app/api/reports/seal/[hash], then add it here`);
ok('the sealed page names the template the phone seals', SOP.SOP_TEMPLATE_VERSION === payload.template_version, `${SOP.SOP_TEMPLATE_VERSION} vs ${payload.template_version}`);

// ── 5 · one report ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5 · the website\'s own report stays retired\n');
ok('app/api/reports/route.ts is gone (the website composed its own report there)', !existsSync(join(WEB, 'app/api/reports/route.ts')));
const files = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|mjs)$/.test(f)) files.push(p); } };
for (const d of ['app', 'lib', 'components']) if (existsSync(join(WEB, d))) walk(join(WEB, d));
const linking = files.filter(p => !/\/prototype\//.test(p) && !p.endsWith('.mjs')).filter(p =>
  readFileSync(p, 'utf8').split('\n').some(l => !/^\s*(\/\/|\*|\/\*)/.test(l) && /\/api\/reports(?!\/seal)(\?|'|"|`)/.test(l)));
ok('nothing links to it', linking.length === 0, linking.map(p => p.slice(WEB.length + 1)).join(', '));

console.log(`\n${pass + fail} checks · ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

// ── mutation proof: each one on a scratch copy of both repos' files; the real checkouts are never written ───────────
async function mutate() {
  const MUT = [
    ['W1 a copied rule drifts on the website', 'web', 'lib/scope/core/taxonomy/scopeRules.ts', s => s + '\n// drift\n'],
    ['W2 the share page renames a tier', 'web', 'app/share/[id]/page.tsx', s => s.replace("minor:  { label: 'MINOR REPAIR'", "minor:  { label: 'MINOR FIX'")],
    ['W3 the sealed page reorders two tiers', 'web', 'lib/sopTemplate.ts', s => s.replace("color: '#CA8A04', rank: 1", "color: '#CA8A04', rank: 2")],
    ['W4 the website forgets Ledrix\'s suggestion in "no priority yet"', 'web', 'lib/findings/rules.ts', s => s.replace("&& !str(row.ai_severity)", '')],
    ['W5 the website stops requiring a location to confirm', 'web', 'lib/findings/rules.ts', s => s.replace("if (!str(d.room)) m.push('Location');", '')],
    ['W6 the duplicate marker changes on the website', 'web', 'lib/findings/rules.ts', s => s.replace("'Possible duplicate — review: '", "'Possible duplicate: '")],
    ['W7 the seal page stops reading the digest', 'web', 'lib/sealPayload.ts', s => s.replace("typeof p.input_digest === 'string'", "typeof p.digest === 'string'")],
    ['W8 the website\'s own report comes back', 'web', 'app/api/reports/route.ts', () => "export async function GET() { return new Response('report'); }\n"],
    ['W9 the workspace recolours a tier', 'web', 'lib/workspace/model.ts', s => s.replace("deficiency:     '#EAB308'", "deficiency:     '#EAB300'")],
    ['W10 the website offers GOOD as a finding priority', 'web', 'lib/findings/rules.ts', s => s.replace("['critical', 'deficiency', 'maintenance', 'characteristic'] as const", "['critical', 'deficiency', 'maintenance', 'characteristic', 'spec'] as const")],
    ['W11 a page links to the retired report', 'web', 'lib/workspace/client.ts', s => s + "\nexport const OLD_REPORT = (t: string) => `/api/reports?token=${t}`;\n"],
    ['A1 the phone requires a new field to confirm a finding', 'app', 'src/core/report/cardDefinition.ts', s => s.replace("finding:     ['issue', 'system', 'priority', 'location', 'observations'],", "finding:     ['issue', 'system', 'priority', 'location', 'observations', 'unknowns'],").replace("new Set<CardFieldId>(['unknowns'])", 'new Set<CardFieldId>([])')],
    ['A2 the phone renames a tier', 'app', 'src/core/theme/SeverityConfig.ts', s => s.replace("deficiency:     'MINOR REPAIR',\n  maintenance:    'MAINT & IMPROVE',\n  characteristic: 'TYPICAL WEAR',\n  spec:           'GOOD',\n};\n\n", "deficiency:     'SMALL REPAIR',\n  maintenance:    'MAINT & IMPROVE',\n  characteristic: 'TYPICAL WEAR',\n  spec:           'GOOD',\n};\n\n")],
    ['A3 the phone seals a new field', 'app', 'src/core/report/sealPayload.ts', s => s.replace("template_version: 'generic-v1',", "template_version: 'generic-v1',\n    report_version: 1,")],
    ['A4 the phone changes "no priority yet"', 'app', 'src/core/report/cardDefinition.ts', s => s.replace("  if (ledrixSuggestedPriority(row)) return false;    // Ledrix recommended one (2026-11-01)\n", '')],
    ['A5 the phone changes the duplicate marker', 'app', 'src/core/services/findingConfirmation.ts', s => s.replace("export const AMBIGUOUS_PREFIX = 'Possible duplicate — review: ';", "export const AMBIGUOUS_PREFIX = 'Duplicate? ';")],
    ['A6 the phone recolours a tier', 'app', 'src/core/theme/SeverityConfig.ts', s => s.replace("critical:       '#F97316', // orange", "critical:       '#F97300', // orange")],
    ['A7 the phone offers GOOD on a finding', 'app', 'src/app/FindingEditorScreen.tsx', s => s.replace("const FINDING_TIERS = SEVERITIES_IN_ORDER.filter(sv => sv !== 'spec');", "const FINDING_TIERS = SEVERITIES_IN_ORDER.filter(sv => sv !== 'characteristic');")],
  ];
  const scratch = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'app-parity-'));
  const fresh = () => {
    rmSync(join(scratch, 'web'), { recursive: true, force: true }); rmSync(join(scratch, 'app'), { recursive: true, force: true });
    for (const d of ['app', 'lib', 'components', 'scripts']) cpSync(join(WEB, d), join(scratch, 'web', d), { recursive: true, filter: p => !/node_modules|\/prototype\//.test(p) });
    const M = JSON.parse(readFileSync(join(APP, 'scripts/web-preview-sync.json'), 'utf8'));
    const need = new Set(['scripts/web-preview-sync.json', M.pack.from, ...Object.keys(M.copies), 'src/core/theme/SeverityConfig.ts',
      'src/core/report/cardDefinition.ts', 'src/core/services/findingConfirmation.ts', 'src/app/FindingEditorScreen.tsx', 'src/core/report/sealPayload.ts']);
    for (const p of need) { mkdirSync(dirname(join(scratch, 'app', p)), { recursive: true }); cpSync(join(APP, p), join(scratch, 'app', p)); }
  };
  const run = () => spawnSync(process.execPath, ['--no-warnings', fileURLToPath(import.meta.url)],
    { env: { ...process.env, WEB_ROOT: join(scratch, 'web'), LEDRIX_APP: join(scratch, 'app') }, encoding: 'utf8' });
  fresh();
  const base = run();
  const baseLine = (base.stdout.match(/\d+ checks · .*/) ?? ['?'])[0];
  console.log(`unmutated scratch copy: ${baseLine} (exit ${base.status})`);
  let caught = 0;
  for (const [name, side, rel, edit] of MUT) {
    fresh();
    const p = join(scratch, side, rel);
    const before = existsSync(p) ? readFileSync(p, 'utf8') : '';
    const after = edit(before);
    if (after === before) { console.log(`  ! ${name}: the mutation did not apply (anchor moved)`); continue; }
    writeFileSync(p, after);
    const r = run();
    const failed = (r.stdout.match(/(\d+) failed/) ?? [, '?'])[1];
    if (r.status !== 0) caught++;
    console.log(`  ${r.status !== 0 ? '✓ caught' : '✗ MISSED'} ${name} → ${failed} failed (exit ${r.status})`);
  }
  rmSync(scratch, { recursive: true, force: true });
  console.log(`\n${caught}/${MUT.length} mutations caught${base.status === 0 ? '' : ' — but the unmutated copy FAILED'}`);
  if (caught !== MUT.length || base.status !== 0) process.exit(1);
}
