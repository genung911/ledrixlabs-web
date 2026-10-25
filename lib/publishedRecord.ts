// ─── publishedRecord — what the homeowner's web record may carry, and where it comes from (2026-10-24) ────────
//
// Report-integrity remediation, Phase 0 (docs/architecture/INSPECTION_PROGRAM_FOUNDATION_AUDIT.md §5, §7).
//
// 1. AN ALLOW-LIST, NEVER A SPREAD. ShareService used to publish each confirmed finding as `{ ...a, … }`, so every
//    field the device holds — inspector notes, the raw dictation transcript, the unprinted second concern, AI
//    confidence and the AI's original wording — went into `home_records.anomalies`, and /api/share/[token] handed it
//    to anyone holding the link. Only the fields below leave the device, and the website filters through this SAME
//    module (a byte-identical copy, ledrixlabs-web lib/publishedRecord.ts) before it answers, so a row published
//    before this rule is cleaned at the server boundary too.
//    The lists are exactly what the homeowner portal renders (its own `Anomaly` / `Spec` types,
//    ledrixlabs-web app/share/[id]/page.tsx, plus `issue`, which lib/homeownerRecommendation.ts reads). Nothing the
//    homeowner sees today is removed; adding a field here is a disclosure decision, not a convenience.
// 2. THE PUBLISHED RECORD IS THE FROZEN RECORD. The published PDF and web report are rendered from the frozen record
//    (frozenReportsStore); the findings and specs beside them were the screen's LIVE state, so an edit after
//    finalizing changed the homeowner's dashboard and left the sealed report as it was. `publishedSource` decides
//    the source for every publish: the frozen record when one exists; a refusal when the inspection is finalized
//    without one; live state only for a draft that was never frozen.
//
// IMPORT-FREE, so verify:published-record executes this file as shipped, and the website runs it unchanged.

/** Finding fields a homeowner may see. Everything else on the device row stays on the device. */
export const PUBLISHED_FINDING_FIELDS = [
  'id', 'issueTitle', 'issue', 'observationBullets', 'description', 'severity', 'isSafety',
  'unit', 'component', 'location', 'room', 'structureId',
  'recommendation', 'prosToCall', 'imageUri',
] as const;

/** Spec fields a homeowner may see. Both spellings of the manual fields, as the device and the server use them. */
export const PUBLISHED_SPEC_FIELDS = [
  'category', 'material', 'status', 'system', 'room', 'structureId', 'instanceLabel', 'attributes',
  'manual_url', 'manual_verified_at', 'manual_maintenance', 'manualUrl', 'manualVerifiedAt', 'manualMaintenance',
] as const;

type Row = Record<string, unknown>;

function pick(row: unknown, fields: readonly string[]): Row | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const out: Row = {};
  for (const f of fields) {
    const v = (row as Row)[f];
    if (v !== undefined) out[f] = v;
  }
  return out;
}

/** One finding as the homeowner record may carry it. */
export function toPublishedFinding(row: unknown): Row | null { return pick(row, PUBLISHED_FINDING_FIELDS); }

/** One spec as the homeowner record may carry it. */
export function toPublishedSpec(row: unknown): Row | null { return pick(row, PUBLISHED_SPEC_FIELDS); }

/** A whole published list, filtered — what the server answers with whatever is stored. */
export function publishedFindings(rows: unknown): Row[] {
  return Array.isArray(rows) ? rows.map(toPublishedFinding).filter((r): r is Row => !!r) : [];
}
export function publishedSpecs(rows: unknown): Row[] {
  return Array.isArray(rows) ? rows.map(toPublishedSpec).filter((r): r is Row => !!r) : [];
}

/** Header fields a frozen record may supply in place of the screen's (the sealed report's own header). */
export const PUBLISHED_HEADER_FIELDS = [
  'address', 'city', 'state', 'zip', 'yearBuilt', 'sqft', 'beds', 'baths', 'garage', 'date', 'inspectionType',
] as const;

export type PublishedSource =
  | { ok: true; from: 'frozen' | 'live'; findings: unknown[]; specs: unknown[]; header: Row }
  | { ok: false; reason: 'finalized_without_record' };

/** Where a publish takes its findings, specs and header from.
 *  · a frozen record exists      → its findings, its spec inventory, its inspection header — what the published
 *                                  PDF and web report were rendered from;
 *  · finalized, no frozen record → refused: there is nothing authoritative to publish, and live state is not it;
 *  · otherwise (a draft)         → the screen's live state, as before. */
export function publishedSource(x: {
  frozenInputs: Row | null | undefined;
  finalized: boolean;
  live: { findings: unknown[]; specs: unknown[]; header: Row };
}): PublishedSource {
  const fz = x.frozenInputs;
  if (fz && Array.isArray(fz.findings)) {
    const insp = (fz.inspection && typeof fz.inspection === 'object') ? fz.inspection as Row : {};
    const header: Row = { ...x.live.header };
    for (const f of PUBLISHED_HEADER_FIELDS) if (insp[f] !== undefined && insp[f] !== null) header[f] = insp[f];
    return {
      ok: true, from: 'frozen',
      findings: fz.findings as unknown[],
      specs: Array.isArray(fz.specInventory) ? fz.specInventory as unknown[] : [],
      header,
    };
  }
  if (x.finalized) return { ok: false, reason: 'finalized_without_record' };
  return { ok: true, from: 'live', findings: x.live.findings, specs: x.live.specs, header: x.live.header };
}
