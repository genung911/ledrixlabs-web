// ─── moveModel — "Move to…": an item or a group into another system (owner 2026-11-05) ───────────────────────────────
//
// Owner: "can we move vent fans from interior to attic … This may be something I need the builder to do anyway" →
// mockup https://claude.ai/artifact/XtoreixMRS7sZ4YyKMTUqp → "Yes on all 3. Approved".
//   1. An item moves into any group of any system (or a system with no groups), at the spot chosen; a group moves into
//      any system. It is the existing validated `moveNode` op — ONE change, one undo — and the node keeps everything it
//      carries (Tips, condition, limitation reasons, quick findings, requirements, rules).
//   2. Where it REPORTS follows it: the phone and the report's one rule (ledrix-app customSections.sectionForNode) gives
//      the template's system when the template files a node elsewhere than Ledrix did (build 717).
//   3. A group a move leaves empty stays, for the company to switch off, rename or fill.
// What cannot move, and why: a UNIT (Furnace, Water Heater, Panel… — the pack's `establishesAs` items) belongs to its
// system's equipment records; a group holding one; a count COPY (Indoor Head 1–8) moves only with its group; a LINK
// ("Also show in") is already shown elsewhere; and nothing moves out of, or into, a COPIED system ("Heating 2").
// PURE: no React, no store, no clock.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { ops } from './editorModel';

const isCopy = (systemId: string) => /~\d+$/.test(systemId);

type Where = { node: TemplateNode; parent: TemplateNode; system: TemplateNode };
export function whereIs(tree: InspectionTemplate, id: string): Where | null {
  for (const system of tree.systems ?? []) {
    let hit: Where | null = null;
    const walk = (n: TemplateNode) => { for (const c of n.children ?? []) { if (hit) return; if (c.id === id) { hit = { node: c, parent: n, system }; return; } walk(c); } };
    walk(system);
    if (hit) return hit;
  }
  return null;
}

/** Why `id` cannot move, in the owner's words, or null when it can. `isUnit`: the pack's unit-establishing items;
 *  `isCopyItem`: count copies (Indoor Head 1–8) of a typed system. */
export function moveBlock(tree: InspectionTemplate, id: string, isUnit: (id: string) => boolean, isCopyItem: (id: string) => boolean): string | null {
  const w = whereIs(tree, id);
  if (!w) return 'Not in this template.';
  const n = w.node;
  if (n.pointsTo) return 'A link is already shown in another system. Move the item it stands for instead.';
  if (isCopy(w.system.id)) return 'Items in a copied system stay with the copy.';
  const all: TemplateNode[] = []; const walk = (x: TemplateNode) => { all.push(x); (x.children ?? []).forEach(walk); }; walk(n);
  const unit = all.find(x => isUnit(x.id));
  if (unit) return unit.id === n.id ? 'Units stay in their system: they belong to its equipment records.' : `It holds ${unit.label}, a unit — units stay in their system.`;
  if (all.some(x => isCopyItem(x.id))) return n.kind === 'component' ? 'Copies made by a count move only with their group.' : null;
  return null;
}

export type MoveTarget = { system: TemplateNode; homes: TemplateNode[] };
/** Where `id` can go: every system that is not a copy, with the places inside it — its groups for an item (or the system
 *  itself when it has items but no groups, or nothing at all); the system itself for a group. */
export function moveTargets(tree: InspectionTemplate, id: string): MoveTarget[] {
  const w = whereIs(tree, id);
  if (!w) return [];
  const group = w.node.kind !== 'component';
  return (tree.systems ?? []).filter(s => !isCopy(s.id)).map(s => {
    if (group) return { system: s, homes: [s] };
    // A system with groups takes items only inside a group: an item loose beside groups has no card on the phone.
    const groups = (s.children ?? []).filter(c => c.kind === 'subsystem');
    return { system: s, homes: groups.length ? groups : [s] };
  });
}

/** The ONE op that puts `id` into `parentId` right after `afterId` (null = at the top; the end is "after the last") —
 *  the existing moveNode. Empty when that is where it already is, or `afterId` is not in that place. */
export function moveOps(tree: InspectionTemplate, id: string, parentId: string, afterId: string | null): TemplateOp[] {
  const w = whereIs(tree, id);
  if (!w) return [];
  const target = parentId === w.parent.id ? w.parent : whereIs(tree, parentId)?.node ?? (tree.systems ?? []).find(s => s.id === parentId);
  if (!target) return [];
  const list = (target.children ?? []).filter(c => c.id !== id);
  const at = afterId ? list.findIndex(c => c.id === afterId) + 1 : 0;
  if (afterId && at === 0) return [];
  const now = (w.parent.children ?? []).findIndex(c => c.id === id);
  if (target.id === w.parent.id && at === now) return [];
  return ops.move(id, parentId, at);
}
