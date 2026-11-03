// GENERATED with assemble.mjs by ledrix-app scripts/export-report-bundle.mjs (ledrix-app scripts/report-bundle/assemble-entry.ts).
type Row = Record<string, any>;
export type ServerJobRows = {
  inspection: Row; anomalies: Row[]; technicalSpecs: Row[];
  values: { structure_id: string; node_key: string; kind: string; value: unknown; updated_by: string | null; updated_at: string; seq: number }[];
  template: Row | null; measurements: Row[]; photos?: Row[];
  sealer: { id: string; email?: string | null; full_name?: string | null; company_name?: string | null; license_number?: string | null };
};
export type AssembleArgs = { rows: ServerJobRows; timeZone: string | null; companyLogo?: string | null; systemsOverview?: string; readPhoto?: (uri: string) => Promise<string | null> };
export type AssembledRecord = { inputs: Record<string, unknown>; refs: Record<string, unknown>; evidence: unknown[]; digest: string; canonical: string };
export type Assembler = {
  assembleServerRecord(a: AssembleArgs): Promise<AssembledRecord>;
  serverNow(rows: ServerJobRows): number;
  phoneOnlyParts(inputs: Record<string, unknown> | null | undefined): { key: string; label: string; family: string }[];
};
/** A fresh assembler: fresh module state, a fresh in-memory phone. One per assembly. */
export declare function createAssembler(): Assembler;
