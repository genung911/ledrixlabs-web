// How the website lays out findings: the phone's PDF grouping, nothing of its own (ledrix-app DECISIONS 2026-11-04 —
// "Use recommendation to switch to phones system list" / "Keep like PDF so website and PDF match").
//
// The grouping is computed by the phone's own code — `groupReportFindings` in the report bundle (./render.mjs, built
// from ledrix-app src/core/report/findingGroups.ts, the function generateInspectionPDF's Detailed Findings calls). It
// returns systems in the phone's order, components worst first, findings worst first, each finding as an index. This
// file only turns those indexes back into the page's own finding objects, and applies the PDF's one display rule: a
// component sub-heading that just repeats the system's name is not printed.
//
// Import-free, so scripts/verify-findings-by-system-web.mjs runs it as shipped. The website keeps no section list:
// the seal page's 9 sections (lib/sopTemplate.ts SOP_SYSTEMS) and the share page's 13 (REPORT_SYS) were retired.

export type ReportGroup = {
  systemId: string; label: string; glyph: string; count: number;
  components: { component: string; findings: number[] }[];
};
export type FindingSection<T> = {
  systemId: string; label: string; glyph: string; count: number;
  /** `component` is null where the PDF prints no sub-heading (it would repeat the system's name). */
  components: { component: string | null; findings: T[] }[];
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The phone's groups, with the page's findings in place of the indexes. A finding the groups do not place (a
 *  malformed or missing grouping) is never dropped: it goes to GENERAL at the end, as the phone files an unknown. */
export function findingSections<T>(findings: readonly T[], groups: readonly ReportGroup[] | null | undefined): FindingSection<T>[] {
  const placed = new Set<number>();
  const out: FindingSection<T>[] = [];
  for (const g of groups ?? []) {
    const components = (g.components ?? []).map(c => ({
      component: same(c.component, g.label) ? null : c.component,
      findings: (c.findings ?? []).filter(i => Number.isInteger(i) && i >= 0 && i < findings.length && !placed.has(i))
        .map(i => { placed.add(i); return findings[i]; }),
    })).filter(c => c.findings.length);
    const count = components.reduce((n, c) => n + c.findings.length, 0);
    if (count) out.push({ systemId: g.systemId, label: g.label, glyph: g.glyph, count, components });
  }
  const left = findings.filter((_, i) => !placed.has(i));
  if (left.length) {
    const general = out.find(s => s.systemId === 'general');
    if (general) { general.components.push({ component: null, findings: left }); general.count += left.length; }
    else out.push({ systemId: 'general', label: 'GENERAL', glyph: '◆', count: left.length, components: [{ component: null, findings: left }] });
  }
  return out;
}

/** The sealed page's findings body: a section per system (its name and count), a sub-heading per component where the
 *  PDF prints one, then each finding as `findingHtml` renders it. `esc` escapes text for HTML. */
export function sealSectionsHtml<T>(sections: readonly FindingSection<T>[], findingHtml: (f: T) => string, esc: (s: unknown) => string): string {
  return sections.map(sec => `
  <section>
    <h2>${esc(sec.label)} <span class="count">${sec.count} finding${sec.count !== 1 ? 's' : ''}</span></h2>
    ${sec.components.map(c => `${c.component ? `<h3>${esc(c.component)}</h3>` : ''}${c.findings.map(findingHtml).join('')}`).join('')}
  </section>`).join('');
}
