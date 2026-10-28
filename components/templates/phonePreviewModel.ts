// ─── phonePreviewModel — pure helpers behind <PhonePreview> ────────────────────────────────────────────────
//
// Everything here reads the DRAFT tree and nothing else. No React, no store, no clock: the same tree always
// gives the same screens, so the phone can never show something the draft does not say.
//
// The rules are the Ledrix Inspect app's, ported (not imported — the app's modules pull in React Native and the
// taxonomy runtime). Each helper names the app file it follows.
import type { ComponentAttribute, InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import { DEFAULT_COVERED, isCovered, recordsNothingHere } from '@/lib/templates/editorModel';
import { captureRuleDefinitions, frozenRuleNode, type PackRules, type RuleDefinitions } from '@/lib/templateBuilder/core/templateRules';
import { resolveApplicability, collapseToActive } from '@/lib/templateBuilder/core/applicability';
import LEDRIX_RULES from '@/lib/templateBuilder/core/ledrixRules.json';
import { guidedSteps, type GuidedStep } from '@/lib/templateBuilder/core/guidedOrder';

/** ledrix-app src/core/services/customTemplateService.ts — `LIMITATION_REASONS`, the general reasons the app
 *  appends after a component's own authored reasons in the LIMIT sheet. Copied verbatim (2026-10-19). */
export const LIMITATION_REASONS: readonly string[] = [
  'Not visible during inspection',
  'Inaccessible — blocked by storage/furnishings',
  'Inaccessible — structural or safety restriction',
  'Weather prevented full assessment',
  'Beyond the scope of a general home inspection',
];

/** ledrix-app src/core/taxonomy/canonicalSystems.ts — `DEFAULT_ACTIVE_SYSTEMS`. Used only for a template that
 *  marks no system `defaultActive: true` (blank / imported), exactly as the app's offering rule does. */
export const DEFAULT_ACTIVE_SYSTEMS: readonly string[] = DEFAULT_COVERED;

// ── WHICH SYSTEMS A NEW INSPECTION SHOWS ───────────────────────────────────────────────────────────────────────
// Conclusion from ledrix-app src/core/services/inspectionOffering.ts (offeringForNewSnapshot + normalizeOffering)
// and src/components/inspect/CoverageGrid.tsx / ScopeScreen.tsx:
//   · The Scope landing tiles are the snapshot's systems with `inScope === true` (isInScope / inScopeSystemIds).
//   · A COMPANY template never carries `inScope`: when a new inspection is created, `offeringForNewSnapshot`
//     DROPS any stray `inScope` and sets it from `defaultActive === true`. If no system in the template has
//     `defaultActive: true`, the fallback is DEFAULT_ACTIVE_SYSTEMS.
//   · A system that is not in scope is still in the snapshot — offered through "+ Add system" — just not a tile.
// So for the draft (a company template) the deciding flag is `defaultActive`; `inScope` is honoured only when the
// tree is already an inspection snapshot (`offeringModel === 1`).
// One rule for the editor's switches and this preview: lib/templates/editorModel.isCovered.
export function systemShown(tree: InspectionTemplate, sys: TemplateNode): boolean {
  return isCovered(tree, sys);
}

export function shownSystems(tree: InspectionTemplate): TemplateNode[] {
  return (tree.systems ?? []).filter(s => systemShown(tree, s));
}

/** ledrix-app ScopeScreen.tsx `tileNodesOf`: a system's cards are its SUBSYSTEMS; a system with none is one card,
 *  itself. (As in the app, components sitting directly under a system that also has subsystems get no card.) */
export function tilesOf(sys: TemplateNode): TemplateNode[] {
  const subs = (sys.children ?? []).filter(c => c.kind === 'subsystem');
  return subs.length ? subs : [sys];
}

/** Every component under a card, depth-first. `trimmed` is a separate pocket and is never walked. `applies`
 *  (rulesFor + itemApplies below) drops an item the inspection's rules say does not apply right now — the same
 *  verdict Scope reaches, so the preview never shows a row the phone would hide. */
export function leavesOf(tile: TemplateNode, applies?: (nodeId: string) => boolean): TemplateNode[] {
  const out: TemplateNode[] = [];
  const walk = (n: TemplateNode) => {
    for (const c of n.children ?? []) {
      // An item that asks for nothing (Condition, Details and Requirements all off) is hidden on the phone too.
      if (c.kind === 'component' && !recordsNothingHere(c) && (!applies || applies(c.id))) out.push(c);
      if (c.children?.length) walk(c);
    }
  };
  walk(tile);
  return out;
}

// ── WHICH ITEMS APPLY (2026-10-21, one rule model) ───────────────────────────────────────────────────────────
// ledrix-app src/core/services/inspectionRules.ts + src/core/taxonomy/nodeApplicability.ts. Not ported — the SAME
// modules: templateRules.ts and applicability.ts are byte-identical copies (scripts/verify-template-builder.mjs),
// and Ledrix's own rules come from the app's bundled pack (ledrixRules.json, generated, parity-checked). A new
// inspection captures exactly this set from the published template, so the preview and the phone agree:
//   · the company's rule (`appliesWhen`, exact values) and "hide until answered" (`whenUnknown: 'hide'`);
//   · Ledrix's inherited rules (gas venting only on a gas appliance, …);
//   · an unanswered rule shows the item unless it says to hide it.
// What the preview cannot know is RULE 0 (recorded work keeps an item) — nothing is recorded here.
const PACK = (LEDRIX_RULES as { nodes: Record<string, PackRules> }).nodes;

/** The rules a new inspection would capture from this draft. Answers are keyed `<nodeId>::<attrId>` (pickKey). */
export function rulesFor(tree: InspectionTemplate): RuleDefinitions {
  const byId: Record<string, TemplateNode> = {};
  const walk = (n: TemplateNode) => { if (!byId[n.id]) byId[n.id] = n; (n.children ?? []).forEach(walk); };
  (tree.systems ?? []).forEach(walk);
  const attrOf = (nodeId: string, attrId: string) => axesOf(byId[nodeId] ?? ({} as TemplateNode)).attributes.find(a => a.id === attrId);
  return captureRuleDefinitions(tree.systems as never, (b) => PACK[b], {
    keyFor: (nodeId, attrId) => (byId[nodeId] && attrOf(nodeId, attrId) ? pickKey(nodeId, attrId) : null),
    optionsFor: (nodeId, attrId) => attrOf(nodeId, attrId)?.values ?? null,
  });
}

/** The phone stores a single-field item's answer under its bare id; the preview always uses `<id>::<attr>`. */
export function previewSpecValue(index: PreviewIndex, picks: Picks, typed: Picks) {
  return (key: string): string | undefined => {
    let k = key;
    if (k.indexOf('::') < 0) {
      const loc = index.byId[k];
      const attrs = loc ? axesOf(loc.node).attributes : [];
      if (attrs.length !== 1) return undefined;
      k = pickKey(k, attrs[0].id);
    }
    const all = (picks[k] ?? []).concat(typed[k] ?? []);
    return all.length ? all.join(', ') : undefined;
  };
}

/** Does this item apply with these answers? `not_applicable` hides it; unknown and blocked stay shown. */
export function itemApplies(defs: RuleDefinitions, nodeId: string, specValue: (key: string) => string | undefined): boolean {
  const node = frozenRuleNode(defs, nodeId);
  if (!node) return true;
  return collapseToActive(resolveApplicability(node as never, { specValue }).state);
}

// ── WHAT A COMPONENT ASKS (ledrix-app src/core/taxonomy/conditionMatch.ts `componentAxes`) ───────────────────
// New shape: authored, nothing inferred — condition defaults to TRUE. Old shape (pre-S4 company templates): one
// unnamed attribute from `options` minus condition/limitation/absence words, condition unless facet is 'spec'.
const CONDITION_WORDS = ['improper', 'damaged', 'leak', 'defect', 'corroded', 'corrosion', 'rust', 'hazard'];
const NEGATED_BEFORE = /(?:\b(?:no|none|not|free\s+of|without)\b[\s\-—–,:/]*)$/i;
const AUTHORED_SUFFIX = /\((?:flag|limitation)\b[^)]*\)/i;
const LIMITATION_RE = /\b(?:limitation|not visible|inaccessible|no access|not removed|could ?n'?t inspect|not inspected|unable)\b/i;
const ABSENCE_RE = /^none$|^n\/?a$/i;
const stripSuffix = (v: string) => v.replace(/\s*\((?:flag|limitation)\b[^)]*\)\s*$/i, '').trim();

