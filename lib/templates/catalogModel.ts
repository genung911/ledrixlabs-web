// Desktop Template Builder — the equipment component catalog, as template operations (owner rulings 2026-10-26).
//
// The company picks an equipment type for a system (Heating: gas furnace, heat pump…), ticks the components its
// inspectors check, and sets Condition and Details for each. Every pick becomes ordinary template operations
// (addNode / an attribute inline), applied in ONE change set through applyManual — validated, all-or-nothing and
// undoable like any other edit. The catalog itself is Ledrix's (lib/templateBuilder/core/equipmentCatalog.ts, a
// byte copy of the app's); the template only ever holds what the company chose.
//
//   · Nothing is added until the company picks it; a component the template already has (same catalog entry, or an
//     item with the same name) is shown as already there and cannot be added twice.
//   · Where it lands (EditorParts homesFor rule): a system with groups — or an empty one — gets one group named for
//     the equipment type; a system with items but no groups gets the items directly (adding a group there would hide
//     every existing item from inspectors).
//   · When it applies: each component carries the equipment type's rule ("Heating System is Gas Furnace or
//     Propane") when the template has that field and offers those answers; otherwise none, so it is always shown.
//   · Evidence (readings, data plates) is not addable yet: the phone cannot collect it (DECISIONS 2026-10-26
//     (third)); those components are listed and marked as coming next.
// PURE: no store, no network, no clock.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { allIds } from '@/lib/templateBuilder/core/templateValidate';
import {
  catalogLabelMatches, catalogRefOf, catalogType, catalogTypesFor, detailsLabelOf,
  type CatalogComponent, type CatalogEquipmentType,
} from '@/lib/templateBuilder/core/equipmentCatalog';

/** The catalog system id a template system answers to ('heating', or a numbered copy like 'heating~2'). */
export const catalogSystemOf = (system: TemplateNode): string => system.id.replace(/~\d+$/, '');
export const catalogTypesForSystem = (system: TemplateNode): CatalogEquipmentType[] => catalogTypesFor(catalogSystemOf(system));

export type Pick = { id: string; condition: boolean; details: boolean };
export type CatalogRow = {
  component: CatalogComponent;
  /** Already in the template — the item's label, so the panel can say where. */
  present: string | null;
  /** Readings and data plates need Evidence, which the phone cannot collect yet. */
  evidenceOnly: boolean;
};

const components = (n: TemplateNode): TemplateNode[] => {
  const out: TemplateNode[] = [];
  const walk = (x: TemplateNode) => (x.children ?? []).forEach(c => { if (c.kind === 'component') out.push(c); walk(c); });
  walk(n);
  return out;
};

/** The catalog for one equipment type, row by row, with what the template already has. */
export function catalogRows(system: TemplateNode, typeId: string): Array<{ label: string; why: string; rows: CatalogRow[] }> {
  const type = catalogType(typeId);
  if (!type) return [];
  const have = components(system);
  return type.groups.map(g => ({
    label: g.label, why: g.why,
    rows: g.components.map(c => {
      const ref = catalogRefOf(type.id, c.id);
      const hit = have.find(n => n.catalogRef === ref) ?? have.find(n => !n.catalogRef && catalogLabelMatches(c, n.label));
      return { component: c, present: hit ? hit.label : null, evidenceOnly: c.kind !== 'part' };
    }),
  }));
}

/** A pick that would record nothing on the phone (Condition off and no Details) is not addable. */
export const pickRecordsSomething = (c: CatalogComponent, p: Pick): boolean => p.condition || (p.details && !!c.details?.length);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'item';
function minter(tree: InspectionTemplate, systemId: string) {
  const used = new Set(allIds(tree));
  return (label: string): string => {
    const base = `${systemId}__${slug(label)}`;
    let id = base;
    for (let i = 2; used.has(id); i++) id = `${base}_${i}`;
    used.add(id);
    return id;
  };
}

/** The template's options for a rule field `<nodeId>::<attrId>`, or null when the template does not have it. */
function fieldOptions(tree: InspectionTemplate, field: string): string[] | null {
  const m = /^([^:]+)::([^:]+)$/.exec(field);
  if (!m) return null;
  let found: string[] | null = null;
  const walk = (n: TemplateNode) => {
    if (found) return;
    if (n.id === m[1]) { const a = (n.attributes ?? []).find(x => x.id === m[2]); if (a) found = [...a.values]; }
    (n.children ?? []).forEach(walk);
  };
  tree.systems.forEach(walk);
  return found;
}

/** The equipment type's rule as this template can carry it: only answers the template offers; null if none. */
export function ruleFor(tree: InspectionTemplate, type: CatalogEquipmentType): { field: string; anyOf: string[] } | null {
  if (!type.equipmentRule) return null;
  const opts = fieldOptions(tree, type.equipmentRule.field);
  if (!opts) return null;
  const anyOf = type.equipmentRule.anyOf.filter(v => opts.includes(v));
  return anyOf.length ? { field: type.equipmentRule.field, anyOf } : null;
}

/** Where picks land: the equipment type's group (made if missing) when the system has groups or no items yet;
 *  the system itself when it has items but no groups. */
function placement(system: TemplateNode, type: CatalogEquipmentType): { existingGroup: TemplateNode | null; useGroup: boolean } {
  const kids = system.children ?? [];
  const hasGroups = kids.some(c => c.kind === 'subsystem');
  const existingGroup = kids.find(c => c.kind === 'subsystem' && c.catalogRef === type.id) ?? null;
  return { existingGroup, useGroup: hasGroups || kids.length === 0 };
}

/** The operations that add the company's picks. Components already present, evidence-only components and picks
 *  that would record nothing are skipped (the panel never offers them). */
export function catalogOps(tree: InspectionTemplate, system: TemplateNode, typeId: string, picks: Pick[]): TemplateOp[] {
  const type = catalogType(typeId);
  if (!type) return [];
  const rows = catalogRows(system, typeId).flatMap(g => g.rows);
  const chosen = picks
    .map(p => ({ p, row: rows.find(r => r.component.id === p.id) }))
    .filter((x): x is { p: Pick; row: CatalogRow } => !!x.row && !x.row.present && !x.row.evidenceOnly && pickRecordsSomething(x.row.component, x.p));
  if (!chosen.length) return [];
  const mint = minter(tree, system.id);
  const rule = ruleFor(tree, type);
  const out: TemplateOp[] = [];
  const { existingGroup, useGroup } = placement(system, type);
  let parentId = system.id;
  if (useGroup) {
    if (existingGroup) parentId = existingGroup.id;
    else {
      parentId = mint(type.label);
      out.push({ op: 'addNode', parentId: system.id, node: { id: parentId, label: type.label, kind: 'subsystem', catalogRef: type.id, children: [] } });
    }
  }
  for (const { p, row } of chosen) {
    const c = row.component;
    const node: TemplateNode = {
      id: mint(c.label), label: c.label, kind: 'component',
      condition: p.condition,                          // explicit both ways — a missing value means ON in the app
      catalogRef: catalogRefOf(type.id, c.id),
      ...(p.details && c.details?.length ? { attributes: [{ id: 'details', label: detailsLabelOf(c), values: [...c.details], multi: false }] } : {}),
      ...(rule ? { appliesWhen: rule } as unknown as Partial<TemplateNode> : {}),
    };
    out.push({ op: 'addNode', parentId, node });
  }
  return out;
}

/** The defaults a pick starts with (DECISIONS 2026-10-26 (third) #3): a part → Condition on, Details off. */
export const defaultPick = (c: CatalogComponent): Pick => ({ id: c.id, condition: c.kind === 'part', details: false });
