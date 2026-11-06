// ─── typeLayout — a typed system, laid out one equipment type at a time (owner 2026-11-05) ──────────────────────────
//
// Mockup (approved, all four rulings): https://claude.ai/artifact/RUWz7xuKn2qPkq22eFEMS9 — "Cooling … looks like one big
// long list. How do we separate these so the person building can go through each system like a mini split vs a split
// system". A system such as COOLING carries every kind of AC's items (25), but on site the inspector answers ONE type
// question (AC System Type) and the phone shows only that type's items. This module reads which item belongs to which
// type and lays the builder out the same way.
//
// ── ONE SOURCE ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Nothing here interprets a rule. The caller passes the inspection's EFFECTIVE rule set — the one a new inspection
// would capture from this draft (phonePreviewModel.rulesFor → templateRules.captureRuleDefinitions: the Ledrix pack's
// rules + the template's own + the company's compiled `appliesWhen`) — and every "does item X show for type V?" is
// answered by the phone's own resolver (applicability.resolveApplicability), with V as the only recorded answer. The
// grid's ticks are therefore exactly what the phone will do.
//
// ── WHAT THE GRID MAY WRITE ────────────────────────────────────────────────────────────────────────────────────────
// A company rule (`appliesWhen`) is AND-ed onto Ledrix's own (templateRules.definitionFor) — it can NARROW where an
// item shows, never widen past Ledrix's rule (that rule is not template-writable: `requires` is not a NODE_FIELD).
// So a cell Ledrix's rule excludes is shown and disabled ("Ledrix: only for …"); "+ Add item for <type>" is how a
// company adds its own item to a type. Unticking writes `{ field: '<typeNode>::<attr>', anyOf: [ticked types] }`
// through the existing validated `setNodeField appliesWhen` op (editorModel.ops.applicability), kept beside any other
// clause the item's rule already has; ticking back every type Ledrix allows removes the type clause again.
//
// PURE: no React, no store, no clock.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import type { RuleDefinitions } from '@/lib/templateBuilder/core/templateRules';
import { collapseToActive, resolveApplicability } from '@/lib/templateBuilder/core/applicability';
import { SPECIAL_HOMES } from '@/lib/templateBuilder/core/specialHomes';
import { flatItems, newNodeId, ops } from './editorModel';

export type TypeQuestion = { nodeId: string; attrId: string; field: string; label: string; values: string[] };

/** Count copies: Indoor Head 1..8 — one row per head, shown while the count question reaches N. */
export type CopyGroup = { id: string; countNodeId: string; countLabel: string; items: TemplateNode[]; label: string };

export type OtherQuestion = { nodeId: string; label: string; systemLabel: string };

export type TypeLayout = {
  question: TypeQuestion;
  questionNode: TemplateNode;
  /** Items with no rule at all that decides where they show (shown for every type), in list order. Copies, items gated
   *  by another question, special-home items and other-system items are NOT here (owner 2026-11-05: "Every" must mean
   *  every). */
  every: TemplateNode[];
  /** Items (or a copy group's first item) with a rule on the type question, in list order. */
  typed: TemplateNode[];
  copies: CopyGroup[];
  /** Items whose rule reads ANOTHER system's answer (Cooling's Heat Pump on the heating type). */
  other: Array<{ node: TemplateNode; question: OtherQuestion }>;
  /** Items with no type rule that another question INSIDE this system decides (Electrical's fuses on the panel's
   *  protection, wiring cards on the wiring type), one section per question, in list order. */
  gated: Array<{ key: string; question: OtherQuestion; nodes: TemplateNode[] }>;
  /** Special-home checkpoints (specialHomes.ts) with no type rule — added from the special-homes card. */
  special: TemplateNode[];
  /** Item id → the type values it shows for (the effective rule, as the phone resolves it). */
  shows: Record<string, string[]>;
  /** Item id → the type values Ledrix's own rule allows (the company may narrow inside these, never widen). */
  allowed: Record<string, string[]>;
};

type Pred = { specNodeId?: unknown; includes?: unknown; whenUnanswered?: unknown; origin?: unknown; exact?: unknown; unlisted?: unknown };

const baseOf = (id: string) => String(id).replace(/~i\d+$/, '');

/** A spec key → `<nodeId>::<attrId>`. A bare id is a single-field item's answer (stored under the bare id). */
function normKey(key: string, byId: Map<string, TemplateNode>): string {
  if (key.includes('::')) return key;
  const n = byId.get(key);
  const attrs = n?.attributes ?? [];
  return attrs.length === 1 ? `${key}::${attrs[0].id}` : key;
}

