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

/** The number next to a system in the list: the ACCESS situations that change its checklist. Utilities are counted
 *  once, on the Utilities row (2026-11-07, limitations back in Condition). */
export function limitCounts(tree: InspectionTemplate): Map<string, number> {
  const systems = tree.systems ?? [];
  const idx = systemIndex(systems);
  const out = new Map<string, number>();
  for (const g of templateGates(tree)) {
    if (g.utility) continue;
    const n = limitRows(g).filter(r => r.limits).length;
    if (!n) continue;
    for (const s of systemsOfGate(g, systems, idx)) out.set(s, (out.get(s) ?? 0) + n);
  }
  return out;
}

/** How a reason reads in the "When the inspector records…" column. */
export const sayReason = (v: string) => (v === '*limitation' ? 'Not inspected (any reason)' : v);

// ── ONE SHAPE AT EVERY LEVEL (owner 2026-11-07, mockup https://claude.ai/artifact/CgiHJ5LqFQb4hAFSrAr3ox, "approved"):
// every system, group and item starts with a Limitations row that opens THAT part's limitations. A gate reaches a part
// when its row, an area root or one of its items sits in the part — or the part sits inside one of its areas (the roof
// method's area is Covering, so Asphalt Shingle is reached).

/** node id → its parent's id (systems have none). */
export function parentIndex(systems: readonly TemplateNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (n: TemplateNode) => (n.children ?? []).forEach(c => { out.set(c.id, n.id); walk(c); });
  systems.forEach(walk);
  return out;
}
const ancestorsOf = (id: string, parents: Map<string, string>): string[] => {
  const out: string[] = [];
  for (let p: string | undefined = id, n = 0; p && n < 50; p = parents.get(p), n++) out.push(p);
  return out;
};

/** Does this gate reach the part? */
export function gateReachesPart(g: Gate, partId: string, parents: Map<string, string>): boolean {
  const touched = [g.row, ...(g.area ?? []), ...(g.items ?? []).map(i => i.node)].filter((x): x is string => !!x).map(baseOf);
  if (touched.some(t => ancestorsOf(t, parents).includes(partId))) return true;          // something of it sits in the part
  const up = new Set(ancestorsOf(partId, parents));
  return (g.area ?? []).some(a => up.has(baseOf(a)));                                    // the part sits in its area
}
export const gatesOfPart = (gates: readonly Gate[], systems: readonly TemplateNode[], partId: string): Gate[] => {
  const parents = parentIndex(systems);
  return gates.filter(g => gateReachesPart(g, partId, parents));
};

/** The Limitations row's count and one line: the ACCESS situations that change this part's checklist, plus an item's
 *  own reasons (utilities live in Utilities). "None · tap to add" when there are none. */
export function partLimitSummary(gates: readonly Gate[], systems: readonly TemplateNode[], part: TemplateNode): { count: number; line: string } {
  const reach = gatesOfPart(gates, systems, part.id).filter(g => !g.utility);
  const said: string[] = [];
  let count = 0;
  for (const g of reach) {
    const rows = limitRows(g).filter(r => r.limits);
    count += rows.length;
    said.push(...rows.flatMap(r => r.reasons.map(x => sayReason(x.value))));
  }
  const own = part.kind === 'component' ? (part.limitations ?? []) : [];
  count += own.length;
  const line = [...own, ...said].filter((x, i, a) => a.indexOf(x) === i);
  return { count, line: line.length ? line.join(', ') : 'None · tap to add' };
}

// ── LIMITATIONS BACK IN CONDITION (owner 2026-11-07: "I think a majority probably live inside the condition section …
// We may still need a few areas like roof, attic and crawlspace for accessibility and then of course the utility ones" →
// mockup https://claude.ai/artifact/D55cNLEk1gM9B4cHbTtD1q → "Approved on both. Build and push"). An item's limitations
// are its own reasons, set inside Condition. A system keeps a Limitations row only when an ACCESS situation reaches it
// (roof method, attic, crawlspace, panel cover, or one the company added); groups have none. The utilities are set once,
// in Utilities at the top of the systems list.

/** The access (non-utility) situations that reach a part. */
export const accessGatesOfPart = (gates: readonly Gate[], systems: readonly TemplateNode[], partId: string): Gate[] =>
  gatesOfPart(gates, systems, partId).filter(g => !g.utility);
/** The template's utilities (Water / Gas / Power), as new inspections run them. */
export const utilityGates = (tree: InspectionTemplate): Gate[] => templateGates(tree).filter(g => !!g.utility);
/** The count on the Utilities row: the utility rows that skip items. */
export const utilityCount = (tree: InspectionTemplate): number =>
  utilityGates(tree).reduce((n, g) => n + limitRows(g).filter(r => r.limits).length, 0);
