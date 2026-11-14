// Guided template setup (owner 2026-11-14, mockup CRnpRrr8VpZL4s9rzkj3ms → "Approved, start building it"): the Template
// Builder walked like the inspection — a system, then one question per page, Next. Pure: the steps a system asks, the one
// plain sentence an item's rule reads as, and the template edits each answer makes. Every edit is an existing builder
// operation (includeOps, the materials list's own add / on / off, ops.setRequirements), so nothing new is stored and
// "All settings" shows exactly what the walk did.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import type { RuleDefinitions } from '@/lib/templateBuilder/core/templateRules';
import { materialLayoutOf, addMaterialOps, removeMaterialOps, switchMaterialOnOps, type MaterialQuestion } from './materialLayout';
import { indexTree, predsOf } from './typeLayout';
import { includeOps, isIncluded, ops, locateOff } from './editorModel';
import { requirementsOf, writeSatisfy, type RequirementDef } from './requirementModel';
import { displayLabel } from '@/components/templates/systemLabel';

export type GuidedStep =
  | { kind: 'materials'; key: string; node: TemplateNode; group: string; q: MaterialQuestion }
  | { kind: 'materialPhoto'; key: string; node: TemplateNode; group: string; q: MaterialQuestion }
  | { kind: 'item'; key: string; node: TemplateNode; group: string };

/** Every item of a system in the order the inspector walks it, switched-off ones in their place (after their group's
 *  live items), with the group each sits in. Links (an item shown here from another system) are never asked twice. */
function walkItems(system: TemplateNode): Array<{ node: TemplateNode; group: string }> {
  const out: Array<{ node: TemplateNode; group: string }> = [];
  const walk = (n: TemplateNode, group: string) => {
    const kids = [...(n.children ?? []), ...((n as TemplateNode & { trimmed?: TemplateNode[] }).trimmed ?? [])];
    for (const c of kids) {
      if (c.pointsTo) continue;
      if (c.kind === 'subsystem') { walk(c, displayLabel(c.label)); continue; }
      if (c.kind === 'component') out.push({ node: c, group });
      if ((c.children ?? []).length) walk(c, group);
    }
  };
  walk(system, displayLabel(system.label));
  return out;
}

/** The questions a system asks, in the walk's order: a materials item asks which materials and which need a photo; a
 *  material's own condition card is answered there, never asked on its own; any other item asks whether to inspect it. */
export function guidedStepsOf(tree: InspectionTemplate, system: TemplateNode, defs: RuleDefinitions): GuidedStep[] {
  const qs = materialLayoutOf(tree, system, defs).flatMap(g => g.questions);
  const cards = new Set(qs.flatMap(q => [...q.cards.map(c => c.id), ...q.off.map(o => o.card.id)]));
  const out: GuidedStep[] = [];
  for (const { node, group } of walkItems(system)) {
    if (cards.has(node.id)) continue;
    const q = qs.find(x => x.node.id === node.id);
    if (q) {
      out.push({ kind: 'materials', key: `${node.id}|materials`, node, group, q });
      out.push({ kind: 'materialPhoto', key: `${node.id}|photo`, node, group, q });
    } else out.push({ kind: 'item', key: node.id, node, group });
  }
  return out;
}

// ── WHEN IT APPEARS — one plain sentence (owner 2026-11-14: "we have so many labels on where something is and where it
// comes from, the screens are text heavy") ──────────────────────────────────────────────────────────────────────────
const HOUSE: Record<string, string> = { 'house::gas': 'the house has', 'house::water': 'the water is', 'house::sewer': 'the sewer is', 'house::garage': 'the garage is' };
const orList = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

/** "Appears when the house has Natural gas." — or null for an item every inspection shows. */
export function whenSentence(tree: InspectionTemplate, defs: RuleDefinitions, node: TemplateNode): string | null {
  const { byId } = indexTree(tree);
  const parts: string[] = [];
  for (const { key, p } of predsOf(defs, node.id, byId)) {
    const inc = ((p as { includes?: unknown }).includes);
    const vals = (Array.isArray(inc) ? inc : typeof inc === 'string' ? [inc] : []).map(String).filter(v => v.trim());
    if (!vals.length) continue;
    const who = HOUSE[key] ?? `${displayLabel(byId.get(key.split('::')[0])?.label ?? 'an answer')} is`;
    parts.push(`${who} ${orList(vals)}`);
  }
  const own = (node as TemplateNode & { appliesWhen?: { field?: string; anyOf?: unknown } }).appliesWhen;
  if (own && typeof own.field === 'string' && Array.isArray(own.anyOf) && own.anyOf.length) {
    const label = displayLabel(byId.get(own.field.split('::')[0])?.label ?? 'an answer');
    parts.push(`${label} is ${orList(own.anyOf.map(String))}`);
  } else if (own && !parts.length) parts.push('its rule holds');
  return parts.length ? `Appears when ${[...new Set(parts)].join(' and ')}.` : null;
}

