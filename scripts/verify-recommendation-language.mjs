#!/usr/bin/env node
// Guard: a homeowner is told the ACTION, not a profession Ledrix guessed from the system.
//
// Owner decision 2026-10-13. Every stored prosToCall on a historical finding is the model's guess
// from the finding's system — a cracked truss read "Structural Engineer" on the share page. Stored
// findings are NOT rewritten; this site decides what a homeowner reads:
//   • the stored prosToCall is never shown as a recommendation (What Matters, the finding card,
//     the "Recommended:" line in rendered reports — live and sealed — and project CONTRACTOR lines);
//   • a repair-tier finding that had one shows the owner's wording instead
//     (lib/homeownerRecommendation.ts — twin of the app's module, checked for drift below);
//   • the local-pros search names the THING the finding is about, never a trade, and there is no
//     list at all when that would mean guessing (anything possibly structural);
//   • the AI prompts (chat/insight, repair request) cannot name a trade from the system.
// Sealed report payloads and hashes are untouched: only the rendering changed.
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
let checks = 0; const failures = [];
const ok = (l, c, d) => { checks++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${l}`); if (!c) failures.push(d ? `${l}\n      ${d}` : l); };

const HEADING = 'Further Evaluation Recommended';
const TEXT = 'Further evaluation by a qualified professional is recommended to assess the observed condition and determine any necessary corrective action.';
const TRUSS_OBS = 'Observed a cracked truss in the roof framing of the attic. No signs of water intrusion or other deterioration were noted around the truss.';

console.log('Part 1 · lib/homeownerRecommendation (what a homeowner reads)');
const hr = await import(pathToFileURL(join(root, 'lib/homeownerRecommendation.ts')).href);
ok('heading is the owner\'s wording, exactly', hr.FURTHER_EVALUATION_HEADING === HEADING);
ok('text is the owner\'s wording, exactly', hr.FURTHER_EVALUATION_TEXT === TEXT);
const truss = { severity: 'deficiency', prosToCall: 'Structural Engineer', unit: 'ATTIC', description: TRUSS_OBS };
const fe = hr.furtherEvaluation(truss);
ok('cracked truss + stored "Structural Engineer" → Further Evaluation Recommended', fe?.heading === HEADING && fe?.text === TEXT, JSON.stringify(fe));
ok('…never echoes the stored specialist', !/engineer/i.test(JSON.stringify(fe ?? {})));
ok('cracked truss → no local-pros search', hr.neutralProSearch(truss) === null);
ok('legacy "anomaly" severity → neutral block', hr.furtherEvaluation({ severity: 'anomaly', prosToCall: 'Roofer' })?.heading === HEADING);
ok('maintenance → nothing', hr.furtherEvaluation({ severity: 'maintenance', prosToCall: 'Handyman' }) === null);
ok('no stored pro → nothing added', hr.furtherEvaluation({ severity: 'critical', prosToCall: '' }) === null);
ok('"N/A" → nothing', hr.furtherEvaluation({ severity: 'critical', prosToCall: 'N/A' }) === null);
ok('water heater leak → "water heater repair"', hr.neutralProSearch({ unit: 'PLUMBING', description: 'Water heater leaking at the drain valve.' }) === 'water heater repair');
ok('a search is never taken from prosToCall', hr.neutralProSearch({ unit: 'GENERAL', description: 'Stain on ceiling.', prosToCall: 'Licensed Roofer' }) === null);

console.log('Part 1b · legacy finding TEXT (descriptions, bullets, the recommendation field)');
const TRUSS_HIST = `${TRUSS_OBS} A structural engineer should evaluate the truss and determine the necessary repairs.`;
const legacyTruss = { severity: 'deficiency', prosToCall: 'Structural Engineer', unit: 'ATTIC', description: TRUSS_HIST,
  recommendation: 'Evaluation by a licensed structural engineer is recommended.' };
const frozen = JSON.stringify(legacyTruss);
const tv = hr.forHomeowner(legacyTruss);
ok('historical truss: the observation is kept word for word', tv.description === TRUSS_OBS, tv.description);
ok('historical truss: no structural engineer anywhere a homeowner reads', !/engineer/i.test(JSON.stringify([tv.description, tv.observations, tv.recommendation, tv.evaluation])));
ok('historical truss: the owner\'s heading + text instead', tv.evaluation?.heading === HEADING && tv.evaluation?.text === TEXT);
ok('the legacy recommendation field cannot bypass the rule', tv.recommendation === null);
ok('the stored record is not mutated', JSON.stringify(legacyTruss) === frozen);
const gc = hr.forHomeowner({ severity: 'deficiency', recommendation: 'General Contractor' });
ok('a legacy "General Contractor" recommendation is withheld → neutral block', gc.recommendation === null && gc.evaluation?.heading === HEADING);
const leg = hr.forHomeowner({ severity: 'critical', recommendation: 'Add tandem breaker or new circuit. Requires licensed electrician.' });
ok('legacy "Requires licensed electrician" (no recall documented) is withheld', leg.recommendation === null && leg.evaluation?.heading === HEADING);
const bul = hr.forHomeowner({ severity: 'deficiency', observationBullets: ['Corroded copper supply line with an active drip.', 'Ongoing leak can damage adjacent framing.', 'A licensed plumber should repair or replace the affected supply line and connection.'] });
ok('bullets: the specialist bullet is dropped, the two observations kept exactly', JSON.stringify(bul.observations) === JSON.stringify(['Corroded copper supply line with an active drip.', 'Ongoing leak can damage adjacent framing.']) && bul.evaluation?.heading === HEADING);
const semi = hr.forHomeowner({ severity: 'deficiency', description: 'Sag noted at the ridge; a roofer should evaluate; monitor seasonally.' });
ok('semicolon clause: only the recommendation clause goes', semi.description === 'Sag noted at the ridge; monitor seasonally.', semi.description);
const maint = hr.forHomeowner({ severity: 'maintenance', description: 'Gutters are full of debris. Have a handyman clean the gutters before winter.' });
ok('non-repair tier: the specialist becomes "a qualified professional", no evaluation block',
  maint.description === 'Gutters are full of debris. Have a qualified professional clean the gutters before winter.' && maint.evaluation === null, maint.description);
const amb = hr.forHomeowner({ severity: 'deficiency', description: 'Panel was previously serviced by a licensed electrician per the seller. Double-tapped breaker observed.' });
ok('an unclassifiable mention is NOT rewritten — shown as recorded, listed for review',
  amb.description === 'Panel was previously serviced by a licensed electrician per the seller. Double-tapped breaker observed.'
  && amb.needsReview.length === 1 && !amb.changed);
const fpe = hr.forHomeowner({ severity: 'critical', description: 'The panel is a Federal Pacific Stab-Lok. Evaluation by a licensed electrician is recommended.' });
ok('approved rule: documented recalled panel keeps the licensed electrician', /licensed electrician/.test(fpe.description) && !fpe.changed);
const gas = hr.forHomeowner({ severity: 'critical', description: 'Gas odor at the furnace supply valve. A licensed plumber should repair the leak immediately.' });
ok('approved rule: documented gas leak keeps its gas trade', /licensed plumber/.test(gas.description) && !gas.changed);
const plain = hr.forHomeowner({ severity: 'deficiency', description: 'Missing downspout extension at the northeast corner.' });
ok('a finding with no specialist is untouched and gets no block', plain.description === 'Missing downspout extension at the northeast corner.' && plain.evaluation === null && !plain.changed);

const twin = join(root, '../ledrix-app/src/core/services/homeownerRecommendation.ts');
if (existsSync(twin)) {
  const body = s => s.slice(s.indexOf('export const FURTHER_EVALUATION_HEADING'));
  ok('code is identical to the app twin (no drift)', body(read('lib/homeownerRecommendation.ts')) === body(readFileSync(twin, 'utf8')));
} else console.log('  skip twin drift check (ledrix-app not beside this repo)');

console.log('Part 2 · the share page never shows a stored pro');
const share = read('app/share/[id]/page.tsx');
const renders = share.match(/\{a\.prosToCall[^}]*\}|>\{a\.prosToCall\}<|a\.prosToCall \?/g) ?? [];
ok('no JSX renders a.prosToCall', renders.length === 0, renders.join(' | '));
ok('pros fetch uses the neutral search, and only when there is one',
  /const search = neutralProSearch\(a\);/.test(share) && /if \(!where \|\| !search\) \{ setPros\(\[\]\); return; \}/.test(share) && /&trade=\$\{encodeURIComponent\(search\)\}/.test(share));
ok('no pros section without a search', /\{search && <CardSection label="TOP-RATED LOCAL PROS/.test(share));
ok('one homeowner view of a finding: homeView = forHomeowner(…)', /const homeView = \(a: Anomaly\) => forHomeowner\(/.test(share));
ok('finding detail shows the homeowner text and neutral block', /const hv = homeView\(a\);\n\s*const evaluation = hv\.evaluation;/.test(share)
  && /\{hv\.description\}<\/p>/.test(share) && /\{evaluation\.heading\}/.test(share) && /\{evaluation\.text\}/.test(share));
ok('What Matters shows the neutral heading, not the stored pro', /hv\.evaluation \? <div[^>]*>\{hv\.evaluation\.heading\}<\/div>/.test(share));
// No JSX may render a finding's or project's stored text directly. (Raw text is still used for
// identity — repair fingerprints, project de-duplication, the stored project copy — never shown.)
const rawRenders = share.match(/\{a\.description\}|\{a\.recommendation\}|\{p\.recommendation\}|\{p\.title\}|esc\(f\.description\)|\(a\.description \?\? ''\)\.(?:substring|slice)\(0, (?:96|130|170)\)|(?<!\$)\{a\.description \?\? ''\}|a\.recommendation \?(?!\?)|a\.recommendation &&|p\.recommendation &&/g) ?? [];
ok('no legacy recommendation / description reaches the homeowner unfiltered', rawRenders.length === 0, rawRenders.join(' | '));
ok('project cards read title + recommendation through the same rule', /const pvRaw = forHomeowner\(\{ severity: projectSeverity\(p\.priority\), description: p\.title \?\? '', recommendation: p\.recommendation \}\);/.test(share));
{
  // Review fix 2: run the project card's own title lines (extracted from the page) against the helper.
  const lines = (share.match(/(  const pvRaw = forHomeowner\([\s\S]*?\n  const pv = \{[\s\S]*?\};\n)/) ?? [])[1] ?? '';
  const sev = (share.match(/const projectSeverity = (\(priority\?: string\) => [^\n]*);/) ?? [])[1] ?? '';
  let titleOf = () => null;
  try {
    titleOf = new Function('forHomeowner', 'FURTHER_EVALUATION_HEADING', 'p',
      `const projectSeverity = ${sev.replace('(priority?: string)', '(priority)')};\n${lines}\nreturn pv.title;`)
      .bind(null, hr.forHomeowner, hr.FURTHER_EVALUATION_HEADING);
  } catch { /* reported below */ }
  const recTitle = 'A structural engineer should evaluate the cracked truss in the attic.';
  const t1 = titleOf({ priority: 'critical', title: recTitle, recommendation: null });
  ok('project title that IS an unsupported recommendation cannot leak through the fallback', t1 === HEADING && !/engineer/i.test(String(t1)), String(t1));
  const ord = 'Water heater leaking at the drain valve';
  ok('ordinary project title is unchanged', titleOf({ priority: 'high', title: ord, recommendation: null }) === ord);
  ok('empty project title still falls back to the stored title as before', titleOf({ priority: 'low', title: '', recommendation: null }) === '');
}
ok('Ask-Ledrix and repair-request AI get the homeowner text', /About the finding "\$\{a\.unit \?\? ''\}: \$\{hv\.description\}"/.test(share) && /description: homeView\(a\)\.description \} \}\)/.test(share));
ok('projects from a finding no longer copy prosToCall into contractor_type', /contractor_type: null, photos: \[\], seeded: false/.test(share) && !/contractor_type: a\.prosToCall/.test(share));
ok('no CONTRACTOR line on project cards', !/CONTRACTOR: \{p\.contractor_type\}/.test(share));

console.log('Part 3 · rendered reports (live and sealed)');
for (const r of ['app/api/reports/route.ts', 'app/api/reports/seal/[hash]/route.ts']) {
  const s = read(r);
  const code = s.replace(/^\s*\/\/.*$/gm, '');   // the explanatory comment names the removed line
  ok(`${r}: no "Recommended:" line`, !/Recommended:/.test(code) && !/esc\(f\.pros_to_call/.test(code));
  ok(`${r}: description rendered through forHomeowner`, /const hv = forHomeowner\(\{ \.\.\.f, prosToCall: f\.prosToCall \?\? f\.pros_to_call \}\);/.test(code) && /esc\(hv\.description\)/.test(code) && !/esc\(f\.description\)/.test(code));
}
const ctxSrc = read('app/api/ledrix/route.ts');
ok('Insight/chat context reads findings through forHomeowner', /const hv = forHomeowner\(a\);/.test(ctxSrc) && !/\(a\.description \?\? ''\)\.slice\(0, 240\)/.test(ctxSrc));
const seal = read('app/api/reports/seal/[hash]/route.ts');
// (Its one POST is the Storage photo-signing call, unchanged — it signs a URL, it writes no row.)
ok('sealed route is GET-only and never writes report_seals (payload + hash untouched)',
  !/export async function (POST|PATCH|PUT|DELETE)\b/.test(seal) && /export async function GET\(/.test(seal)
  && !/report_seals[^\n]*method:\s*'(POST|PATCH|PUT|DELETE)'/.test(seal));

console.log('Part 3b · the REAL sealed route, run against a stored seal');
{
  const require = createRequire(join(root, 'package.json'));
  const ts = require('typescript');
  const out = join(root, 'node_modules/.cache/verify-recommendation-language');
  rmSync(out, { recursive: true, force: true });
  for (const rel of ['app/api/reports/seal/[hash]/route.ts', 'lib/sopTemplate.ts', 'lib/homeownerRecommendation.ts']) {
    const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const to = join(out, rel.replace(/\.ts$/, '.js')); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, js);
  }
  // The stored seal: payload as Supabase returns it (a string on the wire), hash = sha256 of it.
  const payload = { inspection: { address: '12 Test Ln' }, anomalies: [
    { id: 'f1', unit: 'ATTIC', severity: 'deficiency', pros_to_call: 'Structural Engineer', description: TRUSS_HIST },
    { id: 'f2', unit: 'EXTERIOR', severity: 'maintenance', description: 'Missing downspout extension at the northeast corner.' },
  ] };
  let stored = JSON.stringify(payload);
  let hash = createHash('sha256').update(stored).digest('hex');
  const writes = [];
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && /\/rest\/v1\//.test(String(url))) writes.push(`${method} ${url}`);
    if (/report_seals\?hash=eq\./.test(String(url)))
      return new Response(`[{"hash":"${hash}","parent_hash":null,"inspection_id":"i1","payload":${stored},"created_at":"2026-10-01T00:00:00Z"}]`, { status: 200 });
    return new Response('[]', { status: 200 });
  };
  try {
    const route = require(join(out, 'app/api/reports/seal/[hash]/route.js'));
    const res = await route.GET(new Request(`https://x/api/reports/seal/${hash}`), { params: Promise.resolve({ hash }) });
    const html = await res.text();
    ok('sealed view renders (200)', res.status === 200, `status ${res.status}`);
    ok('sealed view: the truss observation is shown', html.includes('Observed a cracked truss in the roof framing of the attic.'));
    ok('sealed view: no structural engineer, no "Recommended:"', !/engineer/i.test(html) && !/Recommended:/.test(html));
    ok('sealed view: the owner\'s heading + text', html.includes(HEADING) && html.includes(TEXT));
    ok('sealed view: discloses that the view differs and the record does not', /The sealed record and its hash are unchanged\./.test(html));
    ok('sealed view: still shows its hash', html.includes(hash));
    ok('nothing was written back to the database', writes.length === 0, writes.join(', '));
    ok('the stored payload is byte-identical and still hashes to the seal', JSON.stringify(payload) === stored && createHash('sha256').update(stored).digest('hex') === hash);

    // Review fix 3: ONLY the stored professional triggers the evaluation block (the description is clean),
    // which still makes the view differ from what was sealed — the disclosure must say so.
    const prosOnly = { inspection: { address: '14 Test Ln' }, anomalies: [
      { id: 'g1', unit: 'ATTIC', severity: 'deficiency', pros_to_call: 'Structural Engineer', description: TRUSS_OBS } ] };
    stored = JSON.stringify(prosOnly); hash = createHash('sha256').update(stored).digest('hex');
    const storedPros = stored, hashPros = hash;
    const r2 = await route.GET(new Request(`https://x/api/reports/seal/${hash}`), { params: Promise.resolve({ hash }) });
    const h2 = await r2.text();
    ok('pros-only seal: the evaluation block replaces the stored professional', h2.includes(HEADING) && !/engineer/i.test(h2) && h2.includes(TRUSS_OBS));
    ok('pros-only seal: the disclosure appears', /recommendations that named a specific professional are shown as further evaluation or work by a qualified professional\. The sealed record and its hash are unchanged\./.test(h2));
    ok('pros-only seal: payload byte-identical, hash unchanged, nothing written',
      JSON.stringify(prosOnly) === storedPros && createHash('sha256').update(storedPros).digest('hex') === hashPros && writes.length === 0, writes.join(', '));

    // Control: nothing to correct → no disclosure (it must describe the view accurately, not always).
    const clean = { inspection: { address: '16 Test Ln' }, anomalies: [
      { id: 'h1', unit: 'EXTERIOR', severity: 'deficiency', description: 'Missing downspout extension at the northeast corner.' } ] };
    stored = JSON.stringify(clean); hash = createHash('sha256').update(stored).digest('hex');
    const h3 = await (await route.GET(new Request(`https://x/api/reports/seal/${hash}`), { params: Promise.resolve({ hash }) })).text();
    ok('clean seal: no disclosure when the view matches the sealed text', !/The sealed record and its hash are unchanged/.test(h3) && !h3.includes(HEADING));
  } catch (e) {
    ok('sealed route ran', false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '));
  } finally { globalThis.fetch = realFetch; }
}

