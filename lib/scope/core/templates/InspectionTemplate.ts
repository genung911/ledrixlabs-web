// The website's stand-in for ledrix-app src/core/templates/InspectionTemplate.ts — TYPES ONLY, and NOT one of the copied
// files (scripts/web-preview-sync.json). The copied rules (../taxonomy/*.ts) import `TemplateNode` from here as a type;
// the app's real module drags in the taxonomy service, storage and the device, so the website does not copy it. The node
// is the inspection snapshot's JSON (inspection_templates.snapshot.systems), read as it is: the copied rules decide
// what each field means.
export type TemplateNode = {
  id: string;
  label: string;
  kind?: 'system' | 'subsystem' | 'component' | string;
  children?: TemplateNode[];
  options?: string[];               // the legacy option list (conditionMatch derives axes from it)
  // The snapshot carries many more fields (facet, attributes, limitations, method, condition, pointsTo, sectionType,
  // inScope, …); the copied rules read them by name.
  [field: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
