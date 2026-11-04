// ─── scopeRules — THE SCOPE CHECKLIST'S RULES, IN ONE PLACE, SHARED WITH THE WEBSITE (2026-11-02) ───────────────────
//
// Owner: "go with one shared rules file with the website's copy checked against it." The website's Scope section
// (ledrixlabs-web lib/ledrix-core/) reads and WRITES the same checklist values the phone does, so the rules that
// decide what is written — keys, labels, sections, the limitation text, Satisfactory replacing every other pick,
// how spec picks are joined — and the rules that decide which template nodes are rows, live here and only here.
//
// SHARED FILES (scripts/shared-core.json lists them; `npm run share:core` copies them to the website and
// `verify:shared-core` fails when either copy differs): this file, conditionMatch.ts, specKeyDefs.ts,
// ledrix.core.json, leafProgress.ts, roomMatching.ts, ../services/structureIds.ts.
//
// PURE: imports only those files (and a type, erased). No React Native, no Expo, no storage, no network. Every
// function here was moved out of a device file unchanged; that file now re-exports it, so no phone call site moved.
import type { TemplateNode } from '../templates/InspectionTemplate';
import { componentAxes, specStoreKey, specLegacyKey, METHOD_KEY_ATTR, type ComponentAttribute } from './conditionMatch';
import { norm } from './roomMatching';
import { MAIN_STRUCTURE_ID } from '../services/structureIds';
import { evaluateGates, gateOfRow, type Gate, type GateUtility } from './gates';

// ── Structures: a secondary building's keys are prefixed; the main building's are bare (from StructureService) ──
const SCOPE_PREFIX = 'struct:';
export function scopedNodeKey(nodeId: string, structureId: string): string {
  return structureId && structureId !== MAIN_STRUCTURE_ID ? `${SCOPE_PREFIX}${structureId}:${nodeId}` : nodeId;
}
/** Reverse a scoped key back to {structureId, nodeId}. A plain (unprefixed) key is Main House's. */
export function parseScopedKey(key: string): { structureId: string; nodeId: string } {
  if (key.startsWith(SCOPE_PREFIX)) {
    const rest = key.slice(SCOPE_PREFIX.length);
    const i = rest.indexOf(':');
    if (i > 0) return { structureId: rest.slice(0, i), nodeId: rest.slice(i + 1) };
  }
  return { structureId: MAIN_STRUCTURE_ID, nodeId: key };
}

// ── Sections: a template system's BASE id (from checklistSections) ──────────────────────────────────────────────
export type SectionOf = (nodeId: string) => string | null;
export const baseSection = (systemId: string) => String(systemId).replace(/~i\d+$/, '');
/** Node id → section, over a template's systems. Pure. */
export function sectionsOfTemplate(systems: readonly TemplateNode[] | null | undefined): SectionOf {
  const m = new Map<string, string>();
  const walk = (n: TemplateNode, sys: string) => { m.set(n.id, sys); for (const c of n.children ?? []) walk(c, sys); };
  for (const sys of systems ?? []) walk(sys, baseSection(sys.id));
  return (nodeId: string) => m.get(nodeId) ?? m.get(nodeId.split('~')[0]) ?? null;
}

// ── Condition values (conditionStateStore's shape: { label, values }) ───────────────────────────────────────────
/** The Satisfactory tap's marker. Compared with ===, never a substring test. */
export const CONDITION_OK = 'OK';
/** How a limitation reason is stored: "Not Visible" → "Not Visible (Limitation)" (ScopeRowList's LIMIT tap). */
export const limitationValue = (reason: string): string => `${reason} (Limitation)`;
/** A stored value back to the reason the inspector picked, for display. */
export const limitationReasonOf = (value: string): string => value.replace(/\s*\(limitation\)\s*/i, '').trim();
/** Satisfactory and a limitation each REPLACE the whole set; tapping Satisfactory again clears it to [] (the entry
 *  stays, `{label, values: []}`). The phone's markComponentSatisfactory / LIMIT / toggle, as one rule. */