console.log('Part 4 · AI prompts');
const route = read('app/api/ledrix/route.ts');
const honesty = new Function(`return ${(route.match(/const honesty = ([\s\S]*?);\n/) ?? [])[1]};`)();
ok('chat/insight/analyze: no trade from the system or category', /Do not name a specific trade or specialist[^.]*for a finding because of its system or category/.test(honesty));
ok('…recommends further evaluation by a qualified professional where warranted', /recommend further evaluation by a qualified professional/.test(honesty));
ok('…no diagnosis, no "unsafe" the record does not support', /Do not turn an observation into a diagnosis or call something unsafe the record does not/.test(honesty));
const repair = read('app/api/ledrix/repair/route.ts');
const sys = new Function(`return ${(repair.match(/const REPAIR_SYSTEM =\s*([\s\S]*?);\n/) ?? [])[1]};`)();
ok('repair-request prompt evaluates', typeof sys === 'string' && sys.length > 300);
ok('repair-request example no longer prescribes a licensed electrician', !/licensed electrician/i.test(sys));
ok('repair-request: "a qualified professional", never a trade from the system',
  /Do NOT name a specific trade or specialist[^.]*because of the finding's system or category — say "a qualified professional"/.test(sys) && !/by a licensed trade/.test(sys));

console.log(`\n${checks} checks · ${checks - failures.length} passed, ${failures.length} failed`);
if (failures.length) { console.error('\nFAILED:\n  ' + failures.join('\n  ')); process.exit(1); }
