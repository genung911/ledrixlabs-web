// Create a template — every answer builds it (owner 2026-11-14, mockup B6BhhbaEivmUiE9GtETeqi → "Approved, start building
// it"). PURE: what the template is for → which Ledrix build; the home types → the property types; the standards grouped
// and pre-ticked from where and what the company belongs to; the add-ons → their sections; and the "Ledrix built" list
// on the last screen. The page (app/app/templates/create/page.tsx) only draws these.
//
// Ledrix always builds it (owner: "can we skip this and just make it Ledrix builds"): there is no Start from screen.
// Copying a company's own template stays Duplicate on the Templates list; importing from another tool is a later job.
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { PropertyTypeId } from '@/lib/templateBuilder/core/propertyTypes';
import { ADD_ON_SERVICES, addAddOnOps, addOnSystemId } from '@/lib/templateBuilder/core/addOnServices';
import { applyOps, type TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import type { StartKind, StartingPoint } from './startingPoints';

// ── WHAT IT'S FOR ──────────────────────────────────────────────────────────────────────────────────────────────────
export type Purpose = 'home' | 'new_construction' | 'four_point' | 'commercial' | 'other';
export const PURPOSES: ReadonlyArray<{ id: Purpose; label: string; sub: string; soon?: true }> = [
  { id: 'home', label: 'Home inspection', sub: 'Every system, top to bottom' },
  { id: 'new_construction', label: 'New construction', sub: 'Final walk or 11-month warranty' },
  { id: 'four_point', label: '4-Point', sub: 'Roof, electrical, plumbing, heating & cooling' },
  // Owner 2026-11-14: "we probably need commercial as well" → after launch (launch checklist): no Ledrix base yet.
  { id: 'commercial', label: 'Commercial', sub: 'Offices, retail, warehouses, larger apartments', soon: true },
  { id: 'other', label: 'Something else', sub: 'Start blank and build it yourself' },
];
/** The Ledrix build each purpose starts from. Commercial has none yet, so it cannot be picked. */
export const START_FOR: Readonly<Record<Purpose, StartKind | null>> = {
  home: 'ledrix_default', new_construction: 'ledrix_new_construction', four_point: 'ledrix_fourpoint', commercial: null, other: 'blank',
};
/** The starting point Ledrix builds from — never a company template (that is Duplicate on the Templates list). */
export function buildFor(purpose: Purpose, points: readonly StartingPoint[]): StartingPoint | null {
  const kind = START_FOR[purpose];
  return kind ? points.find(p => p.kind === kind) ?? null : null;
}
/** Home types are asked for a home inspection and for new construction; 4-Point and blank skip them. */
export const asksHomeTypes = (p: Purpose): boolean => p === 'home' || p === 'new_construction';
/** The company's profile still learns what it inspects — the purpose is added to its services, never a second question. */
export const withService = (services: readonly string[], p: Purpose): string[] => (services.includes(p) ? [...services] : [...services, p]);

// ── HOME TYPES ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type HomeType = 'single_family' | 'manufactured' | 'condo_townhome' | 'multi';
export const HOME_TYPES: ReadonlyArray<{ id: HomeType; label: string }> = [
  { id: 'single_family', label: 'Single family home' }, { id: 'manufactured', label: 'Manufactured' },
  { id: 'condo_townhome', label: 'Condo' }, { id: 'multi', label: 'Multi unit' },
];
export type MultiLayout = 'multi_unit_one' | 'multi_unit_many';
/** Flat, named (owner 2026-11-14): one building per unit. Several buildings take units in each from 1 up, which covers
 *  "several buildings, one unit each". */
export const MULTI_LAYOUTS: ReadonlyArray<{ id: MultiLayout; label: string }> = [
  { id: 'multi_unit_one', label: 'One building, several units' },
  { id: 'multi_unit_many', label: 'Several buildings (one or more units in each)' },
];
/** The template's property types, in the canonical order. */
export function propertyTypesFor(types: readonly HomeType[], layouts: readonly MultiLayout[]): PropertyTypeId[] {
  const order: PropertyTypeId[] = ['single_family', 'condo_townhome', 'manufactured', 'multi_unit_one', 'multi_unit_many'];
  const on = new Set<string>(types.filter(t => t !== 'multi'));
  if (types.includes('multi')) layouts.forEach(l => on.add(l));
  return order.filter(id => on.has(id));
}

// ── STANDARDS, IN THREE GROUPS ─────────────────────────────────────────────────────────────────────────────────────
export const STANDARD_GROUPS: ReadonlyArray<{ id: 'state' | 'association' | 'company'; label: string; ids: readonly string[] }> = [
  { id: 'state', label: 'State', ids: ['state_sop'] },
  { id: 'association', label: 'Association', ids: ['internachi_sop', 'ashi_sop'] },
  { id: 'company', label: 'Your company', ids: ['company'] },
];
/** "Idaho's", "Idaho's and Utah's", or "Your state's" before any state is picked. */
export function stateStandardLabel(stateNames: readonly string[]): string {
  if (!stateNames.length) return 'Your state’s';
  const p = stateNames.map(s => `${s}’s`);
  return p.length === 1 ? p[0] : `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`;
}
/** Pre-ticked from the earlier answers, the first time the screen is reached (nothing ticked yet): the state's when a
 *  state was picked, and each association the company belongs to. Each says why. */
export function suggestedStandards(c: { jurisdictions: readonly string[]; affiliations: readonly string[] }): Array<{ id: string; why: string }> {
  const out: Array<{ id: string; why: string }> = [];
  if (c.jurisdictions.length) out.push({ id: 'state_sop', why: 'you inspect there' });
  if (c.affiliations.includes('internachi')) out.push({ id: 'internachi_sop', why: 'you’re a member' });
  if (c.affiliations.includes('ashi')) out.push({ id: 'ashi_sop', why: 'you’re a member' });
  return out;
}

// ── ADD-ON SERVICES ────────────────────────────────────────────────────────────────────────────────────────────────
/** The add-on sections: Ledrix's chosen ones (addOnServices.ts) and the company's own, each named, with one item to
 *  start from that the company fine-tunes. Applied as ops so the draft is checked like any edit. */
export function withAddOns(tree: InspectionTemplate, ledrix: readonly string[], own: readonly string[]): { ok: true; tree: InspectionTemplate } | { ok: false; error: string } {
  const ops: TemplateOp[] = [...addAddOnOps(tree, ledrix)];
  const taken = new Set([...tree.systems, ...(tree.trimmedSystems ?? [])].map(s => s.id).concat(ops.map(o => (o as { node: { id: string } }).node.id)));
  for (const name of own) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'service';
    let id = addOnSystemId(`own_${slug}`); for (let i = 2; taken.has(id); i++) id = addOnSystemId(`own_${slug}_${i}`);
    taken.add(id);
    ops.push({ op: 'addNode', parentId: null, node: { id, label: name.trim().toUpperCase(), kind: 'system', icon: 'clipboard-check-outline',
      defaultActive: false, addOn: true, children: [{ id: `${id}_result`, label: `${name.trim()} result`, kind: 'component', condition: true }] } as never });
  }
  if (!ops.length) return { ok: true, tree };
  const r = applyOps(tree, ops);
  return r.ok ? { ok: true, tree: r.tpl } : { ok: false, error: r.error?.message ?? 'The add-on services could not be added.' };
}
export const LEDRIX_ADD_ONS = ADD_ON_SERVICES.map(s => ({ id: s.id, label: s.label }));

