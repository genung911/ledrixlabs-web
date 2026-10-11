#!/usr/bin/env node
// ─── Guard: the default Full Report is the html of the version pdf_url names (S-14, 2026-10-10) ──
//
// The app stages report.pdf and report.html under `<shareId>/reports/<version>/` and then moves
// `home_records.pdf_url` to that version in one record write. The portal's default Full Report must
// follow pdf_url — the html beside the versioned PDF — and fall back to the legacy fixed
// `<shareId>/report.html` for older records or a missing version html. A history version keeps
// reading its own snapshot.
//
// EXECUTED: lib/portalAssets.ts (defaultReportHtmlPaths, loadFirstReport) transpiled with the repo's
// TypeScript, plus a cross-check that every derived path is one the REAL /api/report-asset rules
// (lib/storageSign normalizePath + lib/shareAccess pathInShare) accept as-is. SOURCE-TEXT: the
// page wiring (marked below) — the page is a React client component and is not rendered here.
//
//   node scripts/verify-report-html-version.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repo, 'package.json'));
const ts = require('typescript');
let checks = 0; const failures = [];
const ok = (l, c, d) => { checks++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${l}`); if (!c) failures.push(d ? `${l}\n      ${d}` : l); };

const cache = join(repo, 'node_modules/.cache/verify-report-html-version'); mkdirSync(cache, { recursive: true });
const load = (rel, name) => {
  const out = ts.transpileModule(readFileSync(join(repo, rel), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  writeFileSync(join(cache, name), out);
  return require(join(cache, name));
};
const { defaultReportHtmlPaths, loadFirstReport, assetUrl, pdfObjectPath } = load('lib/portalAssets.ts', 'portalAssets.cjs');
const { normalizePath } = load('lib/storageSign.ts', 'storageSign.cjs');
const { pathInShare } = load('lib/shareAccess.ts', 'shareAccess.cjs');

const ID = 'insp_1791237839239';
const PUB = 'https://abc.supabase.co/storage/v1/object/public/inspection-pdfs/';
const V = '20261010-120000-1a2b3c';
// The real route accepts a path only if normalizing it changes nothing and it sits in the share.
const routeAccepts = (p, id = ID) => normalizePath(p) === p && pathInShare(p, id);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('derivation (executed)');
let r = defaultReportHtmlPaths(ID, `${PUB}${ID}/reports/${V}/report.pdf`);
ok('versioned pdf_url (full public URL) → its versioned html, then the fixed path', eq(r, [`${ID}/reports/${V}/report.html`, `${ID}/report.html`]), JSON.stringify(r));
r = defaultReportHtmlPaths(ID, `${ID}/reports/${V}/report.pdf`);
ok('versioned pdf_url (bare object path) → same', eq(r, [`${ID}/reports/${V}/report.html`, `${ID}/report.html`]), JSON.stringify(r));
r = defaultReportHtmlPaths(ID, `${ID}/reports/20261010-120000/report.pdf`);
ok('a pre-suffix version id (seconds only) is still a version', eq(r, [`${ID}/reports/20261010-120000/report.html`, `${ID}/report.html`]), JSON.stringify(r));
ok('legacy pdf_url `<id>/report.pdf` → fixed html only', eq(defaultReportHtmlPaths(ID, `${PUB}${ID}/report.pdf`), [`${ID}/report.html`]));
ok('no pdf_url (null / empty) → fixed html only', eq(defaultReportHtmlPaths(ID, null), [`${ID}/report.html`]) && eq(defaultReportHtmlPaths(ID, ''), [`${ID}/report.html`]));
ok('invalid share id → nothing to load', eq(defaultReportHtmlPaths('', `${ID}/reports/${V}/report.pdf`), []) && eq(defaultReportHtmlPaths('../x', null), []) && eq(defaultReportHtmlPaths('a/b', null), []));

console.log('\nrejected inputs fall back to the fixed path (executed)');
const hostile = [
  ['another share’s versioned pdf', `${PUB}insp_OTHER/reports/${V}/report.pdf`],
  ['traversal in the version', `${ID}/reports/../report.pdf`],
  ['traversal out of the share', `${ID}/reports/${V}/../../insp_OTHER/report.pdf`],
  ['encoded traversal', `${ID}/reports/%2e%2e/report.pdf`],
  ['doubled slash', `${ID}/reports//${V}/report.pdf`],
  ['backslash', `${ID}/reports/${V}\\report.pdf`],
  ['query smuggled in', `${ID}/reports/${V}/report.pdf?x=1`],
  ['fragment', `${ID}/reports/${V}/report.pdf#a`],
  ['control character', `${ID}/reports/${V}\u0000/report.pdf`],
  ['nested deeper than one version', `${ID}/reports/${V}/extra/report.pdf`],
  ['not a pdf', `${ID}/reports/${V}/report.html`],
  ['other file name', `${ID}/reports/${V}/evil.pdf`],
  ['report/<id>/ photo prefix', `report/${ID}/reports/${V}/report.pdf`],
  ['file:// uri', `file:///var/${ID}/reports/${V}/report.pdf`],
  ['version "."', `${ID}/reports/./report.pdf`],
  ['extra segment after report.pdf', `${ID}/reports/${V}/report.pdf/extra`],
  ['share-id prefix match only', `${PUB}${ID}9/reports/${V}/report.pdf`],
];
for (const [label, input] of hostile) {
  const out = defaultReportHtmlPaths(ID, input);
  ok(`${label} → fixed html only`, eq(out, [`${ID}/report.html`]), JSON.stringify(out));
}

