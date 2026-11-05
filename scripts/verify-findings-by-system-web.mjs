// Guard: the website lays findings out exactly as the phone's PDF does (ledrix-app DECISIONS 2026-11-04 — owner: "Use
// recommendation to switch to phones system list" / "Keep like PDF so website and PDF match").
//
//   node scripts/verify-findings-by-system-web.mjs     (LEDRIX_APP=<dir> the app repo; ALLOW_NO_APP=1 skips §3)
//
//   §1 EXECUTED lib/report/findingSections.ts on the bundle's groupReportFindings (lib/report/render.mjs): the phone's
//      system list and order, components worst first, findings worst first, the PDF's no-repeat sub-heading rule, every
//      finding exactly once — and with no grouping at all, every finding still printed (under GENERAL)
//   §2 STATIC the pages use it: the sealed page builds its sections from findingSections + sealSectionsHtml on the
//      bundle's grouping; /api/share sends reportGroups from it; the share page's Report tab, summary and floor-plan
//      matching read it; the website's own lists (sopTemplate SOP_SYSTEMS, the share page's REPORT_SYS) are gone
//   §3 EXECUTED against the PDF: a fixture record from the app (its report-bundle fixtures) is rendered by the bundle's
//      own report builder and by the sealed page's sections; the systems and component sub-headings print in the same
//      order, with the same findings under each
//   §4 mutations (temp copies; the real files are never written): each must fail a check above
// Hooks: FINDING_SECTIONS_MODULE, SEAL_ROUTE_SRC, SHARE_ROUTE_SRC, SHARE_PAGE_SRC, SOP_TEMPLATE_MODULE.
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.LEDRIX_APP ?? join(ROOT, '..', 'ledrix-app');
const F = {
  sections: process.env.FINDING_SECTIONS_MODULE ?? join(ROOT, 'lib/report/findingSections.ts'),
  seal: process.env.SEAL_ROUTE_SRC ?? join(ROOT, 'app/api/reports/seal/[hash]/route.ts'),
  shareRoute: process.env.SHARE_ROUTE_SRC ?? join(ROOT, 'app/api/share/[token]/route.ts'),
  sharePage: process.env.SHARE_PAGE_SRC ?? join(ROOT, 'app/share/[id]/page.tsx'),
  sop: process.env.SOP_TEMPLATE_MODULE ?? join(ROOT, 'lib/sopTemplate.ts'),
};
const MUTANT = !!process.env.FBS_MUTANT;
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; if (!MUTANT) console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const S = await import(pathToFileURL(F.sections).href);
const R = await quiet(() => import(pathToFileURL(join(ROOT, 'lib/report/render.mjs')).href));

/** The sealed page's sections, parsed: [{ system, components: [{ component|null, ids }] }]. */
function sealOrder(html) {
  const out = []; let cur = null, comp = null;
  const re = /<h2>([^<]*?) <span class="count">|<h3>([^<]*)<\/h3>|<i data-id="([^"]*)"><\/i>/g; let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) { cur = { system: unesc(m[1]), components: [] }; out.push(cur); comp = null; }
    else if (m[2] !== undefined) { comp = { component: unesc(m[2]), ids: [] }; cur.components.push(comp); }
    else { if (!comp) { comp = { component: null, ids: [] }; cur.components.push(comp); } comp.ids.push(m[3]); }
  }
  return out;
}
const sealPage = (findings, groups) => S.sealSectionsHtml(S.findingSections(findings, groups), f => `<i data-id="${esc(f.id)}"></i>`, esc);

