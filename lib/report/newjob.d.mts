// GENERATED with newjob.mjs by ledrix-app scripts/export-report-bundle.mjs (ledrix-app scripts/report-bundle/newjob-entry.ts).
export type CompanyTemplateRow = { id: string; name: string; base: string | null; template: unknown; updated_at: string | null };
export type NewJobInput = {
  id: string; templateId: string; record: Record<string, unknown>; leadId?: string | null; notes?: string; noteAuthor?: string;
  extras?: Record<string, string | undefined>; today?: string;
};
export type ComposeArgs = {
  userId: string; email?: string | null; companyId: string | null; companyName?: string | null; device: string;
  template: CompanyTemplateRow | null; hiddenIds: string[];
  caps: { columns: Record<string, boolean>; valueKinds: string[]; documentKeys: string[] };
  input: NewJobInput;
};
export type NewJobRows = {
  inspection: Record<string, unknown>;
  assignment: { assigned_inspector_id: string } | null;
  template: Record<string, unknown>;
  values: { structure: string; key: string; kind: string; section: string | null; value: Record<string, unknown> | null }[];
  documents: { key: string; payload: unknown }[];
};
export type ComposedJob = { id: string; record: Record<string, unknown>; rows: NewJobRows; templateName: string | null };
export type Composer = { composeNewInspection(a: ComposeArgs): Promise<ComposedJob>; extraUnitBuildings(record: Record<string, unknown>): number; MAX_UNITS: number };
/** A fresh composer: fresh module state, a fresh in-memory phone. One per new job. */
export declare function createComposer(): Composer;
