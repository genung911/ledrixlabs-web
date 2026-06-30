// ─── Generic (InterNACHI-style) SOP report template — v1 ─────────────────────
// Versioned DATA, not hardcoded JSX, so per-state templates can be added later
// without touching the renderer. An anomaly's `unit` maps to a system section;
// anything unrecognized falls into GENERAL.

export const SOP_TEMPLATE_VERSION = 'generic-v1';

export type SopSystem = { key: string; label: string; match: string[] };

// Report order = inspection walk order (roof-down, then mechanicals, then interior).
export const SOP_SYSTEMS: SopSystem[] = [
  { key: 'ROOFING',    label: 'Roofing',                  match: ['ROOF'] },
  { key: 'EXTERIOR',   label: 'Exterior',                 match: ['EXTERIOR', 'SIDING', 'GRADING', 'DRAINAGE'] },
  { key: 'STRUCTURE',  label: 'Structure & Foundation',   match: ['FOUNDATION', 'STRUCTUR', 'CRAWLSPACE', 'BASEMENT'] },
  { key: 'ELECTRICAL', label: 'Electrical',               match: ['ELECTRIC'] },
  { key: 'PLUMBING',   label: 'Plumbing',                 match: ['PLUMB'] },
  { key: 'HVAC',       label: 'Heating & Cooling (HVAC)', match: ['HVAC', 'HEAT', 'COOL', 'FURNACE'] },
  { key: 'INTERIOR',   label: 'Interior',                 match: ['INTERIOR'] },
  { key: 'GARAGE',     label: 'Garage',                   match: ['GARAGE'] },
  { key: 'GENERAL',    label: 'General / Other',          match: ['GENERAL'] },
];

export function systemForUnit(unit?: string | null): string {
  const u = (unit ?? '').toUpperCase();
  for (const s of SOP_SYSTEMS) if (s.match.some(m => u.includes(m))) return s.key;
  return 'GENERAL';
}

// Unified priority taxonomy (mirrors the app's SeverityConfig + the Home App scale).
// Safety is a separate flag (is_safety), not a tier — critical is Major Repair here.
// Light/print colors (deeper shades) since this renders the published report HTML.
export const SEVERITY_META: Record<string, { label: string; color: string; rank: number }> = {
  critical:       { label: 'Major Repair',    color: '#EA580C', rank: 0 },
  deficiency:     { label: 'Minor Repair',    color: '#CA8A04', rank: 1 },
  maintenance:    { label: 'Maint & Improve', color: '#475569', rank: 2 },
  characteristic: { label: 'Typical Wear',    color: '#0284C7', rank: 3 },
  spec:           { label: 'Good',            color: '#16A34A', rank: 4 },
};

export function severityMeta(sev?: string) {
  return SEVERITY_META[(sev ?? 'deficiency').toLowerCase()] ?? SEVERITY_META.deficiency;
}
