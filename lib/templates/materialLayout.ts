// ─── materialLayout — a system laid out materials first (owner 2026-11-05) ─────────────────────────────────────────────
//
// Owner: "Plumbing … should have a standardized layout like Heating type systems do … Materials first, then condition of
// material" → mockup https://claude.ai/artifact/VPAuQHWYGoQghmimznXpgf → "Approved use recommendations".
//
// A system the type chips don't lay out (typeLayout returns null — Plumbing, Exterior, Interior, Attic…) is shown group
// by group in two steps:
//   1. MATERIALS — a materials question (Supply Material) whose every answer brings at most ONE condition card (Copper →
//      Copper Supply Piping): one row per answer with the card it brings, plus the card a typed answer brings ("Other").
//      A group with no such question lists its items that record a choice (Flooring Material, Insulation) here instead.
//   2. CHECKED IN EVERY HOME — everything else in the group.
// Which card each answer brings is the phone's own resolver over the effective rules (typeLayout.showsFor), never a
// guess from names. "+ Add material" adds the answer and its card (shown only for that answer) as one change set;
// switching a material Off takes its answer out and switches its card off; it stays listed as Off, and switching it on
// brings both back (owner 2026-11-06). PURE: no React, no store, no clock.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import type { RuleDefinitions } from '@/lib/templateBuilder/core/templateRules';
import { flatItems, newNodeId, ops } from './editorModel';
import { indexTree, predsOf, showsFor } from './typeLayout';

type Attr = NonNullable<TemplateNode['attributes']>[number];
export type MaterialRow = { value: string; card: TemplateNode | null };
/** A material switched OFF (owner 2026-11-06, mockup LZNLt31XvGjAnMrhhmWL2t): its answer is out of the question and its
 *  card is in the Off list — found from that card, which still says which answer brings it. */
export type OffMaterial = { value: string; card: TemplateNode };
export type MaterialQuestion = { node: TemplateNode; attr: Attr; field: string; rows: MaterialRow[]; typed: TemplateNode | null; cards: TemplateNode[]; off: OffMaterial[] };
export type MaterialGroup = { node: TemplateNode; questions: MaterialQuestion[]; materials: TemplateNode[]; every: TemplateNode[] };

const TYPED_PROBE = '\u0000typed answer';

export function materialLayoutOf(tree: InspectionTemplate, system: TemplateNode, defs: RuleDefinitions): MaterialGroup[] {
  const { byId } = indexTree(tree);
  const rows = flatItems(system);
  const items = rows.map(r => r.node).filter(n => n.kind === 'component');
  const preds = new Map(items.map(n => [n.id, predsOf(defs, n.id, byId)]));
  const parentOf = new Map(rows.map(r => [r.node.id, r.parentId]));
  // The group an item belongs to: its nearest subsystem, or the system itself.
  const groupOf = (id: string): string => { let p = parentOf.get(id); while (p && p !== system.id && byId.get(p)?.kind !== 'subsystem') p = parentOf.get(p); return p ?? system.id; };

  // Every materials question in the system: an in-system field whose answers each bring at most one item, at least two in all.
  const questions: MaterialQuestion[] = [];
  for (const n of items) for (const a of n.attributes ?? []) {
    if (a.values.length < 2 || a.id === 'count' || a.values.every(v => /^\d+$/.test(v))) continue;
    const field = `${n.id}::${a.id}`;
    const dependents = items.filter(x => x.id !== n.id && (preds.get(x.id) ?? []).some(p => p.key === field));
    if (dependents.length < 2) continue;
    const brings = (v: string) => dependents.filter(x => showsFor(preds.get(x.id) ?? [], x.id, field, v));
    const per = a.values.map(v => ({ value: v, cards: brings(v) }));
    if (per.some(r => r.cards.length > 1)) continue;   // an answer bringing several items is a TYPE (chips), not a material
    const typedCards = brings(TYPED_PROBE).filter(x => !per.some(r => r.cards.includes(x)));
    const cards = [...new Set([...per.flatMap(r => r.cards), ...typedCards])];
    if (cards.length < 2) continue;
    questions.push({ node: n, attr: a, field, rows: per.map(r => ({ value: r.value, card: r.cards[0] ?? null })), typed: typedCards[0] ?? null, cards, off: [] });
  }

  // Switched-off materials: a card in the system's Off list whose rule brings it for exactly one answer that is no longer
  // in the question — and for none that is (so a card switched off on its own, with its answer still listed, is not one).
  const offCards: TemplateNode[] = [];
  const pockets = (n: TemplateNode) => { for (const t of n.trimmed ?? []) { const w = (x: TemplateNode) => { if (x.kind === 'component') offCards.push(x); (x.children ?? []).forEach(w); }; w(t); } (n.children ?? []).forEach(pockets); };
  pockets(system);
  for (const q of questions) {
    const has = (v: string) => q.attr.values.some(x => x.toLowerCase() === v.toLowerCase());
    for (const c of offCards) {
      if (q.off.some(o => o.card.id === c.id)) continue;
      const p = predsOf(defs, c.id, byId).filter(x => x.key === q.field);
      const own = (c as TemplateNode & { appliesWhen?: { field?: string; anyOf?: unknown } }).appliesWhen;
      const named = [
        ...p.flatMap(x => { const i = (x.p as { includes?: unknown }).includes; return Array.isArray(i) ? i : typeof i === 'string' ? [i] : []; }),
        ...(own?.field === q.field && Array.isArray(own.anyOf) ? own.anyOf : []),
      ].map(String).filter(v => v.trim() && !has(v));
      const brings = (v: string) => p.length ? showsFor(p, c.id, q.field, v) : (own?.field === q.field && Array.isArray(own.anyOf) && own.anyOf.map(String).includes(v));
      const values = [...new Set(named)].filter(v => brings(v));
      if (values.length === 1 && !q.attr.values.some(v => brings(v)) && !brings(TYPED_PROBE)) q.off.push({ value: values[0], card: c });
    }
  }

  const groupIds = [system.id, ...rows.filter(r => r.node.kind === 'subsystem').map(r => r.node.id)];
  const out: MaterialGroup[] = [];
  for (const gid of groupIds) {
    const node = gid === system.id ? system : byId.get(gid)!;
    const own = items.filter(n => groupOf(n.id) === gid);
    const qs = questions.filter(q => groupOf(q.node.id) === gid);
    const taken = new Set([...qs.map(q => q.node.id), ...qs.flatMap(q => q.cards.map(c => c.id))]);
    const rest = own.filter(n => !taken.has(n.id) && !questions.some(q => q.cards.includes(n)));
    // No materials question here: the items that record a choice (a material or a type) come first.
    const materials = qs.length ? [] : rest.filter(n => (n.attributes ?? []).length > 0);
    const every = rest.filter(n => !materials.includes(n));
    if (qs.length || materials.length || every.length) out.push({ node, questions: qs, materials, every });
  }
  return out;
}

