// ─── addOnServices — services a job can book on top of the inspection (owner 2026-11-14) ─────────────────────────
//
// "we need an ancillary services like mold, sewer scan, pest, radon….. as well somewhere" → mockup
// https://claude.ai/artifact/B6BhhbaEivmUiE9GtETeqi → "Approved, start building it"; the owner chose "Sections gated by
// booking" over a list only.
//
// AN ADD-ON IS A SECTION OF THE TEMPLATE: a top-level system carrying `addOn: true` and `defaultActive: false`, so a new
// job starts without it. Booking it at intake switches it into THAT job's scope — the snapshot's `inScope`, the one
// authority Scope, coverage and the report already follow (inspectionOffering.ts). Its name is kept in the job's
// existing `addOnServices` field, which the job card, Job info and the server already carry. Not in the core pack: a
// company has only the add-ons it offers, added by the create flow (or the Template Builder) from the definitions below,
// and fine-tunes them like any system.
//
// Add-ons are what the company is BOOKED to do. Recommendations (reportAdvisories) are what the report tells the buyer
// to get — the two stay separate.
//
// PURE. Copied byte-for-byte to ledrixlabs-web lib/templateBuilder/core (scripts/web-preview-sync.json).
import type { InspectionTemplate, TemplateNode } from './InspectionTemplate';
import type { TemplateOp } from './templateOps';

export type AddOnItem = { id: string; label: string; reading?: boolean };
export type AddOnService = { id: string; label: string; icon: string; items: readonly AddOnItem[] };

/** Ledrix's starting checklists — short on purpose; the company fine-tunes them. `reading` = the answer is typed (a result, a distance). */
export const ADD_ON_SERVICES: readonly AddOnService[] = [
  { id: 'radon', label: 'Radon', icon: 'radioactive', items: [
    { id: 'device', label: 'Test device placed' },
    { id: 'conditions', label: 'Closed-house conditions' },
    { id: 'duration', label: 'Test start, stop and duration', reading: true },
    { id: 'result', label: 'Radon result (pCi/L)', reading: true },
    { id: 'mitigation', label: 'Mitigation system' },
  ] },
  { id: 'sewer_scope', label: 'Sewer scope', icon: 'pipe', items: [
    { id: 'access', label: 'Access point (cleanout)' },
    { id: 'material', label: 'Sewer line material' },
    { id: 'line', label: 'Line condition (offsets, roots, bellies, cracks)' },
    { id: 'distance', label: 'Distance scoped', reading: true },
    { id: 'video', label: 'Video recording' },
  ] },
  { id: 'mold', label: 'Mold', icon: 'mushroom-outline', items: [
    { id: 'visible', label: 'Visible growth' },
    { id: 'moisture', label: 'Moisture readings', reading: true },
    { id: 'samples', label: 'Samples taken (air or surface)' },
    { id: 'lab', label: 'Lab results' },
  ] },
  { id: 'pest', label: 'Pest / WDO', icon: 'bug-outline', items: [
    { id: 'evidence', label: 'Evidence of wood-destroying insects' },
    { id: 'damage', label: 'Damage observed' },
    { id: 'conducive', label: 'Conducive conditions' },
    { id: 'treatment', label: 'Evidence of prior treatment' },
  ] },
  { id: 'thermal', label: 'Thermal imaging', icon: 'thermometer', items: [
    { id: 'envelope', label: 'Building envelope' },
    { id: 'electrical', label: 'Electrical panel scan' },
    { id: 'moisture', label: 'Plumbing and moisture anomalies' },
    { id: 'hvac', label: 'Heating and cooling distribution' },
  ] },
  { id: 'water_quality', label: 'Water quality', icon: 'water-check', items: [
    { id: 'sample', label: 'Sample collected (source and location)' },
    { id: 'tests', label: 'Tests ordered' },
    { id: 'lab', label: 'Lab results' },
  ] },
  { id: 'pool_spa', label: 'Pool & spa', icon: 'pool', items: [
    { id: 'structure', label: 'Pool surface and structure' },
    { id: 'equipment', label: 'Pump, filter and heater' },
    { id: 'electrical', label: 'Bonding and GFCI protection' },
    { id: 'barriers', label: 'Barriers, gates and alarms' },
    { id: 'spa', label: 'Spa' },
  ] },
  { id: 'septic', label: 'Septic', icon: 'toilet', items: [
    { id: 'access', label: 'Tank access and lids' },
    { id: 'tank', label: 'Tank level and condition' },
    { id: 'field', label: 'Distribution and drain field' },
    { id: 'pump', label: 'Pump and alarm' },
  ] },
];

