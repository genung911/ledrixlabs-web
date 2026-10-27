// ─── InspectionTemplate — TYPES ONLY, for the vendored Template Builder core ──────────────────────────────
//
// The other files in this folder are byte-identical copies of ledrix-app src/core/templates/{templateOps,
// templateValidate, templateChangeSets, templateDraft, templateAuthoring, templateOpSummary}.ts — the pure
// Template Builder core (no React Native, no store, no clock). They import only TYPES from ./InspectionTemplate.
//
// The app's InspectionTemplate.ts also carries the taxonomy runtime (packs, resolvers, equipment rules), which
// the browser must not load. This file re-declares just the template SHAPE. scripts/verify-template-builder.mjs
// checks the copies byte for byte and checks that TemplateNode / InspectionTemplate here name exactly the fields
// the app's types name, so the two cannot drift apart silently.
//
// Types referenced from elsewhere in the app are reduced to what the core reads.

export type NodeKind = 'system' | 'subsystem' | 'component';

export type WalkZone = 'roof' | 'exterior' | 'garage' | 'attic' | 'crawlspace' | 'basement' | 'mechanical' | 'interior';

export type NodeFacet = 'spec' | 'condition' | 'both';

export type ComponentAttribute = {
  id: string;
  label: string;
  values: string[];
  multi?: boolean;
  legacyBareKey?: boolean;
};

export type EquipmentType = { id: string; label: string; matchKeywords: string[] };

export type EvidenceRequirement = {
  id: string;
  label: string;
  kind: 'photo' | 'video';
  hint?: string;
  keywords?: string[];
  exampleUri?: string;
  jurisdictionFlag?: string;
};

export type TemplateNode = {
  id: string;
  label: string;
  description?: string;
  kind: NodeKind;
  sectionType?: 'room' | 'system' | 'structure';
  icon?: string;
  defaultActive?: boolean;
  inScope?: boolean;
  locationAxis?: 'room' | 'elevation' | 'none';
  walkZones?: WalkZone[];
  instanceOf?: string;
  evidenceRequirements?: EvidenceRequirement[];
  equipmentTypes?: EquipmentType[];
  appliesToTypes?: string[];
  keywords?: string[];
  trimmedOptions?: string[];
  options?: string[];
  facet?: NodeFacet;
  limitationOptions?: string[];
  attributes?: ComponentAttribute[];
  condition?: boolean;
  limitations?: string[];
  method?: string[];
  freeFormValue?: boolean;
  pointsTo?: { systemId: string; nodeId: string };
  /** Company requirements on this item (app Phase A, 2026-10-25, requirementsContract.ts). Not read at runtime yet. */
  requirements?: import('./requirementsContract').RequirementDef[];
  /** Equipment component catalog entry this item or group was picked from (app equipmentCatalog.ts). Provenance only. */
  catalogRef?: string;
  children?: TemplateNode[];
  trimmed?: TemplateNode[];
};

export type InspectionTemplate = {
  id: string;
  name: string;
  version: number;
  systems: TemplateNode[];
  trimmedSystems?: TemplateNode[];
  retained?: Array<{ node: TemplateNode; parentId: string | null; at?: number }>;
  unitDefinitions?: Record<string, { node: TemplateNode; parentId: string | null }>;
  /** Inspection snapshots only (app 2026-10-21): the frozen applicability rules. Never on a company template. */
  ruleDefinitions?: import('./templateRules').RuleDefinitions;
  offeringModel?: 1;
  advisories?: unknown[];
  /** Company building types (app 2026-10-24, templates/structureTypes.ts). On a snapshot: captured at creation. */
  structureTypes?: import('./structureTypes').StructureTypeDef[];
  /** Inspection snapshots only (app 2026-10-24): the buildings added during the inspection. Never on a company template. */
  buildings?: import('./structureTypes').SnapshotBuilding[];
  /** The pinned Ledrix default requirement set (app Phase A); absent = 'ledrix-r0'. */
  requirementDefaults?: string;
  /** Company overrides of the pinned set's requirements (app Phase A). */
  requirementOverrides?: Record<string, import('./requirementsContract').RequirementOverride>;
};
