// ─── sealPayload — what a stored seal actually contains (report integrity, 2026-10-24) ──────────────────────
//
// The seal page read `payload.anomalies` and printed "No confirmed findings in this seal" when it was absent. Since
// ledrix-app's O-4 ruling the seal payload carries NO findings — it attests the finalized report record by its digest
// (SealService: `inspection`, `input_digest`, `evidence_count`, `template_version`; "two representations of the
// findings in one payload are two things that can disagree"). So every current seal rendered as an empty report:
// a false statement about a sealed inspection.
//
// The page now asks what the payload IS before it says anything:
//   'findings' — a seal made before O-4: it carries its confirmed findings, rendered from the payload as before;
//   'digest'   — a current seal: it attests the report record by digest; the page says exactly that, and never
//                substitutes live data for findings it does not hold;
//   'unknown'  — neither: the page says it cannot read the seal.
//
// IMPORT-FREE so scripts/verify-seal-page.mjs executes it as shipped.

export type SealPayloadKind = 'findings' | 'digest' | 'unknown';

export function sealPayloadKind(payload: unknown): SealPayloadKind {
  if (!payload || typeof payload !== 'object') return 'unknown';
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.anomalies)) return 'findings';
  if (typeof p.input_digest === 'string' && /^[a-f0-9]{64}$/i.test(p.input_digest)) return 'digest';
  return 'unknown';
}

/** What a digest-only seal attests, in the words the page prints. */
export function digestSealFacts(payload: Record<string, unknown>): { digest: string; evidenceCount: number | null; templateVersion: string | null } {
  return {
    digest: String(payload.input_digest ?? ''),
    evidenceCount: typeof payload.evidence_count === 'number' ? payload.evidence_count : null,
    templateVersion: typeof payload.template_version === 'string' ? payload.template_version : null,
  };
}
