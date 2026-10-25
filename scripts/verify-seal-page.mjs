// Guard for the sealed-report page (/api/reports/seal/[hash]) — report integrity, 2026-10-24.
//
//   node scripts/verify-seal-page.mjs     (LEDRIX_APP=<dir> the app repo; ALLOW_NO_APP=1 skips the producer check)
//
// The page read `payload.anomalies`; the app's seal payload has carried no findings since its O-4 ruling (it attests the
// finalized report record by digest), so every current seal printed "No confirmed findings in this seal". Holds:
//   1. EXECUTED (lib/sealPayload.ts, import-free): a current-format payload is a DIGEST seal, a pre-O-4 payload with
//      findings is a FINDINGS seal, anything else is unknown;
//   2. STATIC: the route renders findings only for a findings seal, says what a digest seal attests, never prints
//      "No confirmed findings" or "No defects logged" for one, and reads nothing but `report_seals`;
//   3. PRODUCER: the app's SealService payload is the current format (input_digest, no anomalies) — if it ever changes,
//      this page must be reconsidered, and this check says so.
// MUTATION HOOKS: SEAL_PAYLOAD_MODULE, SEAL_ROUTE_SRC.
// MUTATION PROOF (2026-10-24; unmutated 10/10): a digest seal treated as findings → 2 failed · the page reads
//   payload.anomalies regardless → 1 · "No confirmed findings" printed for a digest seal → 1 (first run NOT CAUGHT: the
//   branch check matched the first copy only; it now also requires exactly one copy).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ?? join(ROOT, '..', 'ledrix-app');
const MOD = process.env.SEAL_PAYLOAD_MODULE ?? join(ROOT, 'lib/sealPayload.ts');
const ROUTE = process.env.SEAL_ROUTE_SRC ?? join(ROOT, 'app/api/reports/seal/[hash]/route.ts');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const S = await import(pathToFileURL(MOD).href);

console.log('\n1 · what a payload is (executed)\n');
// The current format, exactly as ledrix-app SealService builds it.
const current = { inspection: { address: '1 Main St' }, input_digest: 'a'.repeat(64), evidence_count: 12, template_version: 'generic-v1' };
const legacy = { inspection: { address: '1 Main St' }, anomalies: [{ id: 'f1', severity: 'critical', unit: 'HEATING', description: 'Flue disconnected' }] };
ok('1 · a current-format seal (digest, no findings) is a DIGEST seal', S.sealPayloadKind(current) === 'digest');
ok('1 · a pre-O-4 seal carrying findings is a FINDINGS seal', S.sealPayloadKind(legacy) === 'findings');
ok('1 · a findings seal with zero findings is still a findings seal (it sealed "none")', S.sealPayloadKind({ anomalies: [] }) === 'findings');
ok('1 · anything else is unknown, never "no findings"', ['unknown'].includes(S.sealPayloadKind({})) && S.sealPayloadKind(null) === 'unknown'
  && S.sealPayloadKind({ input_digest: 'not-a-digest' }) === 'unknown');
const f = S.digestSealFacts(current);
ok('1 · a digest seal states its fingerprint, photo count and template', f.digest === current.input_digest && f.evidenceCount === 12 && f.templateVersion === 'generic-v1');

console.log('\n2 · the page (static)\n');
const route = strip(readFileSync(ROUTE, 'utf8'));
ok('2 · findings are taken from the payload ONLY for a findings seal', /const kind = sealPayloadKind\(payload\);/.test(route)
  && /const findings: any\[\] = kind === 'findings' \? payload\.anomalies : \[\];/.test(route));
ok('2 · "No confirmed findings" / "No defects logged" print only inside the findings branch — once each, nowhere else',
  /\$\{kind === 'findings' \? `[\s\S]*No defects logged[\s\S]*No confirmed findings in this seal[\s\S]*` : kind === 'digest'/.test(route)
  && (route.match(/No confirmed findings/g) ?? []).length === 1 && (route.match(/No defects logged/g) ?? []).length === 1);
ok('2 · a digest seal says what it attests (the record fingerprint), and that the findings are in the delivered report',
  /What this seal attests/.test(route) && /Report record fingerprint/.test(route) && /digestSealFacts\(payload\)/.test(route));
ok('2 · the page reads only report_seals — never the live inspections or anomalies tables',
  /rest\(`report_seals\?hash=eq\./.test(route) && !/rest\(`(inspections|anomalies|home_records)/.test(route));

console.log('\n3 · the producer still writes the current format\n');
const sealSvc = join(APP, 'src/core/services/SealService.ts');
if (!existsSync(sealSvc)) {
  if (process.env.ALLOW_NO_APP) console.log('  · SKIPPED — no ledrix-app');
  else ok(`ledrix-app found at ${APP}`, false);
} else {
  const svc = strip(readFileSync(sealSvc, 'utf8'));
  const block = (() => { const i = svc.indexOf('const payload = {'); const j = svc.indexOf('};', i); return i < 0 ? '' : svc.slice(i, j); })();
  ok('3 · SealService\'s payload carries input_digest and no anomalies (a DIGEST seal)',
    /input_digest: frozen\.digest/.test(block) && !/anomalies/.test(block), 'the seal format changed — reconsider this page');
}

console.log(`\n${pass + fail} checks · ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