console.log('\nthe pdf_url cleaning step refuses each unsafe shape ON ITS OWN (executed)');
// These inputs are also rejected later by the exact-shape check; here each refusal is shown to work
// by itself, so removing any one of them is caught.
for (const [label, input] of [
  ['another share', `${PUB}insp_OTHER/reports/${V}/report.pdf`],
  ['share-id prefix match only', `${ID}9/reports/${V}/report.pdf`],
  ['traversal', `${ID}/reports/../report.pdf`],
  ['backslash', `${ID}/reports/${V}\\report.pdf`],
  ['doubled slash', `${ID}/reports//${V}/report.pdf`],
  ['query', `${ID}/reports/${V}/report.pdf?x=1`],
  ['fragment', `${ID}/reports/${V}/report.pdf#a`],
  ['percent re-encoding', `${ID}/reports/%2e%2e/report.pdf`],
  ['control character', `${ID}/reports/${V}\u0001/report.pdf`],
  ['file uri', `file:///${ID}/reports/${V}/report.pdf`],
]) ok(`cleaning refuses: ${label}`, pdfObjectPath(input, ID) === null, String(pdfObjectPath(input, ID)));
ok('cleaning refuses a "file…" path exactly where the real normalizePath does (share id "file1")',
  pdfObjectPath(`file1/reports/${V}/report.pdf`, 'file1') === null && normalizePath(`file1/reports/${V}/report.pdf`) === null);
ok('cleaning keeps a valid versioned path, full URL or bare', pdfObjectPath(`${PUB}${ID}/reports/${V}/report.pdf`, ID) === `${ID}/reports/${V}/report.pdf` && pdfObjectPath(`/${ID}/reports/${V}/report.pdf`, ID) === `${ID}/reports/${V}/report.pdf`);
for (const s of [`${PUB}${ID}/reports/${V}/report.pdf`, `${ID}/report.pdf`]) {
  const p = pdfObjectPath(s, ID);
  ok(`cleaning agrees with the real normalizePath + pathInShare: ${s.slice(-40)}`, p === normalizePath(s) && pathInShare(p, ID));
}