function isConditionOption(v: string): boolean {
  if (!v) return false;
  if (AUTHORED_SUFFIX.test(v)) return true;
  for (let i = 0; i < CONDITION_WORDS.length; i++) {
    const re = new RegExp('\\b' + CONDITION_WORDS[i] + '\\w{0,3}\\b', 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(v)) !== null) {
      if (!NEGATED_BEFORE.test(v.slice(0, m.index))) return true;
    }
  }
  return false;
}
const isLimitationValue = (v: string) => !!v && LIMITATION_RE.test(v);

export type Axes = { attributes: ComponentAttribute[]; condition: boolean; limitations: string[]; method: string[] };

export function axesOf(n: TemplateNode): Axes {
  if (n.attributes || n.condition !== undefined || n.limitations || n.method) {
    return { attributes: n.attributes ?? [], condition: n.condition ?? true, limitations: n.limitations ?? [], method: n.method ?? [] };
  }
  const opts = n.options ?? [];
  const facet = n.facet ?? (opts.length > 0 ? 'both' : 'condition');
  const values = opts.filter(o => !isConditionOption(o) && !isLimitationValue(o) && !ABSENCE_RE.test(o.trim()));
  return {
    attributes: facet !== 'condition' && values.length >= 2 ? [{ id: 'spec', label: n.label, values }] : [],
    condition: facet !== 'spec',
    limitations: (n.limitationOptions ?? []).concat(opts.filter(isLimitationValue)).map(stripSuffix).filter(Boolean),
    method: [],
  };
}