/** The words every card of a question ends with ("Supply Piping"), to name a new material's card ("Brass Supply Piping").
 *  Empty when the cards share no ending — the card is then named for the material alone. */
export function cardStem(q: MaterialQuestion): string {
  const words = q.cards.map(c => c.label.trim().split(/\s+/));
  if (!words.length) return '';
  const out: string[] = [];
  for (let k = 1; words.every(w => w.length > k); k++) {   // never the whole label: a material word stays in front
    const w = words[0][words[0].length - k];
    if (!words.every(x => x[x.length - k].toLowerCase() === w.toLowerCase())) break;
    out.unshift(w);
  }
  return out.join(' ');
}

/** "+ Add material": the answer joins the question and its condition card joins the group, shown only for that answer —
 *  ONE change set, which also keeps the "Other" card to typed answers. Nothing for a blank or existing answer. */
export function addMaterialOps(tree: InspectionTemplate, system: TemplateNode, q: MaterialQuestion, value: string): TemplateOp[] {
  const v = value.trim();
  if (!v || q.attr.values.some(x => x.toLowerCase() === v.toLowerCase())) return [];
  // A material that is Off comes back on — never a second card for the same material.
  const was = q.off.find(o => o.value.toLowerCase() === v.toLowerCase());
  if (was) return switchMaterialOnOps(q, was);
  const stem = cardStem(q);
  const label = stem ? `${v} ${stem}` : v;
  const parentId = flatItems(system).find(r => r.node.id === q.node.id)?.parentId ?? system.id;
  // Ledrix's "Other …" card shows for any answer not on LEDRIX's list, so a company material (Brass) would bring it too.
  // Narrow it to answers not on THIS template's list — the grammar's typed clause compiles against the template's own
  // options — once, AND-ed with any rule the card already has.
  const typedLeaf = { field: q.field, typed: true };
  const cur = (q.typed as (TemplateNode & { appliesWhen?: unknown }) | null)?.appliesWhen;
  const narrowed = !q.typed || JSON.stringify(cur ?? null).includes(JSON.stringify(typedLeaf).slice(1, -1));
  const other: TemplateOp[] = narrowed ? [] : ops.applicability(q.typed!, cur ? { all: [cur, typedLeaf] } : typedLeaf, (q.typed as TemplateNode & { whenUnknown?: 'show' | 'hide' }).whenUnknown ?? null);
  return [
    ...ops.fieldValues(q.node.id, q.attr, [...q.attr.values, v]),
    ...other,
    { op: 'addNode', parentId, node: { id: newNodeId(tree, system.id, label), label, kind: 'component', condition: true, appliesWhen: { field: q.field, anyOf: [v] }, whenUnknown: 'hide' } as TemplateNode },
  ];
}

/** Switching a material back ON: its answer returns to the end of the question and its card comes back where it was —
 *  ONE change set. */
export function switchMaterialOnOps(q: MaterialQuestion, off: OffMaterial): TemplateOp[] {
  if (q.attr.values.some(x => x.toLowerCase() === off.value.toLowerCase())) return [];
  return [...ops.fieldValues(q.node.id, q.attr, [...q.attr.values, off.value]), ...ops.restore(off.card.id)];
}

/** Switching a material OFF: the answer leaves the question and the card it brings is switched off (restorable) — ONE
 *  change set. It then shows in the question's Off list (`off`), not gone. */
export function removeMaterialOps(q: MaterialQuestion, value: string): TemplateOp[] {
  if (!q.attr.values.includes(value)) return [];
  const card = q.rows.find(r => r.value === value)?.card ?? null;
  return [...ops.fieldValues(q.node.id, q.attr, q.attr.values.filter(x => x !== value)), ...(card ? ops.setAside(card.id) : [])];
}