export const addOnSystemId = (serviceId: string): string => `addon_${serviceId}`;

/** The template section for one of Ledrix's add-ons: starts off for every new job, switched on by booking. */
export function addOnSystemNode(s: AddOnService): TemplateNode {
  const sys = addOnSystemId(s.id);
  return {
    id: sys, label: s.label.toUpperCase(), kind: 'system', icon: s.icon, locationAxis: 'none',
    defaultActive: false, addOn: true,
    children: s.items.map(i => ({
      id: `${sys}_${i.id}`, label: i.label, kind: 'component' as const, condition: true,
      // A reading is a typed answer (the attribute shape every template field uses; `freeFormValue` is pack-only).
      ...(i.reading ? { attributes: [{ id: 'value', label: i.label, values: [], freeText: true, optional: true }] } : {}),
    })),
  } as TemplateNode;
}

/** A template's add-ons (switched-on sections only), in its own order: what intake offers. */
export function addOnsOf(tpl: Pick<InspectionTemplate, 'systems'> | null | undefined): Array<{ id: string; label: string; icon?: string }> {
  return (tpl?.systems ?? []).filter(s => (s as TemplateNode & { addOn?: boolean }).addOn === true)
    .map(s => ({ id: s.id, label: addOnName(s.label), icon: s.icon }));
}

/** "POOL & SPA" → "Pool & spa": the name intake shows and `addOnServices` keeps. A Ledrix add-on uses its own wording;
 *  a company's own reads as sentence case. */
export function addOnName(label: string): string {
  const own = ADD_ON_SERVICES.find(s => s.label.toUpperCase() === label.trim().toUpperCase());
  if (own) return own.label;
  const t = label.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The ops that add the chosen Ledrix add-ons a template does not already hold, at the end of its systems. */
export function addAddOnOps(tpl: Pick<InspectionTemplate, 'systems' | 'trimmedSystems'>, serviceIds: readonly string[]): TemplateOp[] {
  const have = new Set([...(tpl.systems ?? []), ...(tpl.trimmedSystems ?? [])].map(s => s.id));
  return ADD_ON_SERVICES.filter(s => serviceIds.includes(s.id) && !have.has(addOnSystemId(s.id)))
    .map(s => ({ op: 'addNode', parentId: null, node: addOnSystemNode(s) }) as TemplateOp);
}

const norm = (x: string) => x.trim().toLowerCase();
/** Split the job's `addOnServices` text ("Radon, Sewer scope") into names. */
export const bookedNames = (text: string | null | undefined): string[] =>
  String(text ?? '').split(',').map(x => x.trim()).filter(Boolean);

/** Which of a job's add-on sections its booking switches on: every add-on section, true when its name is booked. A
 *  name that matches no section is free text (an outside specialist's service) and changes nothing. */
export function addOnScope(tpl: Pick<InspectionTemplate, 'systems'> | null | undefined, booked: string | null | undefined): Record<string, boolean> {
  const names = new Set(bookedNames(booked).map(norm));
  return Object.fromEntries(addOnsOf(tpl).map(a => [a.id, names.has(norm(a.label)) || names.has(norm(a.id))]));
}