/** The LIMIT sheet's list (customTemplateService `limitationReasonsFor`): the node's own reasons first, then the
 *  general ones, de-duplicated case-insensitively. */
export function limitationReasonsFor(n: TemplateNode): string[] {
  const seen: Record<string, true> = {};
  const out: string[] = [];
  axesOf(n).limitations.concat(LIMITATION_REASONS as string[]).forEach(r => {
    const k = r.toLowerCase();
    if (seen[k]) return;
    seen[k] = true; out.push(r);
  });
  return out;
}

/** Finding shortcuts. The template shape has no field for them today (the app keeps them in code,
 *  src/core/templates/findingIntents.ts, keyed by node id), so this reads an optional `findingShortcuts` array
 *  when the draft carries one and otherwise returns none — the sheet then shows the app's own empty state. */
export function findingShortcutsOf(n: TemplateNode): Array<{ id: string; label: string }> {
  const raw = (n as unknown as { findingShortcuts?: unknown }).findingShortcuts;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; label: string }> = [];
  raw.forEach((x, i) => {
    if (x && typeof x === 'object' && typeof (x as { label?: unknown }).label === 'string') {
      const id = (x as { id?: unknown }).id;
      out.push({ id: typeof id === 'string' ? id : 'sc' + i, label: (x as { label: string }).label });
    }
  });
  return out;
}

// ── THE INDEX: where every node the phone can show lives ────────────────────────────────────────────────────
export type Loc = { systemId: string; tileId: string | null; node: TemplateNode; kind: 'system' | 'tile' | 'leaf' | 'inner' };
export type PreviewIndex = { byId: Record<string, Loc>; shown: Record<string, true>; allSystems: Record<string, TemplateNode> };

