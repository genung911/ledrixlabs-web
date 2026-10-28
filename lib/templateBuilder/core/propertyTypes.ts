// ─── propertyTypes — what kind of property a template is for (owner, 2026-10-27) ──────────────────────────────────
//
// Three questions used to be tangled together:
//   · the SERVICE (Full Home, 4-Point…)          → the company's inspection types, each pointing at one template;
//   · the PROPERTY (single-family, condo, multi-unit…) → THIS: a label on the template, picked on its Overview and when
//                                                   it is created, shown and filtered on the Templates page;
//   · the OTHER BUILDINGS on the lot (ADU, shop…) → building types (structureTypes.ts).
//
// A LABEL AND A FILTER — nothing more yet. No inspection reads it, and it changes nothing about how one runs. Inspecting
// multi-unit properties unit by unit needs a Unit level the house model does not have
// (docs/architecture/PROPOSAL_2026-10-27_units.md) — until that is ruled and built, a multi-unit template is a normal
// template with this label.
//
// PURE. Copied byte-for-byte to ledrixlabs-web lib/templateBuilder/core (scripts/web-preview-sync.json).
import type { InspectionTemplate } from './InspectionTemplate';

export type PropertyTypeId = 'single_family' | 'condo_townhome' | 'manufactured' | 'multi_unit_one' | 'multi_unit_many';

export const PROPERTY_TYPES: ReadonlyArray<{ id: PropertyTypeId; label: string; short: string; hint: string }> = [
  { id: 'single_family',   label: 'Single-family home',               short: 'Single-family',  hint: 'One home, plus any ADU, shop or garage on the lot' },
  { id: 'condo_townhome',  label: 'Condo / Townhome',                 short: 'Condo',          hint: 'One unit; the building’s shared parts usually out of scope' },
  { id: 'manufactured',    label: 'Manufactured / Mobile',            short: 'Manufactured',   hint: 'Factory-built home' },
  { id: 'multi_unit_one',  label: 'Multi-unit — one building',        short: 'Multi-unit',     hint: 'Duplex to small apartment building' },
  { id: 'multi_unit_many', label: 'Multi-unit — multiple buildings',  short: 'Multi-building', hint: 'Apartment complex' },
];
const IDS = new Set<string>(PROPERTY_TYPES.map(p => p.id));

/** The field's check (templateOps TEMPLATE_FIELDS): a list of known ids, each once. */
export function checkPropertyTypes(v: unknown): string | null {
  if (!Array.isArray(v)) return 'must be a list';
  if (v.some(x => typeof x !== 'string' || !IDS.has(x))) return `each must be one of ${[...IDS].join(', ')}`;
  return new Set(v).size === v.length ? null : 'lists a property type twice';
}

/** The template's property types, in the canonical order. Empty = not said. */
export function propertyTypesOf(tpl: Pick<InspectionTemplate, 'propertyTypes'> | null | undefined): PropertyTypeId[] {
  const own = new Set(Array.isArray(tpl?.propertyTypes) ? tpl!.propertyTypes : []);
  return PROPERTY_TYPES.map(p => p.id).filter(id => own.has(id));
}

export const propertyTypeLabel = (id: string, short = false): string => {
  const p = PROPERTY_TYPES.find(x => x.id === id);
  return p ? (short ? p.short : p.label) : id;
};
