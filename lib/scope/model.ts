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
  answerNodeFor, childrenOf, computePairsWith, factFieldsOf, fieldAnswered, limitReasonsFor, materialNodeFor, scopeRowsOf,
  sectionsOfTemplate, specLabel, splitSpecValue, tileNodesOf, type SectionOf,
} from './core/taxonomy/scopeRules';
import { leafVerdict } from './core/taxonomy/leafProgress';
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
export type ScopeTile = { node: TemplateNode; rows: ScopeRow[] };
export type ScopeSystem = { node: TemplateNode; section: string; kind: 'system' | 'room' | 'structure'; tiles: ScopeTile[]; done: number; total: number };

const kindOf = (n: TemplateNode): 'system' | 'room' | 'structure' =>
  n.sectionType === 'room' || n.sectionType === 'structure' ? n.sectionType : String(n.id).startsWith('croom_') ? 'room' : 'system';

export function buildScope(template: { systems?: TemplateNode[] } | null, values: ValueMap,
  counts: { findings: (nodeId: string) => number; photos: (nodeId: string) => number }): { systems: ScopeSystem[]; sectionOf: SectionOf } {
  const systems = template?.systems ?? [];
  const sectionOf = sectionsOfTemplate(systems);
  const isActive = (byId: Map<string, TemplateNode>) => (id: string) => { const n = byId.get(id); return !!n && !n.pointsTo && !recordsNothing(n); };

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
      return { node: t, rows: scopeRowsOf(t, pairMap, active).map(r => rowOf(r, pairMap)) };
    }).filter(t => t.rows.length > 0);
    const p = tileNodesOf(sys).reduce((acc, t) => { const q = progress(t, active); return { done: acc.done + q.done, total: acc.total + q.total }; }, { done: 0, total: 0 });
    out.push({ node: sys, section: sectionOf(sys.id) ?? sys.id, kind, tiles, ...p });
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