// A seal payload's findings (snake_case, as report_seals holds them), with the kinds the change is about.
const SEALED = [
  { id: 'a1', unit: 'HVAC', severity: 'deficiency', description: 'Furnace flue is disconnected at the draft hood.' },
  { id: 'a2', unit: 'Water Heater', severity: 'maintenance', description: 'Unit is approaching the end of its typical 10–12 year service life.' },
  { id: 'a3', unit: 'Water Heater', severity: 'critical', description: 'TPR discharge line is missing.' },
  { id: 'a4', unit: 'Grading & Drainage', severity: 'deficiency', description: 'Negative grading along the rear foundation slopes soil toward the house.' },
  { id: 'a5', unit: 'Toilet — Fill Valve', severity: 'maintenance', description: 'Fill valve runs intermittently.' },
  { id: 'a6', unit: 'Toilet — Fill Valve', severity: 'deficiency', description: 'Fill valve leaks at the supply connection.' },
  { id: 'a7', unit: 'Supply Line', severity: 'critical', description: 'Active leak at the supply line under the kitchen sink.' },
  { id: 'a8', unit: '', severity: 'maintenance', description: 'Item noted.' },
  { id: 'a9', unit: 'Roofing', severity: 'deficiency', description: 'Shingles lifted at the ridge.' },
];
const RANK = { critical: 0, deficiency: 1, maintenance: 2, characteristic: 3, spec: 4 };

console.log('\n1 · the website\'s sections are the phone\'s grouping (executed)\n');
const groups = R.groupReportFindings(SEALED);
const secs = S.findingSections(SEALED, groups);
const sysOf = (id) => secs.find(s => s.components.some(c => c.findings.some(f => f.id === id)))?.systemId;
ok('1 · the bundle exports the phone\'s grouping', typeof R.groupReportFindings === 'function' && Array.isArray(groups) && groups.length > 0);
ok('1 · every finding is printed exactly once', secs.flatMap(s => s.components.flatMap(c => c.findings.map(f => f.id))).sort().join() === SEALED.map(f => f.id).sort().join());
ok('1 · the sections are the phone\'s, in its order', JSON.stringify(secs.map(s => s.systemId)) === JSON.stringify(groups.map(g => g.systemId)) && secs.every((s, i) => s.label === groups[i].label));
ok('1 · water heater findings go to Water Heater, grading to Exterior, the unknown to General (last)',
  sysOf('a2') === 'water_heater' && sysOf('a3') === 'water_heater' && sysOf('a4') === 'exterior' && sysOf('a8') === 'general' && secs[secs.length - 1].systemId === 'general');
const plumb = secs.find(s => s.systemId === 'plumbing');
ok('1 · inside Plumbing the worst component comes first (the leaking supply line)', plumb?.components[0]?.component === 'Supply Line', JSON.stringify(plumb?.components.map(c => c.component)));
const fill = plumb?.components.find(c => c.component === 'Toilet — Fill Valve');
ok('1 · inside a component the worst finding comes first', !!fill && fill.findings.map(f => f.id).join() === 'a6,a5');
ok('1 · every component and finding is worst first', secs.every(s => s.components.every((c, j) => c.findings.every((f, k) => k === 0 || RANK[f.severity] >= RANK[c.findings[k - 1].severity])
  && (j === 0 || Math.min(...c.findings.map(f => RANK[f.severity])) >= Math.min(...s.components[j - 1].findings.map(f => RANK[f.severity]))))));
const wh = secs.find(s => s.systemId === 'water_heater');
ok('1 · a component that repeats the system\'s name prints no sub-heading (the PDF\'s rule)', !!wh && wh.components.every(c => c.component === null));
ok('1 · no grouping at all still prints every finding (under General)', (() => {
  const g = S.findingSections(SEALED, null);
  return g.length === 1 && g[0].systemId === 'general' && g[0].count === SEALED.length;
})());
const parsed = sealOrder(sealPage(SEALED, groups));
ok('1 · the sealed page prints the sections, sub-headings and findings in that order',
  JSON.stringify(parsed) === JSON.stringify(secs.map(s => ({ system: s.label, components: s.components.map(c => ({ component: c.component, ids: c.findings.map(f => f.id) })) })))
  , JSON.stringify(parsed));