/** Every predicate of an item's effective rule, with its normalised key. */
export function predsOf(defs: RuleDefinitions, id: string, byId: Map<string, TemplateNode>): Array<{ key: string; p: Pred; dep: boolean }> {
  const d = defs.nodes[baseOf(id)];
  if (!d) return [];
  const out: Array<{ key: string; p: Pred; dep: boolean }> = [];
  for (const p of (d.requires ?? []) as Pred[]) if (p && typeof p.specNodeId === 'string') out.push({ key: normKey(p.specNodeId, byId), p, dep: false });
  if (d.dependsOnSpec) out.push({ key: normKey(d.dependsOnSpec.nodeId, byId), p: { specNodeId: d.dependsOnSpec.nodeId, includes: d.dependsOnSpec.includes }, dep: true });
  return out;
}

/** Does the phone's resolver show this item when the type question — and nothing else — is answered `value`? */
export function showsFor(preds: Array<{ key: string; p: Pred; dep: boolean }>, id: string, field: string, value: string): boolean {
  const mine = preds.filter(x => x.key === field);
  if (!mine.length) return true;
  // dependsOnSpec is read by the resolver as `{ specNodeId, includes }` (applicability.predicatesOf), the shape it already has here.
  const node = { id, requires: mine.map(x => x.p) };
  return collapseToActive(resolveApplicability(node as never, { specValue: () => value }).state);
}

/** Every node in the template (active), by id, and which system each sits in. */
export function indexTree(tree: InspectionTemplate) {
  const byId = new Map<string, TemplateNode>();
  const systemOf = new Map<string, TemplateNode>();
  for (const s of tree.systems ?? []) {
    const walk = (n: TemplateNode) => { if (!byId.has(n.id)) { byId.set(n.id, n); systemOf.set(n.id, s); } (n.children ?? []).forEach(walk); };
    walk(s);
  }
  return { byId, systemOf };
}

/**
 * The type layout of `system`, or null when its items don't change with one type answer inside it (it keeps the plain
 * list). The type question is the in-system field that the most items' rules read (at least two, and at least a third of
 * the system's items), excluding count fields (a count shows N copies; it is not a type).
 */
