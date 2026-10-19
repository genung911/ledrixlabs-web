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
  offeringModel?: 1;
  advisories?: unknown[];
};
