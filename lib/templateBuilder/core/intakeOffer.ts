// ─── intakeOffer — what a template offers when a job is added (owner 2026-11-14) ─────────────────────────────────────
//
// "This needs to be setup on intake rather than at inspection, but it should be easy to choose while adding an
// inspection" → mockup https://claude.ai/artifact/B6BhhbaEivmUiE9GtETeqi → "Approved, start building it".
//
// The template says what is possible; adding a job, the office picks from exactly that: the property type (its home
// types), what comes with a single family home (its building types), a multi unit's layout and counts, and the add-on
// services it offers. The job then STARTS with those buildings, units and add-on sections — none is added on site.
//
// Multi unit stays FLAT (owner chose "Flat, named"): one building per unit, named "Building 1 · Unit A"…; the main
// building is the first unit. PURE — read by the phone's intake, the website's intake and newInspection. Copied
// byte-for-byte to ledrixlabs-web lib/templateBuilder/core (scripts/web-preview-sync.json).
import type { InspectionTemplate } from './InspectionTemplate';
import { propertyTypesOf } from './propertyTypes';
import { addOnsOf } from './addOnServices';
import { structureTypesOf } from './structureTypes';

/** The record's home type vocabulary (homeProfile.HOME_TYPES) — kept, so every reader of `homeType` is unchanged. */
export type IntakeHomeType = 'Site-Built' | 'Manufactured' | 'Condo/Townhome' | 'Multi-Unit';
export const HOME_TYPE_LABEL: Readonly<Record<string, string>> = {
  'Site-Built': 'Single family', Manufactured: 'Manufactured', Mobile: 'Manufactured', 'Condo/Townhome': 'Condo', 'Multi-Unit': 'Multi unit',
};
const ORDER: readonly IntakeHomeType[] = ['Site-Built', 'Manufactured', 'Condo/Townhome', 'Multi-Unit'];
const FROM_PROPERTY: Readonly<Record<string, IntakeHomeType>> = {
  single_family: 'Site-Built', manufactured: 'Manufactured', condo_townhome: 'Condo/Townhome', multi_unit_one: 'Multi-Unit', multi_unit_many: 'Multi-Unit',
};

/** The home types this template is for. A template that says none (made before 2026-11-14) offers all four. */
export function intakeHomeTypes(tpl: Pick<InspectionTemplate, 'propertyTypes'> | null | undefined): IntakeHomeType[] {
  const own = new Set(propertyTypesOf(tpl).map(p => FROM_PROPERTY[p]));
  return own.size ? ORDER.filter(t => own.has(t)) : [...ORDER];
}

export type UnitLayout = 'one' | 'many';
/** The multi unit layouts this template offers; none said = both. */
export function intakeLayouts(tpl: Pick<InspectionTemplate, 'propertyTypes'> | null | undefined): UnitLayout[] {
  const p = propertyTypesOf(tpl);
  const out: UnitLayout[] = [];
  if (p.includes('multi_unit_one')) out.push('one');
  if (p.includes('multi_unit_many')) out.push('many');
  return out.length ? out : ['one', 'many'];
}

/** What can come with a single family home: the template's building types (Ledrix's when it has none) — the same list
 *  the job's own Add building sheet offers (structureTypesOf), so each id resolves after creation. */
export function intakeExtras(tpl: Pick<InspectionTemplate, 'structureTypes'> | null | undefined): Array<{ id: string; name: string }> {
  return structureTypesOf(tpl ?? null).types.map(t => ({ id: t.id, name: t.name }));
}

/** The add-on services the template offers, by name. */
export const intakeAddOns = (tpl: Pick<InspectionTemplate, 'systems'> | null | undefined): string[] => addOnsOf(tpl).map(a => a.label);

/** The most units a multi unit job is given buildings for at creation (the phone's rule since 2026-08-14). */
export const MAX_UNIT_BUILDINGS = 24;
const clampInt = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, parseInt(String(v ?? ''), 10) || lo));
const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1));

/** The names of the buildings a multi unit job gets BEYOND its main one (which is the first unit), at most 24 in all.
 *  One building: "Unit B", "Unit C"…; several: "Building 1 · Unit B" … "Building 2 · Unit A"…, or "Building 2" when each
 *  has one unit. Anything else: none. */
export function unitBuildingNames(record: Record<string, unknown>): string[] {
  if (record.homeType !== 'Multi-Unit') return [];
  const buildings = clampInt(record.buildingCount, 1, MAX_UNIT_BUILDINGS);
  const units = clampInt(record.unitCount, 1, MAX_UNIT_BUILDINGS);
  const names: string[] = [];
  for (let b = 0; b < buildings; b++) {
    for (let u = 0; u < units; u++) {
      if (b === 0 && u === 0) continue;
      names.push(buildings === 1 ? `Unit ${letter(u)}` : units === 1 ? `Building ${b + 1}` : `Building ${b + 1} · Unit ${letter(u)}`);
    }
  }
  return names.slice(0, MAX_UNIT_BUILDINGS - 1);
}

// ── ALSO ON THE PROPERTY (owner 2026-11-14: "fold them in", mockup THyGHFhzq8L6tsHGV5kw5p approved) ──────────────────
// The old intake Add-ons list is split by what each one is: a building (ADU, Detached Garage, Guest House, Well House) is
// one of the template's building types; a feature stays a feature (below); Pool/Spa is the Pool & spa add-on service.
// Everything picked is kept, by name, in the job's `addOns` field, as before — the Home Profile and the report read it.
export const PROPERTY_FEATURES: readonly string[] = ['Crawlspace', 'Solar', 'Radon Mitigation', 'Dual-Fuel Zones'];
export const NOTHING_ELSE = 'None';

/** The building types whose names are among the picks — the buildings a new job is made with. */
export function buildingsNamed(tpl: Pick<InspectionTemplate, 'structureTypes'> | null | undefined, picks: string | null | undefined): string[] {
  const names = new Set(String(picks ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  return intakeExtras(tpl).filter(b => names.has(b.name.toLowerCase())).map(b => b.id);
}

/** Tap a pick: None stands alone; any other pick clears None. Kept in the order tapped, joined with ", ". */
export function togglePropertyPick(current: string | null | undefined, name: string): string {
  const now = String(current ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (name === NOTHING_ELSE) return now.includes(NOTHING_ELSE) ? '' : NOTHING_ELSE;
  const rest = now.filter(x => x !== NOTHING_ELSE);
  return (rest.some(x => x.toLowerCase() === name.toLowerCase()) ? rest.filter(x => x.toLowerCase() !== name.toLowerCase()) : [...rest, name]).join(', ');
}