// ── A REQUIRED PHOTO — a company requirement satisfied by one photo of the item (the Requirements editor's own shape) ──
const isPhotoReq = (d: RequirementDef) => d.origin === 'company'
  && (d.satisfy?.all ?? []).length === 1 && d.satisfy!.all[0].any.length === 1
  && d.satisfy!.all[0].any[0].kind === 'evidence' && (d.satisfy!.all[0].any[0] as { media?: string }).media === 'photo';
export const requiresPhoto = (n: TemplateNode | null | undefined): boolean => !!n && requirementsOf(n).some(isPhotoReq);

function usedReqIds(tree: InspectionTemplate): Set<string> {
  const ids = new Set<string>();
  const walk = (n: TemplateNode) => { requirementsOf(n).forEach(d => ids.add(d.id)); (n.children ?? []).forEach(walk); ((n as TemplateNode & { trimmed?: TemplateNode[] }).trimmed ?? []).forEach(walk); };
  tree.systems.forEach(walk); (tree.trimmedSystems ?? []).forEach(walk);
  return ids;
}
/** Require (or stop requiring) one photo of `node`. Other requirements on the item are kept as they are. */
export function photoOps(tree: InspectionTemplate, node: TemplateNode, on: boolean): TemplateOp[] {
  const cur = requirementsOf(node);
  if (on === cur.some(isPhotoReq)) return [];
  if (!on) return ops.setRequirements(node.id, cur.filter(d => !isPhotoReq(d)));
  const used = usedReqIds(tree);
  const base = `rq_photo_${node.id.replace(/[^a-z0-9]+/gi, '_').slice(0, 24)}`;
  let id = base; for (let i = 2; used.has(id); i++) id = `${base}_${i}`;
  const def: RequirementDef = {
    id, origin: 'company', label: `Photo of ${displayLabel(node.label).toLowerCase()}`, purposes: ['inspection_documentation'], level: 'required',
    subject: { nodeId: node.id }, satisfy: writeSatisfy('any', [{ kind: 'evidence', media: 'photo' }]),
    unmet: { limitation: 'resolves', exception: 'not_allowed' },
  } as RequirementDef;
  return ops.setRequirements(node.id, [...cur, def]);
}

// ── AN ORDINARY ITEM: Yes · Yes, and require a photo · No, leave it out ─────────────────────────────────────────────
export type ItemAnswer = 'yes' | 'photo' | 'no';
export const itemAnswerOf = (tree: InspectionTemplate, node: TemplateNode): ItemAnswer =>
  !isIncluded(tree, node.id) ? 'no' : requiresPhoto(node) ? 'photo' : 'yes';
export function itemAnswerOps(tree: InspectionTemplate, node: TemplateNode, a: ItemAnswer): TemplateOp[] {
  if (a === 'no') return includeOps(tree, node.id, false);
  const on = includeOps(tree, node.id, true);
  return [...on, ...photoOps(tree, node, a === 'photo')];
}

// ── A MATERIALS ITEM: which materials (on / off / add), and which need a photo ────────────────────────────────────────
/** The materials the page shows: every material offered, then those switched off, each with whether it is on. */
export function materialChoices(q: MaterialQuestion): Array<{ value: string; on: boolean; card: TemplateNode | null }> {
  return [...q.rows.map(r => ({ value: r.value, on: true, card: r.card })), ...q.off.map(o => ({ value: o.value, on: false, card: o.card }))];
}
export function toggleMaterialOps(q: MaterialQuestion, value: string, on: boolean): TemplateOp[] {
  if (on) { const off = q.off.find(o => o.value === value); return off ? switchMaterialOnOps(q, off) : []; }
  return removeMaterialOps(q, value);
}
export { addMaterialOps };

/** The photo question's answer: none, every time (on the item), or only for some materials (on those materials' cards). */
export type MaterialPhoto = { mode: 'no' | 'every' | 'some'; values: string[] };
export function materialPhotoOf(q: MaterialQuestion): MaterialPhoto {
  if (requiresPhoto(q.node)) return { mode: 'every', values: [] };
  const values = q.rows.filter(r => requiresPhoto(r.card)).map(r => r.value);
  return values.length ? { mode: 'some', values } : { mode: 'no', values: [] };
}
export function materialPhotoOps(tree: InspectionTemplate, q: MaterialQuestion, want: MaterialPhoto): TemplateOp[] {
  const out: TemplateOp[] = [...photoOps(tree, q.node, want.mode === 'every')];
  for (const r of q.rows) if (r.card) out.push(...photoOps(tree, r.card, want.mode === 'some' && want.values.includes(r.value)));
  return out;
}

/** Is this step's item switched off (it still has its place in the walk)? */
export const isOff = (tree: InspectionTemplate, node: TemplateNode): boolean => !!locateOff(tree, node.id);
