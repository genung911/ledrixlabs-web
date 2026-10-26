// Requirements as the editor shows them — over the SHARED contract (core/requirementsContract, byte-identical to the
// app's), never a second model.
//
// What the editor may author is exactly what the contract accepts for a COMPANY requirement (ADR 2026-10-25 §7, V1):
//   · on the item it belongs to, using that item's own records only;
//   · a level (required / recommended / optional) and one or more of the contract's purposes;
//   · an optional "when it applies" rule in the existing rule grammar (ruleModel);
//   · what satisfies it: ANY of some methods, or ALL of them (satisfy.all[].any[]);
//   · what happens when it can't be satisfied: whether a limitation resolves it. Exceptions are not built, so the
//     contract refuses `exception: 'allowed'` and the editor always writes 'not_allowed'.
// Report inclusion is NOT part of a requirement (ADR §4 M5 / §7.9: it belongs to the data). Ledrix's default set is
// pinned, never stored or edited here.
//
// NOTHING HERE MAKES A REQUIREMENT TAKE EFFECT. Inspections can't evaluate requirements yet, so a template carrying
// any is never published (useDraft.publish refuses, the Publish button says why). This module only builds, reads and
// judges them in the draft.
//
// FIELD KEYS. A `fields` clause names a field by `<nodeId>::<attrId>` — the same reference the rule grammar uses. The
// contract's FieldRef.key is the record's STORAGE key, which only the app can compute (conditionMatch.specStoreKey
// needs the pack's key registry); the app materializes it when it freezes requirements into an inspection (ADR §18.5,
// not built). Until then a website-authored key is a reference, not a storage key, and nothing reads it.
//
// PURE: no React, no store, no clock.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import {
  REQUIREMENT_LEVELS, REQUIREMENT_PURPOSES, carriedRequirements, nodeShapeOf, validateTemplateRequirements,
  type Clause, type RequirementDef, type RequirementIssue, type RequirementLevel, type RequirementPurpose,
} from '@/lib/templateBuilder/core/requirementsContract';

export { REQUIREMENT_LEVELS, REQUIREMENT_PURPOSES, carriedRequirements };
export type { Clause, RequirementDef, RequirementIssue, RequirementLevel, RequirementPurpose };

export const LEVEL_LABEL: Record<RequirementLevel, string> = { required: 'Required', recommended: 'Recommended', optional: 'Optional' };
export const LEVEL_MEANING: Record<RequirementLevel, string> = {
  required: 'Must be satisfied or resolved before the report is finalized',
  recommended: 'Warns when missing; never blocks',
  optional: 'Available; no obligation',
};
export const PURPOSE_LABEL: Record<RequirementPurpose, string> = {
  risk_management: 'Risk management',
  report_support: 'Report support',
  inspection_documentation: 'Inspection documentation',
  activity_verification: 'Activity verification',
  work_verification: 'Work verification',
  management_review: 'Management review',
};

/** The Ledrix default requirement set this template is pinned to. Absent = 'ledrix-r0' (today's behaviour). */
export function pinnedDefaultSet(tree: InspectionTemplate): string {
  const pin = (tree as InspectionTemplate & { requirementDefaults?: unknown }).requirementDefaults;
  return typeof pin === 'string' && pin.trim() ? pin : 'ledrix-r0';
}
/** How many of the default set's requirements this template overrides (none can be authored here). */
export function overrideCount(tree: InspectionTemplate): number {
  const ov = (tree as InspectionTemplate & { requirementOverrides?: unknown }).requirementOverrides;
  return ov && typeof ov === 'object' && !Array.isArray(ov) ? Object.keys(ov).length : 0;
}

/** The company requirements an item carries (a list, or nothing). */
export function requirementsOf(n: TemplateNode | null | undefined): RequirementDef[] {
  const r = (n as (TemplateNode & { requirements?: unknown }) | null | undefined)?.requirements;
  return Array.isArray(r) ? (r as RequirementDef[]) : [];
}

/** Every item that carries requirements, in template order, with the system it is in. */
export function itemsWithRequirements(tree: InspectionTemplate): Array<{ node: TemplateNode; system: TemplateNode; defs: RequirementDef[] }> {
  const out: Array<{ node: TemplateNode; system: TemplateNode; defs: RequirementDef[] }> = [];
  for (const system of tree.systems) {
    const walk = (n: TemplateNode) => { const defs = requirementsOf(n); if (defs.length) out.push({ node: n, system, defs }); (n.children ?? []).forEach(walk); };
    walk(system);
  }
  return out;
}

export function levelCounts(defs: readonly RequirementDef[]): Record<RequirementLevel, number> {
  const c: Record<RequirementLevel, number> = { required: 0, recommended: 0, optional: 0 };
  for (const d of defs) if (REQUIREMENT_LEVELS.includes(d.level)) c[d.level]++;
  return c;
}

/** The contract's own judgement of the template's requirements (the same call templateValidate makes on every edit). */
export const requirementIssues = (tree: InspectionTemplate): RequirementIssue[] => validateTemplateRequirements(tree as never);

// ── methods: what can satisfy a requirement on THIS item ─────────────────────────────────────────────────────────

export type Method = { key: string; label: string; hint?: string; clause: Clause };