// ── THE LAST SCREEN: WHAT EACH ANSWER DID ──────────────────────────────────────────────────────────────────────────
export function builtLines(a: {
  purpose: Purpose; systems: number; homeTypes: readonly HomeType[]; checkpoints: number; buildings: readonly string[];
  addOns: readonly string[]; states: readonly string[]; standards: readonly string[];
}): Array<{ text: string; soon?: true }> {
  const out: Array<{ text: string; soon?: true }> = [];
  out.push({ text: `${PURPOSES.find(p => p.id === a.purpose)?.label ?? 'Template'} · ${a.systems} system${a.systems === 1 ? '' : 's'}` });
  if (asksHomeTypes(a.purpose) && a.homeTypes.length) out.push({ text: a.homeTypes.map(t => HOME_TYPES.find(h => h.id === t)?.label).join(' · ') });
  if (a.checkpoints) out.push({ text: `+ ${a.checkpoints} checkpoint${a.checkpoints === 1 ? '' : 's'} for the kinds of home` });
  if (a.buildings.length) out.push({ text: `${a.buildings.join(', ')} · offered at intake` });
  if (a.addOns.length) out.push({ text: `${a.addOns.join(', ')} · add-ons offered at intake` });
  if (a.states.length || a.standards.length) out.push({ text: `${[...a.states, ...a.standards].join(', ')} · checks coming soon`, soon: true });
  return out;
}
/** "Home inspection · Idaho". */
export function defaultName(purpose: Purpose, firstState: string | null): string {
  const base = purpose === 'other' ? 'New template' : PURPOSES.find(p => p.id === purpose)?.label ?? 'New template';
  return firstState ? `${base} · ${firstState}` : base;
}
