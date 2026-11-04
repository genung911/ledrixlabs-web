// The website's Scope checklist — the READ MODEL (2026-11-02, mockup "Website Scope Checklist", owner-approved).
//
// Every rule that decides a key, a label, a section, a row or what a pick stores is the phone's own, run from the
// byte-identical copies in ./core (ledrix-app src/core/taxonomy/scopeRules.ts and the pure modules it needs; synced by
// ledrix-app scripts/sync-web-preview.mjs, checked by scripts/verify-scope-web.mjs and the app's verify:web-preview).
// This file only arranges them for a wide screen. Pure: no client, no React.
//
// CLOSE TO THE PHONE, NOT IDENTICAL (said in the mockup): a few rows appear or hide on the phone from facts only the
// phone holds (a confirmed equipment type, spec rows not on the server). Here a row shows unless the company switched
// it off entirely (recordsNothing); a row someone answered always shows. Counts can differ by an item until then.
import './core/taxonomy/specKeyDefs';   // registers the Ledrix definitions every spec key is decided from
import { componentAxes, recordsNothing, specStoreKey, METHOD_KEY_ATTR, type ComponentAttribute } from './core/taxonomy/conditionMatch';
import {
  answerNodeFor, areaCoveredNodes, areaLimitOf, childrenOf, computePairsWith, factFieldsOf, fieldAnswered, limitReasonsFor,
  materialNodeFor, scopeRowsOf, sectionsOfTemplate, specLabel, splitSpecValue, tileNodesOf, type SectionOf,
} from './core/taxonomy/scopeRules';
import { leafVerdict } from './core/taxonomy/leafProgress';
import { effectiveGates, evaluateGates, gateStoreKey, type Gate } from './core/taxonomy/gates';
import ledrixPack from './core/taxonomy/ledrix.core.json';
import { resolveApplicability, type ApplicabilityNode } from './core/taxonomy/applicability';
import type { TemplateNode } from './core/templates/InspectionTemplate';

export type ValueKind = 'condition' | 'spec';
export type ServerValue = { structure_id: string; node_key: string; kind: ValueKind; section_key: string | null;
  value: Record<string, unknown> | null; updated_by: string | null; updated_at: string | null; seq: number };
/** The main building's rows, by `${kind}|${key}`. Other buildings stay on the phone for now. */
export type ValueMap = Map<string, ServerValue>;
export const valueId = (kind: ValueKind, key: string) => `${kind}|${key}`;

export function valueMapOf(rows: readonly ServerValue[]): ValueMap {
  const m: ValueMap = new Map();
  for (const r of rows) if ((r.structure_id || 'main') === 'main') m.set(valueId(r.kind, r.node_key), r);
  return m;
}
export const conditionValues = (m: ValueMap, key: string): string[] => {
  const v = m.get(valueId('condition', key))?.value as { values?: unknown } | null | undefined;
  return Array.isArray(v?.values) ? v!.values.map(String) : [];
};
export const specValue = (m: ValueMap, key: string): string | undefined => {
  const v = m.get(valueId('spec', key))?.value as { value?: unknown } | null | undefined;
  return typeof v?.value === 'string' ? v.value : undefined;
};

export type SpecField = { attr: ComponentAttribute; key: string; label: string; options: string[]; picked: string[]; seq: number | null; section: string | null };
export type ScopeRow = {
  node: TemplateNode; section: string | null;
  condition: { key: string; values: string[]; seq: number | null; reasons: string[] } | null;
  specs: SpecField[];
  findings: number; photos: number;
  last: { by: string | null; at: string | null } | null;     // the newest change to this row's values
};
/** A whole-area limitation (Crawlspace, Basement, Attic — owner 2026-11-03): its reason and the items it covers, which
 *  fall off the rows and the count. Set on the phone; shown here. */
export type AreaLimitView = { label: string; cause: string; covered: string[] };
export type ScopeTile = { node: TemplateNode; rows: ScopeRow[]; limit?: AreaLimitView };
export type ScopeSystem = { node: TemplateNode; section: string; kind: 'system' | 'room' | 'structure'; tiles: ScopeTile[]; done: number; total: number;
  limit?: AreaLimitView;
  /** GATES in effect on this system (owner 2026-11-03): a row gate's REMOVE, a utility that is off, a qualified view. */
  gates?: { tone: 'warn' | 'info'; head: string; text: string }[] };
