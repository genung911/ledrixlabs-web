// GENERATED with assemble.mjs by ledrix-app scripts/export-report-bundle.mjs (ledrix-app scripts/report-bundle/assemble-entry.ts).
type Row = Record<string, any>;
export type ServerJobRows = {
  inspection: Row; anomalies: Row[]; technicalSpecs: Row[];
  values: { structure_id: string; node_key: string; kind: string; value: unknown; updated_by: string | null; updated_at: string; seq: number }[];
  template: Row | null; measurements: Row[]; photos?: Row[];
  sealer: { id: string; email?: string | null; full_name?: string | null; company_name?: string | null; license_number?: string | null };
};
/** 10c: decide the release gates on the same assembly (the phone's releaseGates; phone-only probes left out). */
export type GateOptions = { isFinalized: boolean; openConflicts: number | null; significantSeverities?: string[] };
export type ReleaseGate = { key: string; hard: boolean; title: string; detail?: string; fix?: { label: string; route: { pathname: string; params?: Record<string, string> } } };
export type AssembleArgs = { rows: ServerJobRows; timeZone: string | null; companyLogo?: string | null; systemsOverview?: string; readPhoto?: (uri: string) => Promise<string | null>; gates?: GateOptions;
  /** 10d: also compose what a seal writes (the seal payload, the Home App record); photo URLs the caller's. */
  publish?: { inspectorId: string; photoUrl: (uri: string) => string | undefined } };
export type AssembledRecord = { inputs: Record<string, unknown>; refs: Record<string, unknown>; evidence: unknown[]; digest: string; canonical: string; gates?: ReleaseGate[]; hardGate?: boolean;
  seal?: { payload: unknown; canonical: string }; homeRecord?: Record<string, unknown> | null; findingPhotos?: string[] };
export type LiveFamily = 'evidence index' | 'cover photos' | 'serial and model numbers' | 'limitations' | 'client details';
export type Assembler = {
  assembleServerRecord(a: AssembleArgs): Promise<AssembledRecord>;
  serverNow(rows: ServerJobRows): number;
  /** live: the step 3 families whose SQL is applied (#98 evidence index + cover photos, #99 serial and model, #100 limitations, #101 client details). */
  phoneOnlyParts(inputs: Record<string, unknown> | null | undefined, live?: ReadonlySet<LiveFamily>): { key: string; label: string; family: string }[];
  /** The families whose SQL is applied on the production server (serverCoverage.SERVER_LIVE_FAMILIES). */
  SERVER_LIVE_FAMILIES: readonly LiveFamily[];
};
/** A fresh assembler: fresh module state, a fresh in-memory phone. One per assembly. */
export declare function createAssembler(): Assembler;