export function nextConditionValues(current: readonly string[], tap: { ok: true } | { limitation: string }): string[] {
  if ('ok' in tap) return current.length === 1 && current[0] === CONDITION_OK ? [] : [CONDITION_OK];
  return [limitationValue(tap.limitation)];
}

// Canonical reasons offered when a leaf is flagged as a Limitation (from customTemplateService). "Other" (free
// text) lives at the call site.
export const LIMITATION_REASONS: string[] = [
  'Not visible during inspection',
  'Inaccessible — blocked by storage/furnishings',
  'Inaccessible — structural or safety restriction',
  'Weather prevented full assessment',
  'Beyond the scope of a general home inspection',
];
/** The LIMIT action's reason list for ONE component: its authored reasons first, the standard ones underneath,
 *  duplicates (any case) dropped (from ScopeRowList). */
export function limitReasonsFor(n: TemplateNode | null): string[] {
  const authored = n ? componentAxes(n).limitations : [];
  const seen = new Set<string>(); const out: string[] = [];
  for (const r of [...authored, ...LIMITATION_REASONS]) {
    const k = r.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(r);
  }
  return out;
}

// ── Spec values (specStore's shape: { label, value }) ───────────────────────────────────────────────────────────
/** Spec picks are always multi-select on Scope, stored joined (from SpecChipRow). Removing the last pick stores ''. */
export const SPEC_DELIM = ', ';
export const joinSpecPicks = (picks: readonly string[]): string => picks.join(SPEC_DELIM);
export const splitSpecValue = (v: string | null | undefined): string[] => (v ?? '').split(SPEC_DELIM).map(s => s.trim()).filter(Boolean);
/** How a spec value names itself outside the tile (from SpecChipRow). */
export const specLabel = (node: TemplateNode, attr?: ComponentAttribute): string =>
  // A METHOD value on a component that also has attributes (Attic Access) names itself — it now has its own
  // key (Phase 1), and the report must not print it under the component's bare name as if it were the access.
  attr?.id === METHOD_KEY_ATTR ? (componentAxes(node).attributes.length ? `${node.label} — Method` : node.label)
  : attr && componentAxes(node).attributes.length > 1 ? `${node.label} — ${attr.label}` : node.label;

// ── The tree (from componentPairing) ────────────────────────────────────────────────────────────────────────────
export const childrenOf = (n: TemplateNode): TemplateNode[] => n.children ?? [];
export const isLeaf = (n: TemplateNode): boolean => n.kind === 'component' || childrenOf(n).length === 0;

// B-lite pairing vocabulary. Pairing is DISPLAY ONLY: either half shown on its own writes the same keys.
const GENERIC_TOKENS = new Set(['material', 'type', 'supply', 'system', 'unit', 'main', 'primary']);
export const pairTokens = (label?: string) => new Set(
  norm(label ?? '').split(' ').filter(t => t.length >= 4 && !GENERIC_TOKENS.has(t)));
/** The component-library type a label resolves to, or null. The phone passes its KB lookup; a caller without one
 *  passes nothing and pairing falls back to label tokens (which may DECLINE a pair — both halves then render). */
export type PairKey = (label: string) => string | null;
const samePairWith = (pairKey: PairKey) => (a: TemplateNode, b: TemplateNode): boolean => {
  const ka = pairKey(a.label), kb = pairKey(b.label);
  if (ka && kb) return ka === kb;
  const ta = pairTokens(a.label), tb = pairTokens(b.label);
  for (const t of ta) if (tb.has(t)) return true;
  return false;
};
const isIdTwin = (condId: string, specId: string): boolean =>
  condId === `${specId}_condition` || condId.endsWith(`_${specId}_condition`);

/** condLeafId → its paired spec leaf, filled into the caller's `pairMap`. Returns the SPEC leaf ids that fold into a
 *  twin and must not render on their own. (componentPairing.computePairs explains both passes.) */