/** The visit's utility states (inspections.water_state / gas_state / power_state, #103). */
export type Utilities = { water?: string | null; gas?: string | null; power?: string | null };
/** The gates a job runs: its snapshot's own, or Ledrix's with the template's changes (the phone's templateGates.gatesOf). */
export function gatesOfTemplate(template: { gates?: unknown; gateDefinitions?: unknown } | null): Gate[] {
  if (template && Array.isArray(template.gateDefinitions)) return template.gateDefinitions as Gate[];
  return effectiveGates(((ledrixPack as { gates?: Gate[] }).gates ?? []), Array.isArray(template?.gates) ? (template!.gates as Gate[]) : null);
}

/** The area limitations among the server's rows (#100's 'system:<id>' limitation rows), keyed by area id. */
export function areaLimitsOf(values: ValueMap): Record<string, { cause: string; except?: string[] }> {
  const out: Record<string, { cause: string; except?: string[] }> = {};
  for (const [k, r] of values) {
    if (!k.startsWith('limitation|system:') || !r.value) continue;
    const id = r.node_key.slice('system:'.length);
    const v = r.value as { cause?: unknown; except?: unknown };
    // An area's limitation, or a GATE's stored REMOVE (`gate.<id>` — Roof not inspected, the panel's dead front; 2026-11-03).
    if ((!areaLimitOf(id) && !id.startsWith('gate.')) || typeof v.cause !== 'string') continue;
    out[id] = { cause: v.cause, ...(Array.isArray(v.except) ? { except: v.except.map(String) } : {}) };
  }
  return out;
}

const kindOf = (n: TemplateNode): 'system' | 'room' | 'structure' =>
  n.sectionType === 'room' || n.sectionType === 'structure' ? n.sectionType : String(n.id).startsWith('croom_') ? 'room' : 'system';