export function typeLayoutOf(tree: InspectionTemplate, system: TemplateNode, defs: RuleDefinitions): TypeLayout | null {
  const { byId, systemOf } = indexTree(tree);
  const items = flatItems(system).map(r => r.node).filter(n => n.kind === 'component');
  const preds = new Map(items.map(n => [n.id, predsOf(defs, n.id, byId)]));
  const fieldNode = (key: string) => { const [nid, aid] = key.split('::'); const n = byId.get(nid); return n && aid ? { n, a: (n.attributes ?? []).find(a => a.id === aid) } : null; };
  const isCount = (key: string) => { const f = fieldNode(key); return !!f?.a && (f.a.id === 'count' || (f.a.values.length > 0 && f.a.values.every(v => /^\d+$/.test(v)))); };
  const inSystem = (key: string) => { const f = fieldNode(key); return !!f && systemOf.get(f.n.id)?.id === system.id; };

  const tally = new Map<string, number>();
  for (const n of items) for (const k of new Set((preds.get(n.id) ?? []).map(x => x.key))) {
    if (!inSystem(k) || isCount(k)) continue;
    const f = fieldNode(k); if (!f?.a || f.a.values.length < 2 || f.n.id === n.id) continue;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  // A TYPE question changes WHICH SEVERAL items apply (a mini-split has heads, a window unit has a sleeve). A field whose
  // every answer brings exactly one item is a material list — one card per material, several at once — and keeps the
  // plain list (owner 2026-11-03: materials are multi-select cards; equipment type is one per unit).
  const several = (k: string) => {
    const f = fieldNode(k)!;
    return f.a!.values.some(v => items.filter(n => n.id !== f.n.id && (preds.get(n.id) ?? []).some(x => x.key === k) && showsFor(preds.get(n.id) ?? [], n.id, k, v)).length >= 2);
  };
  let field: string | null = null; let best = 1;
  for (const [k, c] of tally) if (c > best && several(k)) { best = c; field = k; }
  if (!field) return null;
  // Chips only when the question decides at least a THIRD of the system (owner 2026-11-06, mockup
  // NC6nHJ1mUGuv2ikCUfU3Cc): Heating 19/25, Cooling 20/25, Water Heater 8/13, Fireplace 7/16, Roofing 10/23 keep them;
  // Electrical's Service Entrance (3/27) does not — the system is laid out group by group (materialLayout), where the
  // question shows as "Brought by" in its own group.
  if (best * 3 < items.length) return null;
  const qf = fieldNode(field)!;
  const question: TypeQuestion = { nodeId: qf.n.id, attrId: qf.a!.id, field, label: qf.a!.label || qf.n.label, values: [...qf.a!.values] };

  const shows: Record<string, string[]> = {}, allowed: Record<string, string[]> = {};
  const every: TemplateNode[] = [], typed: TemplateNode[] = [], other: TypeLayout['other'] = [], special: TemplateNode[] = [];
  const gatedBy = new Map<string, TypeLayout['gated'][number]>();
  const specialIds = new Set(SPECIAL_HOMES.map(x => x.id));
  const copyOf = new Map<string, CopyGroup>();
  for (const n of items) {
    if (n.id === question.nodeId) continue;
    const ps = preds.get(n.id) ?? [];
    shows[n.id] = question.values.filter(v => showsFor(ps, n.id, field!, v));
    allowed[n.id] = question.values.filter(v => showsFor(ps.filter(x => x.p.origin !== 'template'), n.id, field!, v));
    const countKey = ps.map(x => x.key).find(k => k !== field && inSystem(k) && isCount(k));
    if (countKey) {
      const cn = fieldNode(countKey)!.n;
      const g = copyOf.get(countKey) ?? { id: `copies:${cn.id}`, countNodeId: cn.id, countLabel: cn.label, items: [], label: '' };
      g.items.push(n); copyOf.set(countKey, g);
      continue;
    }
    const outside = ps.find(x => x.key !== field && !inSystem(x.key) && fieldNode(x.key));
    if (outside) {
      const f = fieldNode(outside.key)!;
      other.push({ node: n, question: { nodeId: f.n.id, label: f.a?.label || f.n.label, systemLabel: systemOf.get(f.n.id)?.label ?? '' } });
      continue;
    }
    if (ps.some(x => x.key === field)) { typed.push(n); continue; }
    const inner = ps.find(x => x.key !== field && inSystem(x.key) && !isCount(x.key) && fieldNode(x.key)?.n.id !== n.id && fieldNode(x.key));
    if (inner) {
      const f = fieldNode(inner.key)!;
      const g = gatedBy.get(inner.key) ?? { key: inner.key, question: { nodeId: f.n.id, label: f.a?.label && f.a.label !== f.n.label ? `${f.n.label} › ${f.a.label}` : f.n.label, systemLabel: system.label }, nodes: [] };
      g.nodes.push(n); gatedBy.set(inner.key, g);
      continue;
    }
    if (specialIds.has(baseOf(n.id))) { special.push(n); continue; }
    every.push(n);
  }
  const copies: CopyGroup[] = [];
  for (const g of copyOf.values()) {
    if (g.items.length < 2) { typed.push(...g.items); continue; }
    g.label = `${commonStem(g.items.map(i => i.label))}, one per ${singular(g.countLabel)} (1–${g.items.length})`;
    copies.push(g);
    typed.push(g.items[0]);
  }
  const order = new Map(items.map((n, i) => [n.id, i]));
  typed.sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
  return { question, questionNode: qf.n, every, typed, copies, other, gated: [...gatedBy.values()], special, shows, allowed };
}

const commonStem = (labels: string[]) => {
  const stripped = labels.map(l => l.replace(/\s*\d+\s*$/, '').trim());
  return stripped.every(s => s === stripped[0]) && stripped[0] ? stripped[0] + 's' : labels[0];
};
const singular = (s: string) => s.replace(/^indoor\s+/i, '').replace(/s$/i, '').toLowerCase() || 'unit';

/** The copy group a row stands for (its first item), if any. */
export function copyGroupOf(layout: TypeLayout, itemId: string): CopyGroup | null {
  return layout.copies.find(g => g.items.some(i => i.id === itemId)) ?? null;
}

/** The rows one type's section shows (owner 2026-11-05: no separate "Every" section — "probably should show in each one
 *  its in"): the type question, then the items every type shows, then that type's own items. */
export function rowsForType(layout: TypeLayout, value: string): TemplateNode[] {
  return [layout.questionNode, ...layout.every, ...itemsForType(layout, value)];
}

/** The items shown for one type, in list order (a copy group as its first item). */
export function itemsForType(layout: TypeLayout, value: string): TemplateNode[] {
  return layout.typed.filter(n => (layout.shows[n.id] ?? []).includes(value));
}

// ── the rule a tick writes ───────────────────────────────────────────────────────────────────────────────────────────

type Rule = unknown;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** Is `r` a clause on the type field alone (a leaf with values, or an `any` of such leaves)? Its values, or null. */
function typeClauseValues(r: Rule, field: string): string[] | null {
  if (!isObj(r)) return null;
  if (Array.isArray(r.any)) {
    const parts = r.any.map(x => typeClauseValues(x, field));
    return parts.every(p => p) ? [...new Set(parts.flat() as string[])] : null;
  }
  return r.field === field && Array.isArray(r.anyOf) ? (r.anyOf as string[]) : null;
}
/** The item's rule minus any clause on the type field. */
function otherClauses(rule: Rule, field: string): Rule[] {
  if (rule === undefined || rule === null) return [];
  if (isObj(rule) && Array.isArray(rule.all)) return (rule.all as Rule[]).filter(c => !typeClauseValues(c, field));
  return typeClauseValues(rule, field) ? [] : [rule];
}

export type TickResult = { ok: true; ops: TemplateOp[] } | { ok: false; reason: string };

/**
 * Make `itemIds` (one item, or every copy of a count group) show for exactly `want` types. Only narrowing inside what
 * Ledrix's own rule allows is possible; the rule is written through the item's `appliesWhen`, one change set.
 */
export function typeRuleOps(tree: InspectionTemplate, layout: TypeLayout, itemIds: string[], want: string[]): TickResult {
  const { byId } = indexTree(tree);
  const values = layout.question.values.filter(v => want.includes(v));
  if (!values.length) return { ok: false, reason: 'An item must show for at least one type. Switch it off instead.' };
  const out: TemplateOp[] = [];
  for (const id of itemIds) {
    const node = byId.get(id);
    if (!node) return { ok: false, reason: `No item ${id}.` };
    const allow = layout.allowed[id] ?? layout.question.values;
    const outside = values.filter(v => !allow.includes(v));
    if (outside.length) return { ok: false, reason: `Ledrix's rule shows ${node.label} only for ${allow.join(', ')}. Add your own item for ${outside.join(', ')} instead.` };
    const x = node as TemplateNode & { appliesWhen?: unknown; whenUnknown?: 'show' | 'hide' };
    const keep = otherClauses(x.appliesWhen, layout.question.field);
    const narrow = values.length < allow.length ? [{ field: layout.question.field, anyOf: values }] : [];
    const clauses = [...keep, ...narrow];
    const next = clauses.length === 0 ? null : clauses.length === 1 ? clauses[0] : { all: clauses };
    if (JSON.stringify(next ?? null) === JSON.stringify(x.appliesWhen ?? null)) continue;
    out.push(...ops.applicability(node, next, next === null ? null : (x.whenUnknown ?? null)));
  }
  return { ok: true, ops: out };
}

/** "+ Add item for <type>": a new item, placed beside the type question, that shows only for that type (and is hidden
 *  until the type is answered — as Ledrix's own per-type items are). */
export function addForTypeOps(tree: InspectionTemplate, system: TemplateNode, layout: TypeLayout, value: string, label: string): TemplateOp[] {
  const name = label.trim();
  if (!name || !layout.question.values.includes(value)) return [];
  const parent = flatItems(system).find(r => r.node.id === layout.question.nodeId)?.parentId ?? system.id;
  const id = newNodeId(tree, system.id, name);
  return [{ op: 'addNode', parentId: parent, node: { id, label: name, kind: 'component', condition: true, appliesWhen: { field: layout.question.field, anyOf: [value] }, whenUnknown: 'hide' } as TemplateNode }];
}

/** Edit every copy of a count group at once: one list of ops, applied as one change set. */
export function copiesOps(group: CopyGroup, edit: (n: TemplateNode) => TemplateOp[]): TemplateOp[] {
  return group.items.flatMap(edit);
}

/** The preview's answer for a chosen type: the key the phone preview stores it under (`<nodeId>::<attrId>`). */
export function previewAnswer(layout: TypeLayout | null, value: string | null): { key: string; value: string } | null {
  return layout && value && layout.question.values.includes(value) ? { key: layout.question.field, value } : null;
}