console.log('\nagreement with the real /api/report-asset rules (executed)');
const samples = [`${PUB}${ID}/reports/${V}/report.pdf`, `${ID}/reports/${V}/report.pdf`, `${PUB}${ID}/report.pdf`, null, ...hostile.map(h => h[1])];
const derived = [...new Set(samples.flatMap(s => defaultReportHtmlPaths(ID, s)))];
ok('every path the portal derives is accepted unchanged by normalizePath + pathInShare', derived.every(p => routeAccepts(p)), derived.filter(p => !routeAccepts(p)).join(', '));
ok('…and the route would refuse every derived path for a DIFFERENT share', derived.every(p => !routeAccepts(p, 'insp_OTHER')));
const url = assetUrl('report-asset', `${ID}/reports/${V}/report.html`, 'tokX');
ok('the asset URL carries the exact path and the token', url === `/api/report-asset?path=${encodeURIComponent(`${ID}/reports/${V}/report.html`)}&t=tokX`, url);

console.log('\nloading with fallback (executed)');
const big = (tag) => `<html>${tag}${'x'.repeat(400)}</html>`;
const fakeFetch = (table, log) => async (u) => {
  log.push(u);
  const hit = table[u];
  if (hit instanceof Error) throw hit;
  return hit ? { ok: hit.status === 200, text: async () => hit.body } : { ok: false, text: async () => '' };
};
let log = [];
let t = await loadFirstReport(['A', 'B'], fakeFetch({ A: { status: 200, body: big('versioned') }, B: { status: 200, body: big('fixed') } }, log));
ok('versioned html present → it is shown, the fixed path is not even requested', /versioned/.test(t ?? '') && eq(log, ['A']), JSON.stringify(log));
log = [];
t = await loadFirstReport(['A', 'B'], fakeFetch({ A: { status: 404, body: '' }, B: { status: 200, body: big('fixed') } }, log));
ok('versioned html missing (404) → falls back to the fixed html', /fixed/.test(t ?? '') && eq(log, ['A', 'B']), JSON.stringify(log));
log = [];
t = await loadFirstReport(['A', 'B'], fakeFetch({ A: new Error('network'), B: { status: 200, body: big('fixed') } }, log));
ok('versioned request throws → falls back to the fixed html', /fixed/.test(t ?? ''));
t = await loadFirstReport(['A', 'B'], fakeFetch({ A: { status: 200, body: 'tiny' }, B: { status: 200, body: big('fixed') } }, []));
ok('versioned html too short to be a report → falls back (same 300-char test the page used)', /fixed/.test(t ?? ''));
t = await loadFirstReport(['A', 'B'], fakeFetch({}, []));
ok('neither loads → null (the page shows its reconstructed report, as before)', t === null);
t = await loadFirstReport([], fakeFetch({}, []));
ok('no candidates → null', t === null);

console.log('\npage wiring (SOURCE-TEXT — the client component is not rendered here)');
const page = readFileSync(join(repo, 'app/share/[id]/page.tsx'), 'utf8');
ok('[source] a selected history version still reads ONLY its own html_path',
  /const reportUrls: string\[\] = selected\?\.html_path\s*\?\s*\[assetUrl\('report-asset', selected\.html_path, PORTAL_TOKEN\)\]/.test(page));
ok('[source] the default reads defaultReportHtmlPaths(record.share_id, record.pdf_url) — pdf_url is the source of truth',
  /:\s*defaultReportHtmlPaths\(record\.share_id, record\.pdf_url\)\.map\(p => assetUrl\('report-asset', p, PORTAL_TOKEN\)\)/.test(page));
ok('[source] the effect loads the candidates in order and still adds the token to the html',
  /loadFirstReport\(reportKey\.split\('\\n'\), url => fetch\(url\)\)/.test(page) && /setDoc\(t \? withTokenInHtml\(t, PORTAL_TOKEN\) : 'none'\)/.test(page));
ok('[source] the fixed path is no longer hard-coded in the page (it lives in the helper)', !page.includes('`${record.share_id}/report.html`'));
ok('[source] the PDF link still comes from pdf_url (unchanged)', /const src = record\.pdf_url \|\| \(record\.share_id \? `\$\{record\.share_id\}\/report\.pdf` : ''\);/.test(page));
ok('[source] the cover still comes from cover_url (unchanged)', /photoUrl\(record\.cover_url\)/.test(page));

console.log(`\n${checks} checks, ${failures.length} failing`);
if (failures.length) { console.error('\n' + failures.join('\n')); process.exit(1); }