export function computePairsWith(kids: TemplateNode[], pairMap: Map<string, TemplateNode>, pairKey: PairKey = () => null): Set<string> {
  const samePair = samePairWith(pairKey);
  const leaves     = kids.filter(isLeaf);
  const condLeaves = leaves.filter(k => componentAxes(k).attributes.length === 0);
  const hidden  = new Set<string>();
  const claimed = new Set<string>();
  for (const c of condLeaves) {
    const base = leaves.find(b => b.id !== c.id && isIdTwin(c.id, b.id));
    if (!base || hidden.has(base.id)) continue;
    pairMap.set(c.id, base); hidden.add(base.id); claimed.add(c.id);
  }
  const specLeaves = leaves.filter(k => componentAxes(k).attributes.length > 0 && !hidden.has(k.id));
  const open = condLeaves.filter(c => !claimed.has(c.id));
  for (const sp of specLeaves) {
    const matches = open.filter(c => samePair(sp, c));
    if (matches.length !== 1) continue;
    const c = matches[0];
    if (specLeaves.filter(o => samePair(o, c)).length !== 1) continue;
    pairMap.set(c.id, sp); hidden.add(sp.id); claimed.add(c.id);
  }
  return hidden;
}

/** A system's tiles: its direct SUBSYSTEM children; a system with none is its own tile (from ScopeScreen). */
export const tileNodesOf = (sys: TemplateNode): TemplateNode[] => {
  const subs = (sys.children ?? []).filter(c => c.kind === 'subsystem');
  return subs.length ? subs : [sys];
};
/** A tile's rows: its direct leaf children, minus folded pair halves, minus nodes that do not apply (from
 *  ScopeScreen.scopeRowsFor). `isActive` is the caller's applicability test. */
export function scopeRowsOf(sub: TemplateNode, pairMap: Map<string, TemplateNode>, isActive: (nodeId: string) => boolean, pairKey?: PairKey): TemplateNode[] {
  const kids = childrenOf(sub);
  const hidden = computePairsWith(kids, pairMap, pairKey);
  return kids.filter(k => isLeaf(k)).filter(k => !hidden.has(k.id)).filter(k => isActive(k.id));
}

// ── What a component answers (from materialGap) ─────────────────────────────────────────────────────────────────
/** Reserved attribute id for the METHOD axis. */
export const METHOD_ATTR_ID = '__method';
export const factFieldsOf = (n: TemplateNode | null | undefined): { key: string; label: string; legacyKey?: string }[] => {
  if (!n) return [];
  const axes = componentAxes(n);
  const withLegacy = (attrId: string) => { const l = specLegacyKey(n, attrId); return l ? { legacyKey: l } : {}; };
  // An OPTIONAL attribute (`optional: true`, 2026-11-03 — a mini-split head's Location: "Unknown" never blocks) is
  // asked for, never owed.
  const fields: { key: string; label: string; legacyKey?: string }[] = axes.attributes.filter(a => (a as any).optional !== true).map(a => ({ key: specStoreKey(n, a.id), label: a.label, ...withLegacy(a.id) }));
  if (axes.method.length) fields.push({ key: specStoreKey(n, METHOD_ATTR_ID), label: 'Method', ...withLegacy(METHOD_ATTR_ID) });
  return fields;
};
/** The canonical key's value; while it holds no entry, the field's own legacy key. 'Present' is never an answer. */
export const fieldAnswered = (read: (key: string) => string | undefined, f: { key: string; legacyKey?: string }): boolean => {
  const v = read(f.key) ?? (f.legacyKey ? read(f.legacyKey) : undefined);
  return !!v && v !== 'Present';
};
/** Which node carries this component's MATERIAL axis: itself, or its legacy paired sibling. */
export function materialNodeFor(node: TemplateNode, paired: TemplateNode | undefined): TemplateNode | null {
  if (componentAxes(node).attributes.length) return node;
  return paired && componentAxes(paired).attributes.length ? paired : null;
}
/** Which node carries this component's ANSWER — the material node, or itself when its only answerable axis is METHOD. */
export function answerNodeFor(node: TemplateNode, paired: TemplateNode | undefined): TemplateNode | null {
  const material = materialNodeFor(node, paired);
  if (material) return material;
  return componentAxes(node).method.length ? node : null;
}