console.log('\n2 · the pages use it, and keep no list of their own (static)\n');
const seal = strip(readFileSync(F.seal, 'utf8'));
const shareRoute = strip(readFileSync(F.shareRoute, 'utf8'));
const page = strip(readFileSync(F.sharePage, 'utf8'));
const SOP = await import(pathToFileURL(F.sop).href);
ok('2 · the sealed page groups with the bundle\'s groupReportFindings', /\(await import\('[./]+lib\/report\/render\.mjs'\)\)\.groupReportFindings\(findings\)/.test(seal));
ok('2 · the sealed page prints sealSectionsHtml(findingSections(findings, groups), …)', /sealSectionsHtml\(findingSections\(findings, groups\), findingHtml, esc\)/.test(seal) && !/bySystem|\.map\(sys =>|<h3>/.test(seal));
ok('2 · the sealed page keeps no section list (SOP_SYSTEMS / systemForUnit gone, here and in sopTemplate)', !/SOP_SYSTEMS|systemForUnit/.test(seal) && SOP.SOP_SYSTEMS === undefined && SOP.systemForUnit === undefined);
ok('2 · /api/share sends reportGroups from the bundle\'s grouping of the published findings',
  /reportGroups = \(await import\('[./]+lib\/report\/render\.mjs'\)\)\.groupReportFindings\(anomalies/.test(shareRoute) && /\{ \.\.\.rec, anomalies, reportGroups,/.test(shareRoute));
ok('2 · the share page indexes each finding\'s system from reportGroups before showing the record', /indexSystems\(rec\);\s*setRecord\(rec\);/.test(page) && /findingSections\(Array\.isArray\(rec\.anomalies\) \? rec\.anomalies : \[\], rec\.reportGroups\)/.test(page));
ok('2 · the Report tab lays out findingSections(anomalies, record.reportGroups), component sub-headings included', /findingSections\(anomalies, record\.reportGroups\)/.test(page) && /sec\.components\.map\(\(c, k\)/.test(page) && /c\.component \?/.test(page));
ok('2 · the summary and floor-plan matching read the phone\'s system', /function reportSystem\(a: Anomaly\): string \{ return SYSTEM_OF\.get\(a\)\?\.label \?\? 'GENERAL'; \}/.test(page) && /normKey\(SYSTEM_OF\.get\(a\)\?\.id \?\? 'general'\)/.test(page));
ok('2 · the share page keeps no section list (REPORT_SYS / REPORT_SYS_ORDER / REPORT_ICON gone)', !/REPORT_SYS|REPORT_ICON/.test(page));

console.log('\n3 · the same as the PDF (executed against the phone\'s report builder)\n');
const fixtures = join(APP, 'scripts/report-bundle/fixtures.mjs');
if (!existsSync(fixtures)) {
  if (process.env.ALLOW_NO_APP) console.log('  · SKIPPED — no ledrix-app');
  else ok('3 · the ledrix-app checkout is present (LEDRIX_APP, or ALLOW_NO_APP=1)', false, APP);
} else {
  const FX = await quiet(() => import(pathToFileURL(fixtures).href));
  const rec = FX.fixture('full', (r) => {
    const base = r.inputs.findings[0];
    for (const f of SEALED) r.inputs.findings.push({ ...base, ...f, id: `fx_${f.id}`, nodeId: null, structureId: null, issueTitle: undefined, observationBullets: undefined, imageUri: null, evidence: [] });
  });
  const html = await quiet(() => R.renderSealedReportHtml({ inspectionId: FX.INSPECTION_ID, record: rec, revision: { version: 1, digest: 'd'.repeat(64) }, photoUrl: (u) => `https://x/${String(u).split('/').pop()}`, shareToken: FX.SHARE_TOKEN }));
  // The PDF's Detailed Findings: system headings that carry a finding count, and the component sub-headings beneath.
  const start = html.indexOf('id="sec-findings"');
  const rest = start < 0 ? '' : html.slice(start + 1);
  const next = rest.search(/id="sec-(?!findings)/);
  const chapter = next < 0 ? rest : rest.slice(0, next);
  const pdf = []; let cur = null; let m;
  const re = /font-size:15px;font-weight:600;letter-spacing:-0\.005em;flex:1;">([^<]*)<\/span>|font-size:9px;font-weight:600;letter-spacing:1\.8px;text-transform:uppercase;">([^<]*)<\/span>/g;
  while ((m = re.exec(chapter))) {
    if (m[1] !== undefined) { const head = chapter.slice(m.index, m.index + 1500).split('</div>')[0]; cur = /\d+ FINDINGS?<\/span>/.test(head) ? { system: unesc(m[1]), components: [] } : null; if (cur) pdf.push(cur); }
    else if (cur) cur.components.push(unesc(m[2]));
  }
  const findings = rec.inputs.findings;
  const web = sealOrder(sealPage(findings, R.groupReportFindings(findings)))
    .map(s => ({ system: s.system, components: s.components.map(c => c.component).filter(c => c !== null) }));
  ok('3 · the PDF printed its Detailed Findings', pdf.length > 3, `${pdf.length} systems`);
  ok('3 · the sealed page prints the PDF\'s systems and component sub-headings, in the PDF\'s order', JSON.stringify(web) === JSON.stringify(pdf),
    `PDF ${JSON.stringify(pdf)}\n      web ${JSON.stringify(web)}`);
}

// ── §4 mutations ─────────────────────────────────────────────────────────────────────────────────────────────────────
if (!MUTANT) {
  console.log('\n4 · mutations (temp copies)\n');
  const tmp = mkdtempSync(join(tmpdir(), 'fbs-web-'));
  const MUT = [
    ['a repeated component name gets a sub-heading', 'FINDING_SECTIONS_MODULE', F.sections, s => s.replace('component: same(c.component, g.label) ? null : c.component,', 'component: c.component,')],
    ['components print best first', 'FINDING_SECTIONS_MODULE', F.sections, s => s.replace('const components = (g.components ?? []).map(', 'const components = [...(g.components ?? [])].reverse().map(')],
    ['an ungrouped finding is dropped', 'FINDING_SECTIONS_MODULE', F.sections, s => s.replace('if (left.length) {', 'if (false) {')],
    ['the sealed page loses its component sub-headings', 'FINDING_SECTIONS_MODULE', F.sections, s => s.replace("${c.component ? `<h3>${esc(c.component)}</h3>` : ''}", '')],
    ['the sealed page groups by its own list again', 'SEAL_ROUTE_SRC', F.seal, s => s.replace("import { severityMeta, SOP_TEMPLATE_VERSION }", "import { SOP_SYSTEMS, systemForUnit, severityMeta, SOP_TEMPLATE_VERSION }")],
    ['the share API stops sending the grouping', 'SHARE_ROUTE_SRC', F.shareRoute, s => s.replace('{ ...rec, anomalies, reportGroups,', '{ ...rec, anomalies,')],
    ['the share page brings back its own list', 'SHARE_PAGE_SRC', F.sharePage, s => s.replace("function reportSystem(a: Anomaly): string { return SYSTEM_OF.get(a)?.label ?? 'GENERAL'; }", "const REPORT_SYS_ORDER = ['Roofing'];\nfunction reportSystem(a: Anomaly): string { return REPORT_SYS_ORDER[0]; }")],
    ['the share page ignores the grouping in its Report tab', 'SHARE_PAGE_SRC', F.sharePage, s => s.replace('findingSections(anomalies, record.reportGroups)', 'findingSections(anomalies, null)')],
    ['sopTemplate exports a section list again', 'SOP_TEMPLATE_MODULE', F.sop, s => s + "\nexport const SOP_SYSTEMS = [];\n"],
  ];
  try {
    for (const [name, env, file, mutate] of MUT) {
      const src = readFileSync(file, 'utf8'); const out = mutate(src);
      if (out === src) { ok(`4 · mutation applies: ${name}`, false); continue; }
      const ext = file.endsWith('.tsx') ? '.tsx' : '.ts';
      const p = join(tmp, `m${MUT.indexOf(MUT.find(x => x[0] === name))}${ext}`);
      writeFileSync(p, out);
      let caught = false;
      try { execFileSync(process.execPath, ['--no-warnings', fileURLToPath(import.meta.url)], { env: { ...process.env, [env]: p, FBS_MUTANT: '1' }, stdio: 'pipe' }); }
      catch { caught = true; }
      ok(`4 · caught: ${name}`, caught);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

console.log(`\nverify-findings-by-system-web — ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
