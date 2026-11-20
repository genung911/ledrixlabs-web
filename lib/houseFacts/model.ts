// Before you start on the website (owner 2026-11-14, mockup 4NAix7t4exh6Lg9CymodEP approved: "Approved").
//
// The house facts the phone asks first — gas, water, sewer, what heats, backup heat, what cools, the water heater, the
// fireplace, the foundation, the garage — read and changed here. ONE RECORD: the utilities and the garage are the job's own
// columns (gas_supply, water_source, sewer_type, garage_type), the types are their items' spec values (inspection_values,
// `<node>::<attr>`), exactly what the phone and Inspection Details write. The questions, their order and the follow-up rule
// are the app's own houseFacts.ts (a byte-identical copy); the several-answers rule is the app's togglePick
// (lib/newJob/intake.ts's copy). Pure: no server, no React.
import '@/lib/scope/core/taxonomy/specKeyDefs';
import { HOUSE_FACTS, HOUSE_FACT_GROUPS, factsAsked, factDisplay, isAnswered, NONE_ANSWER, type HouseFact } from '@/lib/scope/core/taxonomy/houseFacts';
import { resolveApplicability, type ApplicabilityNode } from '@/lib/scope/core/taxonomy/applicability';
import { sectionsOfTemplate, splitSpecValue } from '@/lib/scope/core/taxonomy/scopeRules';
import { specStoreKey } from '@/lib/scope/core/taxonomy/conditionMatch';
import ledrixPack from '../scope/core/taxonomy/ledrix.core.json';
import type { TemplateNode } from '@/lib/scope/core/templates/InspectionTemplate';
import { GAS_SUPPLY_OPTIONS, SEWER_TYPE_OPTIONS, WATER_SOURCE_OPTIONS, splitPicks, togglePick } from '@/lib/newJob/intake';
import { conditionValues, specValue, valueId, type ValueMap } from '@/lib/scope/model';

/** The app's GARAGE_OPTIONS (InspectionExtrasService) — None, the absence, stands alone. */
export const GARAGE_OPTIONS = ['None', 'Attached', 'Detached', 'Carport'] as const;
/** The app's FRONT_FACES_OPTIONS (2026-11-14, #127) — which way the front of the home faces; one answer. */
export const FRONT_FACES_OPTIONS = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'] as const;
/** The app's STORIES_OPTIONS (2026-11-15, #128) — how many stories, above grade; one answer. Replaces the stairs question. */
export const STORIES_OPTIONS = ['1 story', '1½ stories', '2 stories', '3+ stories', 'Split-level'] as const;
export const EXTRAS_COLUMN = { gasSupply: 'gas_supply', waterSource: 'water_source', sewerType: 'sewer_type', garageType: 'garage_type', frontFaces: 'front_faces', stories: 'stories' } as const;
export type ExtrasKey = keyof typeof EXTRAS_COLUMN;
export const EXTRAS_OPTIONS: Record<ExtrasKey, readonly string[]> = {
  gasSupply: GAS_SUPPLY_OPTIONS, waterSource: WATER_SOURCE_OPTIONS, sewerType: SEWER_TYPE_OPTIONS, garageType: GARAGE_OPTIONS,
  frontFaces: FRONT_FACES_OPTIONS, stories: STORIES_OPTIONS,
};
/** An absence a pick stands alone with — the app's ABSENCE_PICKS. */
export const ABSENCE_PICKS = new Set(['No gas service', 'None — all electric', 'None']);
/** The job row's own fields the page reads and writes. */
export type FactsRow = { id: string; row_version: number | null; gas_supply: string | null; water_source: string | null; sewer_type: string | null; garage_type: string | null; front_faces: string | null; stories: string | null };

export type FactView = {
  fact: HouseFact;
  group: string;
  /** The stored answer ('' = not answered). */
  value: string;
  /** What the page shows: "Natural gas + Propane", "None", or '' when unanswered. */
  display: string;
  /** The choices, in the phone's order; the absence (No gas service, garage None) apart, as the phone draws it. */
  options: string[];
  absence: string | null;
  /** Pick every one (the phone's multi); a type field also takes several. */
  multi: boolean;
  /** "None, this house has none" (the phone's NONE_ANSWER) — the type facts that may be absent. */
  allowsNone: boolean;
  /** Where it is written. */
  target: { kind: 'extras'; key: ExtrasKey; column: string } | { kind: 'spec'; key: string; section: string | null; seq: number | null; node: TemplateNode; attr: string };
};