export function buildScope(template: { systems?: TemplateNode[]; gates?: unknown; gateDefinitions?: unknown } | null, values: ValueMap,
  counts: { findings: (nodeId: string) => number; photos: (nodeId: string) => number }, utilities: Utilities = {}): { systems: ScopeSystem[]; sectionOf: SectionOf } {
  const systems = template?.systems ?? [];
  const sectionOf = sectionsOfTemplate(systems);
  // Covered by a whole-area limitation or a GATE: falls off (owner 2026-11-03), as on the phone (scopeRules.areaCoveredNodes).
  const areaLimits = areaLimitsOf(values);
  const gates = gatesOfTemplate(template);
  const rowValues = (nodeId: string): string[] => [...conditionValues(values, nodeId),
    ...[...values.values()].filter(r => r.kind === 'spec' && r.node_key.split('::')[0] === nodeId).map(r => String((r.value as { value?: unknown } | null)?.value ?? '')).filter(Boolean)];
  const gateCtx = { gates, utility: (u: 'water' | 'gas' | 'power') => utilities[u] ?? undefined, specValue: (k: string) => specValue(values, k), rowValues };
  const covered = areaCoveredNodes(systems, areaLimits, gateCtx);
  const gateEval = evaluateGates(gates, systems, { ...gateCtx, stored: areaLimits });
  // TYPE RULES (owner 2026-11-03, round 1 of the dynamic checklist): an item that applies only to some types — a window
  // unit has no condenser, a mini-split shows as many Indoor Heads as its count — follows the same resolver as the phone
  // (applicability.ts, copied byte for byte). The node's own rule (snapshot) wins over the pack's, per field; a unit's
  // facts are read at its own ordinal (`plumb_wh_type~i2` reads `…~i2::type`); recorded work always keeps an item.
  const packNodes = new Map<string, ApplicabilityNode>();
  for (const sys of ((ledrixPack as unknown as { systems?: { nodes?: ApplicabilityNode[] }[] }).systems ?? [])) for (const n of sys.nodes ?? []) packNodes.set(n.id, n);
  const typeApplies = (id: string, n: TemplateNode): boolean => {
    const base = id.split('~i')[0];
    const m = id.match(/~i(\d+)$/); const ord = m ? Number(m[1]) : 1;
    const pk = packNodes.get(base);
    const own = n as unknown as ApplicabilityNode;
    const node: ApplicabilityNode = { id, requires: own.requires ?? pk?.requires, dependsOnSpec: own.dependsOnSpec ?? pk?.dependsOnSpec };
    const scoped = (key: string) => { if (ord <= 1) return key; const [b, a] = key.split('::'); const sk = `${b.split('~i')[0]}~i${ord}`; return a ? `${sk}::${a}` : sk; };
    const r = resolveApplicability(node, { specValue: k => specValue(values, scoped(k)), hasRecordedAssessment: x => conditionValues(values, x).length > 0 });
    return r.state !== 'not_applicable';
  };
  const isActive = (byId: Map<string, TemplateNode>) => (id: string) => { const n = byId.get(id); return !!n && !n.pointsTo && !recordsNothing(n) && !covered.has(id) && typeApplies(id, n); };
  const limitView = (n: TemplateNode, tiles: TemplateNode[]): AreaLimitView | undefined => {
    const area = areaLimitOf(n.id); const e = area ? areaLimits[n.id] : undefined;
    if (!area || !e) return undefined;
    const labels: string[] = [];
    for (const t of tiles) for (const r of scopeRowsOf(t, new Map(), () => true)) if (covered.has(r.id)) labels.push(r.label);
    return { label: area.label, cause: e.cause, covered: labels };
  };

  const fieldsOf = (row: TemplateNode, material: TemplateNode | null): SpecField[] => {
    const out: SpecField[] = [];
    const push = (node: TemplateNode, attr: ComponentAttribute) => {
      const key = specStoreKey(node, attr.id);
      out.push({ attr, key, label: specLabel(node, attr), options: attr.values ?? [], picked: splitSpecValue(specValue(values, key)),
        seq: values.get(valueId('spec', key))?.seq ?? null, section: sectionOf(node.id) });
    };
    if (material) for (const a of componentAxes(material).attributes) push(material, a);
    const method = componentAxes(row).method;
    if (method.length) push(row, { id: METHOD_KEY_ATTR, label: 'Method', values: method });
    return out;
  };

  const rowOf = (node: TemplateNode, pairMap: Map<string, TemplateNode>): ScopeRow => {
    const axes = componentAxes(node);
    const material = materialNodeFor(node, pairMap.get(node.id));
    const specs = fieldsOf(node, material);
    const cond = axes.condition ? { key: node.id, values: conditionValues(values, node.id), seq: values.get(valueId('condition', node.id))?.seq ?? null, reasons: limitReasonsFor(node) } : null;
    const touched = [cond ? values.get(valueId('condition', node.id)) : undefined, ...specs.map(s => values.get(valueId('spec', s.key)))].filter((v): v is ServerValue => !!v);
    const newest = touched.sort((a, b) => b.seq - a.seq)[0];
    return { node, section: sectionOf(node.id), condition: cond, specs, findings: counts.findings(node.id), photos: counts.photos(node.id),
      last: newest ? { by: newest.updated_by, at: newest.updated_at } : null };
  };

  // Progress: subtreeProgress's walk (children that apply, pair halves folded, leaf = no children), each leaf judged by
  // the shared leafVerdict from what the server holds.
  const progress = (root: TemplateNode, active: (id: string) => boolean): { done: number; total: number } => {
    let done = 0, total = 0;
    const walk = (n: TemplateNode) => {
      const pairMap = new Map<string, TemplateNode>();
      const kids = childrenOf(n).filter(k => active(k.id));
      const hidden = computePairsWith(kids, pairMap);
      for (const k of kids) {
        if (hidden.has(k.id)) continue;
        if (childrenOf(k).length) { walk(k); continue; }
        total++;
        const assessed = conditionValues(values, k.id).length > 0;
        const ans = componentAxes(k).condition === false ? answerNodeFor(k, pairMap.get(k.id)) : null;
        const fields = factFieldsOf(ans);
        const described = !!ans && fields.length > 0 && fields.every(f => fieldAnswered(key => specValue(values, key), f));
        if (leafVerdict({ assessed, described }) === 'verified') done++;
      }
    };
    walk(root);
    return { done, total };
  };

  const worked = (n: TemplateNode): boolean => {
    const ids: string[] = []; const collect = (x: TemplateNode) => { ids.push(x.id); childrenOf(x).forEach(collect); }; collect(n);
    return ids.some(id => counts.findings(id) > 0 || conditionValues(values, id).length > 0 || [...values.keys()].some(k => k.startsWith(`spec|${id}`)));
  };

  const listed = systems.filter(s => kindOf(s) === 'room' || s.inScope === true || worked(s));
  const order = ['system', 'room', 'structure'] as const;
  const out: ScopeSystem[] = [];
  for (const kind of order) for (const sys of listed.filter(s => kindOf(s) === kind)) {
    const byId = new Map<string, TemplateNode>(); const index = (x: TemplateNode) => { byId.set(x.id, x); childrenOf(x).forEach(index); }; index(sys);
    const active = isActive(byId);
    const tiles = tileNodesOf(sys).map(t => {
      const pairMap = new Map<string, TemplateNode>();
      const limit = limitView(t, [t]);
      return { node: t, rows: scopeRowsOf(t, pairMap, active).map(r => rowOf(r, pairMap)), ...(limit ? { limit } : {}) };
    }).filter(t => t.rows.length > 0 || t.limit);
    const p = tileNodesOf(sys).reduce((acc, t) => { const q = progress(t, active); return { done: acc.done + q.done, total: acc.total + q.total }; }, { done: 0, total: 0 });
    const limit = limitView(sys, tileNodesOf(sys));
    const label = (id: string) => byId.get(id)?.label;
    const sysGates: NonNullable<ScopeSystem['gates']> = [];
    for (const a of gateEval.active) {
      const here = a.nodes.filter(id => byId.has(id) && !childrenOf(byId.get(id)!).length).map(label).filter((x): x is string => !!x);
      const rowHere = !!a.gate.row && byId.has(a.gate.row);
      if (!rowHere && !here.length) continue;
      if (a.reason.effect === 'remove' && a.gate.row && areaLimitOf(gateStoreKey(a.gate))) continue;   // the area banner says it
      sysGates.push(a.reason.effect === 'qualify'
        ? { tone: 'info', head: `${a.gate.label}: ${a.cause}`, text: `Ratings here print "${a.reason.phrase}". Nothing is removed.` }
        : { tone: 'warn', head: `${a.gate.label}: ${a.cause}`, text: `${here.length} item${here.length === 1 ? '' : 's'} ${a.gate.utility ? 'not tested' : 'not inspected'}, not counted: ${here.join(', ')}. Change it on the phone.` });
    }
    out.push({ node: sys, section: sectionOf(sys.id) ?? sys.id, kind, tiles, ...p, ...(limit ? { limit } : {}), ...(sysGates.length ? { gates: sysGates } : {}) });
  }
  return { systems: out, sectionOf };
}

