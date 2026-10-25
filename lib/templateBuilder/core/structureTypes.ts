// ─── structureTypes — the kinds of building a company inspects, and the systems each one starts with ──────────────
//
// Owner, 2026-10-24 (Structure Types mockup approved): a company's template says which of ITS OWN systems belong to
// each kind of building — "our Detached Shop has Roofing, Electrical and Foundation". When an inspector adds a
// building, Ledrix starts it from the inspection's copy of that configuration, not from a Ledrix constant.
//
//   company template  `structureTypes`  — authored in the desktop Template Builder (setTemplateField), validated by
//                                          templateValidate, published by the existing RPC;
//   inspection snapshot `structureTypes` — captured ONCE at creation (inspectionTemplateStore) and immutable after;
//   a building                          — keeps a COPY of its type's systems (StructureService modules). Editing or
//                                          publishing the type later never changes a building already added.
//
// SYSTEMS ARE REFERENCES, NEVER COPIES: `systems` holds ids of the template's own top-level systems. A Shop's
// Electrical IS the template's Electrical — its items, assessment and spec fields are defined once.
// Main Structure is not a type: it keeps the template's offering (`inScope`).
//
// LEGACY: a template (or an inspection created before this) with no `structureTypes` uses LEDRIX_DEFAULT_STRUCTURE_TYPES
// — exactly the presets and per-kind systems the app hard-coded until now (StructureService derives from this list).
//
// PURE. Type-only imports. Copied byte-for-byte to ledrixlabs-web lib/templateBuilder/core (scripts/web-preview-sync.json).
import type { InspectionTemplate } from './InspectionTemplate';

export type StructureTypeKind = 'adu' | 'shop' | 'guest_house' | 'outbuilding' | 'garage' | 'other';
export const STRUCTURE_TYPE_KINDS: readonly StructureTypeKind[] = ['adu', 'shop', 'guest_house', 'outbuilding', 'garage', 'other'];

export type StructureTypeDef = {
  id: string;               // stable, minted once (st_<…>); never reused
  name: string;             // what the inspector picks in Add building ("Detached Shop")
  icon: string;             // one of STRUCTURE_TYPE_ICONS (MaterialCommunityIcons names, drawn on the web too)
  systems: string[];        // ids of this template's own TOP-LEVEL systems, in the order they were chosen
  kind?: StructureTypeKind; // the app's building kind (reports, Ledrix Home); absent = 'other'
};

/** The icons a building type may use. A fixed set: the phone draws MaterialCommunityIcons by name, the web its own
 *  drawing of each, so an icon outside the set would be a blank on one of them. */
export const STRUCTURE_TYPE_ICONS: readonly string[] = [
  'warehouse', 'garage-variant', 'home-group', 'home-variant-outline', 'barn', 'pool', 'office-building', 'home-city-outline', 'home-outline',
];

// ── LEDRIX'S DEFAULTS — what every template without its own list uses ────────────────────────────────────────────
// Verbatim from StructureService as it stood on 2026-10-24 (STRUCTURE_PRESETS + DEFAULT_MODULES_BY_KIND): a livable
// unit gets the main house's core systems plus Kitchen / Laundry / Bathroom; a utility building a lean structural
// set; an Outbuilding starts empty. `RESIDENTIAL` is canonicalSystems.DEFAULT_ACTIVE_SYSTEMS + the three rooms —
// verify:structure-types holds the two equal. Ids a template does not have are inert (Scope lists template systems).
const RESIDENTIAL = ['safety', 'roofing', 'attic', 'exterior', 'interior', 'foundation', 'electrical', 'plumbing', 'water_heater', 'heating', 'cooling', 'kitchen', 'laundry', 'primary_bathroom'];
const UTILITY = ['roofing', 'exterior', 'electrical', 'foundation'];
export const LEDRIX_DEFAULT_STRUCTURE_TYPES: readonly StructureTypeDef[] = [
  { id: 'ledrix_shop',        name: 'Detached Shop',   kind: 'shop',        icon: 'warehouse',            systems: UTILITY },
  { id: 'ledrix_adu',         name: 'ADU',             kind: 'adu',         icon: 'home-group',           systems: RESIDENTIAL },
  { id: 'ledrix_guest_house', name: 'Guest House',     kind: 'guest_house', icon: 'home-variant-outline', systems: RESIDENTIAL },
  { id: 'ledrix_garage',      name: 'Detached Garage', kind: 'garage',      icon: 'garage-variant',       systems: UTILITY },
  { id: 'ledrix_outbuilding', name: 'Outbuilding',     kind: 'outbuilding', icon: 'home-outline',         systems: [] },
];

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Does this template carry its own building types? (An empty list counts: a company may offer only custom names.) */
export const hasOwnStructureTypes = (tpl: Pick<InspectionTemplate, 'structureTypes'> | null | undefined): boolean =>
  Array.isArray(tpl?.structureTypes);

/** The building types a template offers, and where they came from. Never throws; a malformed entry is skipped. */
export function structureTypesOf(tpl: Pick<InspectionTemplate, 'structureTypes'> | null | undefined): { types: StructureTypeDef[]; source: 'template' | 'ledrix-default' } {
  if (!hasOwnStructureTypes(tpl)) return { types: clone(LEDRIX_DEFAULT_STRUCTURE_TYPES as StructureTypeDef[]), source: 'ledrix-default' };
  const types = (tpl!.structureTypes as unknown[]).filter((t): t is StructureTypeDef =>
    !!t && typeof t === 'object' && typeof (t as StructureTypeDef).id === 'string' && typeof (t as StructureTypeDef).name === 'string'
    && !!(t as StructureTypeDef).name.trim() && Array.isArray((t as StructureTypeDef).systems));
  return { types: clone(types), source: 'template' };
}