// ── Whole-area limitations (owner, 2026-11-03: mockup approved) ──────────────────────────────────────────────────
// "Crawlspace not entered" is one limitation about an AREA, and the items it covers FALL OFF: they leave every count
// (owner: "They should fall off as they are not part of the count anymore"), the seal's owed facts and the report's
// unanswered rows, and are listed under the limitation instead. "Inspect one anyway" brings a single item back.
// Stored where a system's limitation already is (sop_limitations.systems / inspection_values 'system:<id>', #100):
// the area's id is a template section (subsystem) id, or a system id for a whole-system area (Attic). `except` lists
// the items brought back. Basement and Attic take the same limitation as Crawlspace (owner, same day).
export const AREA_LIMITS: readonly { id: string; label: string }[] = [
  { id: 'foundation__crawlspace', label: 'Crawlspace' },
  { id: 'foundation__basement',   label: 'Basement' },
  { id: 'attic',                  label: 'Attic' },
];
/** The reasons offered when limiting a whole area. "Other" (free text) lives at the call site.
 *  2026-11-03 (owner on 690): "Viewed from hatch changes wording in the report, not remove items" — and "partial entry
 *  is the same". Both left this list: they are recorded on the area's ACCESS row and qualify the report's wording
 *  (accessQualifierText); only an area that was not entered at all is limited as a whole. */
export const AREA_LIMIT_REASONS: readonly string[] = ['No access'];
/** The cause an access row's "No Access" writes on its area (and the only cause clearing that row takes back). */
export const AREA_NO_ACCESS_CAUSE = 'No access';
const areaBase = (id: string) => String(id).replace(/~i\d+$/, '');
export const areaLimitOf = (nodeId: string): { id: string; label: string } | null =>
  AREA_LIMITS.find(a => a.id === areaBase(nodeId)) ?? null;
/** What the gates read on this job (owner 2026-11-03). */
export type GateContext = {
  gates?: readonly Gate[];
  utility?: (u: GateUtility) => string | undefined;
  specValue?: (key: string) => string | undefined;
  rowValues?: (nodeId: string) => readonly string[];
};
/** One area's limitation as either store holds it: only `except` matters to coverage. */
export type AreaLimitLike = { except?: readonly unknown[] | null } | null | undefined;
/** Every node an area limitation covers: the area node's whole subtree (its own id included) minus the items brought
 *  back with "Inspect one anyway" (and their subtrees). `limits` is keyed by area id, as sop_limitations.systems is —
 *  any other key in it (an ordinary system limitation) covers nothing here. Pure. */
export function areaCoveredNodes(systems: readonly TemplateNode[] | null | undefined,
  limits: Record<string, AreaLimitLike> | null | undefined, ctx?: GateContext): Set<string> {
  const out = new Set<string>();
  // GATES (owner 2026-11-03: mockup approved) — what a gate removes falls off exactly as an area limitation's items do:
  // a row gate's stored REMOVE (Crawlspace / Attic No Access, Roof not inspected, the panel's dead front) and a
  // utility that is off. `ctx` absent = no gates (the header's area limitations only, as before).
  if (ctx?.gates?.length) {
    const ev = evaluateGates(ctx.gates, systems as any, { stored: limits as any, utility: ctx.utility, specValue: ctx.specValue, rowValues: ctx.rowValues });
    for (const id of ev.removed.keys()) out.add(id);
  }
  if (!limits) return out;
  const add = (n: TemplateNode, except: Set<string>) => {
    if (except.has(n.id)) return;
    // A gate's ROW is never covered (2026-11-03): it is where the access is recorded — "No Access" there sets the
    // area's limitation — so it stays an answered row, not one of the items the limitation lists.
    if (gateOfRow(ctx?.gates, n.id)) return;
    out.add(n.id);
    for (const c of n.children ?? []) add(c, except);
  };
  const walk = (n: TemplateNode) => {
    const area = areaLimitOf(n.id);
    const lim = area ? (limits[n.id] ?? limits[area.id]) : undefined;
    if (area && lim) {
      const except = new Set((Array.isArray(lim.except) ? lim.except : []).map(String));
      add(n, except);
      // a brought-back item still sits under the area: its own rows are not covered
      return;
    }
    for (const c of n.children ?? []) walk(c);
  };
  for (const s of systems ?? []) walk(s);
  return out;
}