export function buildIndex(tree: InspectionTemplate): PreviewIndex {
  const byId: Record<string, Loc> = {};
  const shown: Record<string, true> = {};
  const allSystems: Record<string, TemplateNode> = {};
  (tree.systems ?? []).forEach(sys => {
    allSystems[sys.id] = sys;
    if (systemShown(tree, sys)) shown[sys.id] = true;
    byId[sys.id] = { systemId: sys.id, tileId: null, node: sys, kind: 'system' };
    tilesOf(sys).forEach(tile => {
      if (tile.id !== sys.id) byId[tile.id] = { systemId: sys.id, tileId: tile.id, node: tile, kind: 'tile' };
      const walk = (n: TemplateNode) => {
        for (const c of n.children ?? []) {
          if (!byId[c.id]) byId[c.id] = { systemId: sys.id, tileId: tile.id, node: c, kind: c.kind === 'component' ? 'leaf' : 'inner' };
          if (c.children?.length) walk(c);
        }
      };
      walk(tile);
    });
  });
  return { byId, shown, allSystems };
}

// ── PROGRESS (a simplified subtreeProgress: one checkpoint per value field, per method, per condition) ────────
export type Picks = Record<string, string[]>;
export type CondPick = 'ok' | 'lim' | 'fnd';
export const pickKey = (nodeId: string, attrId: string) => nodeId + '::' + attrId;
export const METHOD_ATTR = '__method';

export function leafProgress(n: TemplateNode, picks: Picks, cond: Record<string, CondPick>, readings: Record<string, string>) {
  const ax = axesOf(n);
  let met = 0, total = 0;
  ax.attributes.forEach(a => { total++; if ((picks[pickKey(n.id, a.id)] ?? []).length) met++; });
  if (ax.method.length) { total++; if ((picks[pickKey(n.id, METHOD_ATTR)] ?? []).length) met++; }
  if (n.freeFormValue) { total++; if ((readings[n.id] ?? '').trim()) met++; }
  if (ax.condition) { total++; if (cond[n.id]) met++; }
  return { met, total, finding: cond[n.id] === 'fnd', limited: cond[n.id] === 'lim' };
}

export function sumProgress(leaves: TemplateNode[], picks: Picks, cond: Record<string, CondPick>, readings: Record<string, string>) {
  const acc = { met: 0, total: 0, finding: false, limited: false };
  leaves.forEach(l => {
    if (l.pointsTo) return;
    const p = leafProgress(l, picks, cond, readings);
    acc.met += p.met; acc.total += p.total; acc.finding = acc.finding || p.finding; acc.limited = acc.limited || p.limited;
  });
  return acc;
}

/** Keep only picks whose value the draft still offers (an option renamed or removed in the editor). */
/*  Values typed on the phone ("Add a material") live in `typed` and are kept unless the field itself is gone. */
export function fieldValues(index: PreviewIndex, key: string): string[] | null {
  const cut = key.lastIndexOf('::');
  const loc = index.byId[key.slice(0, cut)];
  if (!loc) return null;
  const attrId = key.slice(cut + 2);
  const ax = axesOf(loc.node);
  if (attrId === METHOD_ATTR) return ax.method.length ? ax.method : null;
  const a = ax.attributes.find(x => x.id === attrId);
  return a ? a.values : null;
}
export function prunePicks(picks: Picks, typed: Picks, index: PreviewIndex): { picks: Picks; typed: Picks; changed: boolean } {
  const outP: Picks = {}, outT: Picks = {};
  let changed = false;
  Object.keys(picks).forEach(k => {
    const values = fieldValues(index, k);
    if (!values) { changed = true; return; }
    const extra = typed[k] ?? [];
    const kept = picks[k].filter(v => values.indexOf(v) >= 0 || extra.indexOf(v) >= 0);
    if (kept.length !== picks[k].length) changed = true;
    if (kept.length) outP[k] = kept;
  });
  Object.keys(typed).forEach(k => { if (fieldValues(index, k)) outT[k] = typed[k]; else changed = true; });
  return { picks: outP, typed: outT, changed };
}

