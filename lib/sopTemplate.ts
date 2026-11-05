// ─── Generic (InterNACHI-style) SOP report template — v1 ─────────────────────
// Versioned DATA, not hardcoded JSX. What remains: the template version a sealed page prints, and the priority words.

export const SOP_TEMPLATE_VERSION = 'generic-v1';

// The section list that lived here (SOP_SYSTEMS, 9 sections, and its systemForUnit) was retired 2026-11-04: the sealed
// page groups findings with the phone's own grouping (lib/report/findingSections.ts ← the report bundle), as the PDF does.

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