/** A fact's item in this job's checklist: the item itself or its first copy (Heating #1, never #2), never a link. */
export function factNode(systems: readonly TemplateNode[], nodeId: string): TemplateNode | null {
  let hit: TemplateNode | null = null;
  const ord = (id: string) => { const m = id.match(/~i(\d+)$/); return m ? Number(m[1]) : 1; };
  const walk = (n: TemplateNode) => {
    if (hit) return;
    const base = n.id.split('~i')[0];
    if ((n.id === nodeId || base === nodeId) && ord(n.id) <= 1 && !(n as { pointsTo?: unknown }).pointsTo) { hit = n; return; }
    (n.children ?? []).forEach(walk);
  };
  systems.forEach(walk);
  return hit;
}

/** Every fact this job asks now, in the phone's order and groups, with its answer and where it is written. */
export function factsView(systems: readonly TemplateNode[], values: ValueMap, row: FactsRow): FactView[] {
  const sectionOf = sectionsOfTemplate(systems);
  // Only a fact with something to answer: the item AND its field (the phone's factsFor, 2026-11-15).
  // THIS VISIT (app 2026-11-18, Batch A): Weather, Occupancy and Utilities on are panels on the phone, not pick lists; the
  // website asks only the extras it has a column and choices for (EXTRAS_COLUMN) — those three stay the phone's for now.
  const inTemplate = HOUSE_FACTS.filter(f => (f.source.kind === 'extras' ? f.source.key in EXTRAS_COLUMN
    : ((factNode(systems, f.source.nodeId)?.attributes ?? []) as { id: string }[]).some(a => a.id === (f.source as { attr: string }).attr)));
  const valueOf = (f: HouseFact): string => {
    if (f.source.kind === 'extras') return String(row[EXTRAS_COLUMN[f.source.key as ExtrasKey] as keyof FactsRow] ?? '');
    const n = factNode(systems, f.source.nodeId);
    return n ? (specValue(values, specStoreKey(n, f.source.attr)) ?? '') : '';
  };
  return factsAsked(inTemplate, valueOf).map(f => {
    const value = valueOf(f).trim();
    const group = HOUSE_FACT_GROUPS.find(g => g.id === f.group)?.label ?? '';
    if (f.source.kind === 'extras') {
      const key = f.source.key as ExtrasKey;
      const all = [...EXTRAS_OPTIONS[key]];
      const absence = all.find(o => ABSENCE_PICKS.has(o)) ?? null;
      return { fact: f, group, value, display: isAnswered(value) ? factDisplay(value) : '', options: all.filter(o => o !== absence), absence,
        multi: !!f.multi, allowsNone: false, target: { kind: 'extras', key, column: EXTRAS_COLUMN[key] } };   // Front faces is one answer (2026-11-14)
    }
    const node = factNode(systems, f.source.nodeId)!;
    const attr = ((node.attributes ?? []) as { id: string; values?: string[] }[]).find(a => a.id === (f.source as { attr: string }).attr);
    const key = specStoreKey(node, f.source.attr);
    return { fact: f, group, value, display: isAnswered(value) ? factDisplay(value) : '', options: [...(attr?.values ?? [])], absence: null,
      multi: true, allowsNone: !!f.none,
      target: { kind: 'spec', key, section: sectionOf(node.id), seq: values.get(valueId('spec', key))?.seq ?? null, node, attr: f.source.attr } };
  });
}

/** The answer after a tap — the phone's rules: an extras fact picks every one with its absence alone (togglePick); a type
 *  picks every one, and None ("Not present") stands alone too. */
