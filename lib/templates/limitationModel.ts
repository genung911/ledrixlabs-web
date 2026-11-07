// LIMITATIONS, BY SYSTEM (owner 2026-11-07: "should this be worked into the what inspect area? Below conditions section
// would be limitations?" → mockup https://claude.ai/artifact/FSTfPJUMmjGDVFqiqneD6o → "Approved" → "Build and push").
// The Limitations step left the builder: each system's screen lists the situations that change ITS checklist, and the
// systems list counts them. A gate belongs to every system that holds its row, its area or one of its items — so a
// utility (Water / Gas / Power off) shows in each system it reaches, and changing it there changes it everywhere (it is
// one gate). Pure: reads the template and Ledrix's pack, writes nothing.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import { effectiveGates, type Gate, type GateReason } from '@/lib/scope/core/taxonomy/gates';
import ledrixPack from '@/lib/scope/core/taxonomy/ledrix.core.json';

export const LEDRIX_GATES: Gate[] = ((ledrixPack as { gates?: Gate[] }).gates ?? []);
export type GateEntry = Gate | { id: string; removed: true };
export const isRemoved = (e: GateEntry | undefined): e is { id: string; removed: true } => !!e && (e as { removed?: boolean }).removed === true;

/** The template's own gate entries (overrides, removals, its own). */
export const ownGates = (tree: InspectionTemplate): GateEntry[] =>
  (Array.isArray((tree as { gates?: unknown }).gates) ? (tree as unknown as { gates: GateEntry[] }).gates : []);
/** The gates new inspections run: Ledrix's, with the template's changes. */
export const templateGates = (tree: InspectionTemplate): Gate[] => effectiveGates(LEDRIX_GATES, ownGates(tree));

const baseOf = (id: string) => String(id).split('::')[0].replace(/~i\d+$/, '');

/** node id → the id of the system it sits in. */
export function systemIndex(systems: readonly TemplateNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (n: TemplateNode, top: string) => { out.set(n.id, top); (n.children ?? []).forEach(c => walk(c, top)); };
  for (const s of systems) walk(s, s.id);
  return out;
}

/** The systems a gate reaches in this template: its row's, its area's, and every listed item's. */
export function systemsOfGate(g: Gate, systems: readonly TemplateNode[], idx = systemIndex(systems)): string[] {
  const out = new Set<string>();
  const at = (id: string | undefined) => { const s = id ? idx.get(baseOf(id)) : undefined; if (s) out.add(s); };
  at(g.row);
  (g.area ?? []).forEach(at);
  (g.items ?? []).forEach(i => at(i.node));
  return systems.map(s => s.id).filter(id => out.has(id));
}

/** A gate as the inspector meets it: reasons with the same effect (and phrase) read as one line —
 *  "Off at meter or Off — vacant". `limits` = it changes the checklist (Skipped / Still rated). */
export type LimitRow = { reasons: GateReason[]; effect: GateReason['effect']; limits: boolean };
export function limitRows(g: Gate): LimitRow[] {
  const by = new Map<string, GateReason[]>();
  for (const r of g.reasons) { const k = `${r.effect}|${r.effect === 'qualify' ? r.phrase ?? '' : ''}`; by.set(k, [...(by.get(k) ?? []), r]); }
  return [...by.values()].map(rs => ({ reasons: rs, effect: rs[0].effect, limits: rs[0].effect !== 'none' }));
}

/** The gates that reach a system, in the template's gate order. */
export const gatesOfSystem = (gates: readonly Gate[], systems: readonly TemplateNode[], systemId: string): Gate[] => {
  const idx = systemIndex(systems);
  return gates.filter(g => systemsOfGate(g, systems, idx).includes(systemId));
};

/** The number next to a system in the list: the situations that change its checklist. */
export function limitCounts(tree: InspectionTemplate): Map<string, number> {
  const systems = tree.systems ?? [];
  const idx = systemIndex(systems);
  const out = new Map<string, number>();
  for (const g of templateGates(tree)) {
    const n = limitRows(g).filter(r => r.limits).length;
    if (!n) continue;
    for (const s of systemsOfGate(g, systems, idx)) out.set(s, (out.get(s) ?? 0) + n);
  }
  return out;
}

/** How a reason reads in the "When the inspector records…" column. */
export const sayReason = (v: string) => (v === '*limitation' ? 'Not inspected (any reason)' : v);