// ── GUIDED COVERAGE: THE APP'S STEP LIST (2026-10-24) ─────────────────────────────────────────────────────────
// The app's system page is its ITEM LIST — one row per Guided Coverage step — and an item opens as its step,
// walked with Back / Next. The ORDER, GROUPING and SYSTEM BOUNDARIES come from the app's own module:
// lib/templateBuilder/core/guidedOrder.ts is a byte-identical copy of ledrix-app src/core/taxonomy/guidedOrder.ts
// (scripts/verify-template-builder.mjs; ledrix-app verify:web-preview). What is handed to it here is the draft
// tree's version of the app's inputs:
//   · tilesOf / leavesOf ...... the cards and their applicable rows (above; the app's tileNodesOf + scopeRowsFor)
//   · drawnInside ............. ledrix-app src/core/taxonomy/guidedRows.ts drawnInsideRow: a per-type condition
//                               card rides in its host's step; a method-only row rides in a covering host's step
//   · kindOf .................. guidedRows.guidedKindOf: EQUIPMENT for a unit's condition node, DESCRIPTION for
//                               facts only, else COMPONENT
const UNIT_CONDITION_NODES = ['hvac_furnace', 'hvac_condenser'];   // ledrix-app src/core/taxonomy/unitFacts.ts UNIT_FACTS
const baseOf = (id: string) => id.split('~i')[0];                  // ledrix-app src/core/taxonomy/instances.ts baseIdOf

/** typeConditions.typeConditionLinkOf: the host a per-type card hangs off, or null for an ordinary node. */
function cardHostOf(nodeId: string): string | null {
  const reqs = (PACK[baseOf(nodeId)] as { requires?: unknown } | undefined)?.requires;
  if (!Array.isArray(reqs)) return null;
  for (const r of reqs as Array<{ specNodeId?: string; whenUnanswered?: string; origin?: string }>) {
    if (!r || typeof r.specNodeId !== 'string' || r.whenUnanswered !== 'not_applicable' || r.origin === 'template') continue;
    const host = r.specNodeId.split('::')[0];
    if (host) return host;
  }
  return null;
}
function authorsCards(host: TemplateNode): boolean {
  if (axesOf(host).condition) return false;
  return Object.keys(PACK).some(id => cardHostOf(id) === baseOf(host.id));
}
const isMethodOnly = (n: TemplateNode) => { const ax = axesOf(n); return ax.method.length > 0 && ax.attributes.length === 0 && !ax.condition; };

function drawnInside(row: TemplateNode, rows: readonly TemplateNode[]): TemplateNode | undefined {
  const hostId = cardHostOf(row.id);
  if (hostId) {
    const h = rows.find(r => baseOf(r.id) === hostId);
    if (h) return h;
  }
  if (!isMethodOnly(row)) return undefined;
  return rows.find(r => r.id !== row.id && !cardHostOf(r.id) && authorsCards(r));
}
function kindOf(row: TemplateNode): 'description' | 'equipment' | 'component' {
  if (UNIT_CONDITION_NODES.indexOf(baseOf(row.id)) >= 0) return 'equipment';
  if (!axesOf(row).condition && !authorsCards(row)) return 'description';
  return 'component';
}

/** Every Guided Coverage step for the systems shown, with the inspection's rules applied to these answers. */
export function previewSteps(systems: readonly TemplateNode[], applies: (nodeId: string) => boolean): GuidedStep[] {
  return guidedSteps(systems, { tilesOf, rowsOf: tile => leavesOf(tile, applies), drawnInside, kindOf });
}