export function nextAnswer(v: FactView, current: string, opt: string): string {
  // One answer for a single fact (Front faces, 2026-11-14): a tap picks it, a tap on it clears it — the phone's rule.
  if (v.target.kind === 'extras' && !v.fact.multi) return current === opt ? '' : opt;
  if (v.target.kind === 'extras') return togglePick(current, opt, [...v.options, ...(v.absence ? [v.absence] : [])]);
  const now = splitSpecValue(current).filter(x => x !== NONE_ANSWER);
  if (opt === NONE_ANSWER) return splitSpecValue(current).includes(NONE_ANSWER) ? '' : NONE_ANSWER;
  const next = now.includes(opt) ? now.filter(x => x !== opt) : [...now, opt];
  return [...v.options.filter(o => next.includes(o)), ...next.filter(x => !v.options.includes(x))].join(', ');
}
export const picksOf = (v: FactView, answer: string): string[] => (v.target.kind === 'extras' ? splitPicks(answer) : splitSpecValue(answer));

// ── RECORDED WORK STAYS (the phone's typeConditionGuard, the Covering rule for every removal) ────────────────────────
// A change that would take an item off the checklist while that item holds a finding, a limitation or a Satisfactory
// mark is refused, and the page names it. Which items a key decides is read from the rules the phone runs (the pack's
// requires / dependsOnSpec); the house facts are read as the phone reads them (`house::gas` … from the job's columns).
type PackNode = ApplicabilityNode & { label?: string };
const PACK_NODES: PackNode[] = ((ledrixPack as unknown as { systems?: { nodes?: PackNode[] }[] }).systems ?? []).flatMap(s => s.nodes ?? []);
const HOUSE_KEY: Record<string, ExtrasKey> = { 'house::gas': 'gasSupply', 'house::water': 'waterSource', 'house::sewer': 'sewerType', 'house::garage': 'garageType' };
const keysOf = (n: PackNode): string[] => {
  const ks: string[] = [];
  for (const p of (n.requires ?? []) as unknown as { specNodeId?: string; orSpec?: { specNodeId?: string }[] }[]) {
    if (p.specNodeId) ks.push(p.specNodeId);
    for (const o of p.orSpec ?? []) if (o.specNodeId) ks.push(o.specNodeId);
  }
  if (n.dependsOnSpec?.nodeId) ks.push(n.dependsOnSpec.nodeId);
  return ks;
};

export type Blocked = { label: string; why: string };
/** What a change would take off the checklist that holds recorded work. Empty = the change may go. */
export function blockedBy(v: FactView, nextValue: string, systems: readonly TemplateNode[], values: ValueMap, row: FactsRow,
  findings: (nodeId: string) => number): Blocked[] {
  const changedKey = v.target.kind === 'extras' ? Object.keys(HOUSE_KEY).find(k => HOUSE_KEY[k] === (v.target as { key: ExtrasKey }).key)! : v.target.key;
  const extrasOf = (k: ExtrasKey) => String(row[EXTRAS_COLUMN[k] as keyof FactsRow] ?? '');
  const reader = (override: boolean) => (key: string): string | undefined => {
    if (key === changedKey) return override ? (nextValue || undefined) : (v.value || undefined);
    if (HOUSE_KEY[key]) return extrasOf(HOUSE_KEY[key]) || undefined;
    return specValue(values, key);
  };
  const out: Blocked[] = [];
  for (const n of PACK_NODES) {
    if (!keysOf(n).includes(changedKey) && !(v.target.kind === 'spec' && keysOf(n).includes(changedKey.split('::')[0]))) continue;
    const item = factNode(systems, n.id);
    if (!item) continue;
    const cond = conditionValues(values, item.id);
    const f = findings(item.id);
    if (!cond.length && !f) continue;
    const before = resolveApplicability(n, { specValue: reader(false) }).state !== 'not_applicable';
    const after = resolveApplicability(n, { specValue: reader(true) }).state !== 'not_applicable';
    if (before && !after) out.push({ label: item.label, why: f ? `${f} finding${f === 1 ? '' : 's'}` : cond.some(c => /\(Limitation\)$/.test(c)) ? 'a limitation' : 'a Satisfactory mark' });
  }
  return out;
}
export const blockedSentence = (b: readonly Blocked[]): string =>
  `${b.map(x => `${x.label} has ${x.why}`).join('; ')}. That change would take ${b.length === 1 ? 'it' : 'them'} off the checklist. Clear or move the work first.`;

/** How many facts are still unanswered (the menu's count). */
export const factsLeft = (views: readonly FactView[]): number => views.filter(x => !isAnswered(x.value)).length;
export { NONE_ANSWER };