/** A stable identity for a clause, so a stored clause finds its method again. */
export function clauseKey(c: Clause): string {
  switch (c.kind) {
    case 'evidence': return `evidence:${c.media}${c.tag ? `:${c.tag}` : ''}`;
    case 'fields': return `fields:${c.fields.map(f => f.attr ?? f.key).join('+')}${c.values ? `=${c.values.join('|')}` : ''}`;
    case 'assessment': return `assessment:${[...c.accepts].sort().join('+')}`;
    case 'finding': return `finding${c.legacyCountsProposed ? ':proposed' : ''}`;
    case 'measurement': return `measurement:${c.point}`;
  }
}

/** The methods the contract allows a company requirement on this item, given what the item records. */
export function methodsFor(node: TemplateNode): Method[] {
  const shape = nodeShapeOf(node);
  const out: Method[] = [
    { key: '', label: 'Photograph of this item', hint: 'A photo linked to the item', clause: { kind: 'evidence', media: 'photo' } },
    { key: '', label: 'Document', hint: 'A document linked to the item, e.g. a manual or permit', clause: { kind: 'evidence', media: 'document' } },
  ];
  for (const a of node.attributes ?? []) {
    out.push({ key: '', label: `Specification — ${a.label}`, hint: 'The field has a recorded answer', clause: { kind: 'fields', fields: [{ attr: a.id, key: `${node.id}::${a.id}`, label: a.label }] } });
  }
  if (shape.attributeIds.includes('__method')) {
    out.push({ key: '', label: 'Method of inspection recorded', clause: { kind: 'fields', fields: [{ attr: '__method', key: `${node.id}::__method`, label: 'Method' }] } });
  }
  if (shape.takesCondition) {
    out.push({ key: '', label: 'Condition assessment', hint: 'Satisfactory, Limitation or Finding recorded', clause: { kind: 'assessment', accepts: ['ok', 'limitation', 'finding'] } });
  }
  out.push({ key: '', label: 'A confirmed finding', hint: 'Only a finding the inspector confirmed counts', clause: { kind: 'finding' } });
  return out.map(m => ({ ...m, key: clauseKey(m.clause) }));
}

/** How a requirement's "what satisfies it" reads in the editor: ANY of the picked methods, or ALL of them.
 *  `ok: false` = a stored shape the editor can't show that way (mixed groups, or a method this item doesn't offer). */
export type SatisfyView = { ok: true; mode: 'any' | 'all'; keys: string[] } | { ok: false; reason: string };

export function readSatisfy(def: RequirementDef, methods: readonly Method[]): SatisfyView {
  const groups = def.satisfy?.all ?? [];
  const known = new Set(methods.map(m => m.key));
  const keysOf = (cs: Clause[]) => cs.map(clauseKey);
  if (groups.length === 1) {
    const keys = keysOf(groups[0].any);
    return keys.every(k => known.has(k)) ? { ok: true, mode: 'any', keys } : { ok: false, reason: 'it uses a method this item does not offer' };
  }
  if (groups.length > 1 && groups.every(g => g.any.length === 1)) {
    const keys = groups.map(g => clauseKey(g.any[0]));
    return keys.every(k => known.has(k)) ? { ok: true, mode: 'all', keys } : { ok: false, reason: 'it uses a method this item does not offer' };
  }
  return { ok: false, reason: 'it combines groups of alternatives' };
}

/** Picked methods → the contract's satisfy shape. ANY = one group of alternatives; ALL = one group per method. */
export function writeSatisfy(mode: 'any' | 'all', clauses: readonly Clause[]): RequirementDef['satisfy'] {
  return mode === 'any' || clauses.length <= 1 ? { all: [{ any: [...clauses] }] } : { all: clauses.map(c => ({ any: [c] })) };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28) || 'req';

/** Every requirement id the template uses (ids are unique template-wide — the contract checks them together). */
function usedIds(tree: InspectionTemplate): Set<string> {
  const ids = new Set<string>();
  const walk = (n: TemplateNode) => {
    requirementsOf(n).forEach(d => ids.add(d.id));
    (n.children ?? []).forEach(walk);
    ((n as TemplateNode & { trimmed?: TemplateNode[] }).trimmed ?? []).forEach(walk);
  };
  tree.systems.forEach(walk);
  (tree.trimmedSystems ?? []).forEach(walk);
  return ids;
}

/** A new company requirement on `node`: Required, for inspection documentation, satisfied by the item's condition
 *  assessment when it takes one (else a photo), resolved by a limitation. The owner changes any of it. */
export function newRequirement(tree: InspectionTemplate, node: TemplateNode, label: string): RequirementDef {
  const used = usedIds(tree);
  const base = `rq_${slug(label)}`;
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}_${i}`;
  const methods = methodsFor(node);
  const first = methods.find(m => m.clause.kind === 'assessment') ?? methods[0];
  return {
    id, origin: 'company', label: label.trim(), purposes: ['inspection_documentation'], level: 'required',
    subject: { nodeId: node.id }, satisfy: writeSatisfy('any', [first.clause]),
    unmet: { limitation: 'resolves', exception: 'not_allowed' },
  };
}

/** The issues the contract reports for one item's requirements (by requirement id, plus item-level ones). */
export function issuesFor(issues: readonly RequirementIssue[], node: TemplateNode): RequirementIssue[] {
  const ids = new Set(requirementsOf(node).map(d => d.id));
  return issues.filter(i => (i.requirementId && ids.has(i.requirementId)) || (!i.requirementId && i.message.includes(`"${node.label}"`)));
}
