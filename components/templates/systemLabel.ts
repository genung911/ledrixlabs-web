// ─── systemLabel — a template label as Scope shows it ──────────────────────────────────────────
//
// Template labels are often authored in capitals ("ATTIC / INSULATION"). Scope shows them in title
// case — display only, the label itself is untouched. Known abbreviations keep their capitals, so
// HVAC never becomes Hvac. One helper, read by the Coverage tiles, a system's item list and the
// guided step heading, so the three always name a system the same way. (Moved here from
// CoverageGrid, 2026-10-24, when the system page started using it too.)
const KEEP_CAPS = new Set(['HVAC', 'AC', 'ADU', 'GFCI', 'AFCI', 'WH', 'RV']);
export const displayLabel = (label: string): string =>
  label !== label.toUpperCase() ? label
    : label.split(' ').map(w => KEEP_CAPS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
