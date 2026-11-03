// GENERATED with render.mjs by ledrix-app scripts/export-report-bundle.mjs — the server entry's exports
// (ledrix-app scripts/report-bundle/entry.ts).
export type SealedRecord = { inputs: Record<string, unknown>; refs?: Record<string, unknown>; evidence?: unknown[] };
export declare const BUNDLED_PACK_VERSION: string;
export declare const PHOTO_BUCKET: string;
export type PackDecision = { kind: 'bundled' } | { kind: 'load'; version: string } | { kind: 'unrecorded' };
export declare function packDecision(record: SealedRecord): PackDecision;
export declare class PackMismatchError extends Error { readonly needed: string; readonly given: string | null; }
export type ServerPhoto = { kind: 'stored'; bucket: string; path: string } | { kind: 'url'; url: string } | { kind: 'phone-only'; uri: string };
export declare function serverPhotoFor(uri: string, inspectionId: string): ServerPhoto;
export type RecordPart = { coverage: 'server' | 'derived' | 'phone'; family?: string; label: string; source: string };
export declare const RECORD_PARTS: Readonly<Record<string, RecordPart>>;
export declare const PHONE_ONLY_FAMILIES: string[];
export declare function phoneOnlyParts(inputs: Record<string, unknown> | null | undefined): { key: string; label: string; family: string }[];
export declare function renderSealedReportHtml(a: {
  inspectionId: string; record: SealedRecord; revision: { version: number; digest: string } | null; shareToken?: string;
  photoUrl: (uri: string) => string | null | Promise<string | null>; pack?: Record<string, unknown>;
}): Promise<string>;