/** The systems a NEW building of this type starts with — a copy, de-duplicated, in the type's order. Unknown ids are
 *  kept (inert, as Ledrix's defaults always were); the building owns the list from here on. */
export const initialBuildingSystems = (t: Pick<StructureTypeDef, 'systems'>): string[] =>
  [...new Set((t.systems ?? []).filter(s => typeof s === 'string' && s))];

/** A company's starting list when it chooses to customize: Ledrix's defaults, limited to systems this template has. */
export function seedStructureTypes(tpl: InspectionTemplate): StructureTypeDef[] {
  const ids = new Set(tpl.systems.map(s => s.id));
  return (clone(LEDRIX_DEFAULT_STRUCTURE_TYPES as StructureTypeDef[])).map(t => ({ ...t, id: t.id.replace(/^ledrix_/, 'st_'), systems: t.systems.filter(s => ids.has(s)) }));
}

/** A fresh type id that is not in `taken`. */
export function newStructureTypeId(taken: Iterable<string>, now: number): string {
  const used = new Set(taken);
  let id = `st_${now.toString(36)}`;
  for (let i = 2; used.has(id); i++) id = `st_${now.toString(36)}_${i}`;
  return id;
}

/** INSPECTION SNAPSHOTS ONLY: one building added during the inspection, as the synced snapshot carries it so it
 *  survives a sync or a device change (owner, 2026-10-24, option 1). The device's own building list stays the reader;
 *  this is its synced record (services/buildings.ts is the one writer). Main Structure is never listed. */
export type SnapshotBuilding = {
  id: string; name: string; kind: string; icon: string; createdAt: string;
  typeId: string | null;    // the snapshot building type it was added from; null = a custom name or an older add
  systems: string[];        // the building's own system list (its copy — never re-derived from the type)
};

export type StructureTypeIssue ={ code: string; severity: 'error' | 'warning'; message: string; structureTypeId?: string };

/** Judge a template's building types. Empty for a template without its own list (Ledrix's defaults are not judged
 *  against a company's systems — they never were). Called by templateValidate.validateTemplate, so a building-type
 *  edit is held to it on every op and at publish. */
export function validateStructureTypes(tpl: InspectionTemplate): StructureTypeIssue[] {
  const raw = (tpl as { structureTypes?: unknown }).structureTypes;
  if (raw === undefined) return [];
  const out: StructureTypeIssue[] = [];
  const add = (severity: 'error' | 'warning', code: string, message: string, structureTypeId?: string) =>
    out.push({ code, severity, message, ...(structureTypeId ? { structureTypeId } : {}) });
  if (!Array.isArray(raw)) { add('error', 'structure_types_shape', 'Building types must be a list.'); return out; }
  const active = new Map(tpl.systems.map(s => [s.id, s]));
  const setAside = new Map((tpl.trimmedSystems ?? []).map(s => [s.id, s]));
  const ids = new Set<string>();
  const names = new Map<string, string>();
  raw.forEach((t: any, i) => {
    if (!t || typeof t !== 'object') { add('error', 'structure_type_shape', `Building type ${i + 1} is not readable.`); return; }
    const id = typeof t.id === 'string' ? t.id.trim() : '';
    const name = typeof t.name === 'string' ? t.name.trim() : '';
    const say = name || `Building type ${i + 1}`;
    if (!id) add('error', 'structure_type_id', `“${say}” has no id.`);
    else if (ids.has(id)) add('error', 'structure_type_duplicate_id', `Two building types share the id “${id}”.`, id);
    ids.add(id);
    if (!name) add('error', 'structure_type_name', `Building type ${i + 1} has no name.`, id || undefined);
    else {
      const k = name.toLowerCase();
      if (names.has(k)) add('error', 'structure_type_duplicate_name', `Two building types are called “${name}”. An inspector could not tell them apart.`, id || undefined);
      names.set(k, id);
      if (k === 'main structure' || k === 'main house') add('error', 'structure_type_reserved_name', `“${name}” is the main building’s name — every inspection already has it.`, id || undefined);
    }
    if (typeof t.icon !== 'string' || !STRUCTURE_TYPE_ICONS.includes(t.icon)) add('error', 'structure_type_icon', `“${say}” needs one of the building icons.`, id || undefined);
    if (t.kind !== undefined && !STRUCTURE_TYPE_KINDS.includes(t.kind)) add('error', 'structure_type_kind', `“${say}” has an unknown building kind “${String(t.kind)}”.`, id || undefined);
    if (!Array.isArray(t.systems) || t.systems.some((s: unknown) => typeof s !== 'string')) { add('error', 'structure_type_systems_shape', `“${say}”: its systems must be a list of system ids.`, id || undefined); return; }
    const sys: string[] = t.systems;
    const dup = sys.find((s, j) => sys.indexOf(s) !== j);
    if (dup) add('error', 'structure_type_duplicate_system', `“${say}” lists “${active.get(dup)?.label ?? dup}” twice.`, id || undefined);
    for (const s of sys) {
      if (active.has(s)) continue;
      if (setAside.has(s)) add('warning', 'structure_type_system_set_aside', `“${say}” includes “${setAside.get(s)!.label}”, which is set aside — new buildings will not show it.`, id || undefined);
      else add('error', 'structure_type_unknown_system', `“${say}” includes a system that is not in this template (“${s}”).`, id || undefined);
    }
    if (!sys.length) add('warning', 'structure_type_empty', `“${say}” starts with no systems — the inspector adds them on site.`, id || undefined);
  });
  return out;
}