// ── Who may change a section (the server's #83/#85 rule, so the page never offers what it would refuse) ──────────
export type TeamLike = { lead: string; me: string; people: { user_id: string }[]; sections: Record<string, string> } | null;
export const holderOf = (team: TeamLike, section: string | null): string | null => !team ? null : (section ? team.sections[section] ?? team.lead : team.lead);
export type SectionAccess = 'edit' | 'not_on_job' | 'not_yours';
export function sectionAccess(team: TeamLike, section: string | null): SectionAccess {
  if (!team || !team.people.some(p => p.user_id === team.me)) return 'not_on_job';
  if (team.me === team.lead) return 'edit';
  return holderOf(team, section) === team.me ? 'edit' : 'not_yours';
}


/** The job's other buildings (step 3 F6, option A — owner 2026-11-03: "A"): the template snapshot's `buildings`, the
 *  list each phone records (ledrix-app buildings.ts). Shown READ-ONLY here — the website edits the main building only —
 *  with how many checklist answers the server holds for each, so a multi-building job is visible before it is sealed. */
export type OtherBuilding = { id: string; name: string; systems: string[]; answered: number };
export function otherBuildingsOf(template: { buildings?: unknown } | null, rows: ServerValue[]): OtherBuilding[] {
  const list = Array.isArray(template?.buildings) ? (template!.buildings as Record<string, unknown>[]) : [];
  return list
    .filter(b => b && typeof b.id === 'string' && b.id !== 'main' && typeof b.name === 'string')
    .map(b => ({ id: String(b.id), name: String(b.name), systems: Array.isArray(b.systems) ? b.systems.map(String) : [],
      answered: rows.filter(r => r.structure_id === b.id && r.value != null).length }));
}
