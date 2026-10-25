// ─── requirementsContract — the requirement DEFINITION contract and its validator (shared with the web) ─────────
//
// Split out of requirements.ts for Phase A (owner, 2026-10-25): the desktop Template Builder must validate the
// requirements a template carries with exactly the app's rules, and the web runs this file as a byte-identical copy
// (scripts/web-preview-sync.json). It holds the TYPES, the controlled vocabularies and the VALIDATOR only — nothing
// that evaluates records. The evaluator stays app-side in requirements.ts, which re-exports everything here.
//
// applicability: a requirement's `appliesWhen` uses the EXISTING predicate grammar and is only VALIDATED here, with
// templateOps.checkPredicate. templateRules.ts stays the one rule compiler (verify:template-setup, verify:requirements §9).
//
// PURE. One import: templateOps.checkPredicate (itself pure).
import { checkPredicate } from './templateOps';
import type { InspectionTemplate, TemplateNode } from './InspectionTemplate';

// ── the contract ─────────────────────────────────────────────────────────────────────────────────────────────────

export const REQUIREMENT_CONTRACT_VERSION = 1;

export type RequirementLevel = 'required' | 'recommended' | 'optional';
export const REQUIREMENT_LEVELS: readonly RequirementLevel[] = ['required', 'recommended', 'optional'];

/** ADR §7.2. Descriptive and extensible; never decides strength or behaviour. */
export type RequirementPurpose =
  | 'risk_management' | 'report_support' | 'inspection_documentation'
  | 'activity_verification' | 'work_verification' | 'management_review';
export const REQUIREMENT_PURPOSES: readonly RequirementPurpose[] = [
  'risk_management', 'report_support', 'inspection_documentation', 'activity_verification', 'work_verification', 'management_review',
];

/** One spec field, MATERIALIZED with its storage keys when the requirement is built (factFieldsOf), so a later key
 *  rule change cannot move what a frozen requirement reads. */
export type FieldRef = { attr?: string; key: string; legacyKey?: string; label: string };   // attr: required on company requirements

export type Clause =
  /** Every listed field holds a recorded value (canonical key, else its legacy key; 'Present' is never a value).
   *  `values`: the answer must be one of these (single-field clauses only). */
  | { kind: 'fields'; nodeId?: string; fields: FieldRef[]; values?: string[] }
  /** A recorded condition decision on the subject. `any_entry` (r0 only) = any condition value at all, which is
   *  today's coverage rule. */
  | { kind: 'assessment'; nodeId?: string; accepts: Array<'ok' | 'limitation' | 'finding' | 'any_entry'> }
  /** ≥1 CONFIRMED finding on the subject. `legacyCountsProposed` (r0 only): today's coverage counts any finding that
   *  is not rejected — kept for parity, never allowed in a company requirement. */
  | { kind: 'finding'; nodeId?: string; legacyCountsProposed?: true }
  | { kind: 'measurement'; nodeId?: string; point: string; unit?: string; min?: number; max?: number }
  /** A photo or document LINKED to the subject (and to this requirement or tag, when given). A file is never enough. */
  | { kind: 'evidence'; nodeId?: string; media: 'photo' | 'video' | 'document'; tag?: string };

export type RequirementDef = {
  id: string;
  origin: 'ledrix' | 'company';
  /** The default set a Ledrix requirement belongs to (e.g. 'ledrix-r0'); absent on company requirements. */
  set?: string;
  label: string;
  purposes: RequirementPurpose[];
  level: RequirementLevel;
  /** One item, or (r0 coverage rows ONLY) a legacy group whose ANY applicable member may satisfy it. */
  subject: { nodeId: string } | { legacyGroup: string[] };
  /** The existing predicate grammar (templateOps.checkPredicate). Resolved by the caller (Phase 1 does not evaluate
   *  spec predicates itself — that stays in the one resolver, applicability.ts). */
  appliesWhen?: unknown;
  satisfy: { all: Array<{ any: Clause[] }> };
  unmet: { limitation: 'resolves' | 'not_allowed'; limitationKinds?: string[]; exception: 'allowed' | 'not_allowed' };
  /** Compatibility translation of a current mechanism (verify:requirements-r0). Never on a company requirement. */
  legacy?: { r0: 'facts' | 'coverage' | 'evidence'; systemLabel?: string; nodeLabel?: string };
};

// ── validation ───────────────────────────────────────────────────────────────────────────────────────────────────

export type RequirementIssue = { code: string; severity: 'error' | 'warning'; requirementId?: string; message: string };
/** The node shape validation needs: which attribute ids an item has. */
export type NodeShape = { id: string; attributeIds: readonly string[]; takesCondition: boolean };

/** Judge a requirement list. `nodes` (optional): the template's items, to check subjects and fields exist.
 *  Company requirements are held to the V1 rules (ADR §7): own item only, no legacy semantics, no exceptions yet. */
export function validateRequirements(defs: readonly unknown[], nodes?: ReadonlyMap<string, NodeShape>): RequirementIssue[] {
  const out: RequirementIssue[] = [];
  const add = (code: string, message: string, requirementId?: string, severity: 'error' | 'warning' = 'error') =>
    out.push({ code, severity, message, ...(requirementId ? { requirementId } : {}) });
  if (!Array.isArray(defs)) { add('requirements_shape', 'Requirements must be a list.'); return out; }
  const ids = new Set<string>();
  defs.forEach((raw: any, i) => {
    const id = typeof raw?.id === 'string' ? raw.id : '';
    const say = (raw?.label && String(raw.label)) || id || `Requirement ${i + 1}`;
    if (!raw || typeof raw !== 'object') { add('requirement_shape', `Requirement ${i + 1} is not readable.`); return; }
    if (!id.trim()) add('requirement_id', `"${say}" has no id.`);
    else if (ids.has(id)) add('requirement_duplicate_id', `Two requirements share the id "${id}".`, id);
    ids.add(id);
    const company = raw.origin === 'company';
    if (raw.origin !== 'ledrix' && raw.origin !== 'company') add('requirement_origin', `"${say}" has no origin.`, id);
    if (company && !/^rq_[a-z0-9_]+$/.test(id)) add('requirement_id_format', `"${say}": a company requirement id is "rq_…".`, id);
    if (raw.origin === 'ledrix' && !String(raw.set ?? '').trim()) add('requirement_set', `"${say}": a Ledrix requirement names its default set.`, id);
    if (!String(raw.label ?? '').trim()) add('requirement_label', `Requirement "${id}" has no label.`, id);
    if (!Array.isArray(raw.purposes) || !raw.purposes.length) add('requirement_purpose', `"${say}" needs at least one purpose.`, id);
    else for (const p of raw.purposes) if (!REQUIREMENT_PURPOSES.includes(p)) add('requirement_purpose_unknown', `"${say}" has an unknown purpose "${p}".`, id);
    if (!REQUIREMENT_LEVELS.includes(raw.level)) add('requirement_level', `"${say}" has no valid level.`, id);
    // subject
    const subj = raw.subject;
    const subject: string | null = subj && typeof subj.nodeId === 'string' ? subj.nodeId : null;
    if (subj && Array.isArray(subj.legacyGroup)) {
      if (company || !raw.legacy) add('requirement_legacy_group', `"${say}": only Ledrix compatibility rows may use a legacy group.`, id);
    } else if (!subject) add('requirement_subject', `"${say}" names no item.`, id);
    else if (nodes && !nodes.has(subject)) add('requirement_subject_missing', `"${say}" is on an item that is not in this template ("${subject}").`, id);
    if (company && raw.legacy) add('requirement_legacy', `"${say}": compatibility semantics are Ledrix-only.`, id);
    // applicability
    if (raw.appliesWhen !== undefined) { const e = checkPredicate(raw.appliesWhen); if (e) add('requirement_applies_when', `"${say}": ${e}.`, id); }
    // satisfaction
    const all = raw.satisfy?.all;
    if (!Array.isArray(all) || !all.length) { add('requirement_satisfy', `"${say}" says nothing satisfies it.`, id); }
    else all.forEach((g: any, gi: number) => {
      if (!Array.isArray(g?.any) || !g.any.length) { add('requirement_satisfy_group', `"${say}": option group ${gi + 1} is empty.`, id); return; }
      for (const c of g.any) {
        const node = c?.nodeId ?? subject;
        if (company && c?.nodeId !== undefined && c.nodeId !== subject) add('requirement_other_item', `"${say}" may only use its own item's records.`, id);
        const shape = node && nodes ? nodes.get(node) : undefined;
        switch (c?.kind) {
          case 'fields':
            // r0 only: a required fact item whose template node has NO fields is owed forever today (owedFacts:
            // `answered = fields.length > 0 && …`). Reproduced, never allowed in a company requirement.
            if (!Array.isArray(c.fields) || (!c.fields.length && raw.legacy?.r0 !== 'facts')) add('requirement_fields_empty', `"${say}": a field option names no fields.`, id);
            else {
              for (const f of c.fields) if (!f || !f.key || !f.label || (company && !f.attr)) add('requirement_field_shape', `"${say}": a field is incomplete.`, id);
              if (shape) for (const f of c.fields) if (f?.attr && !shape.attributeIds.includes(f.attr)) add('requirement_field_missing', `"${say}" uses a field the item does not have ("${f.attr}").`, id);
              if (c.values !== undefined && (c.fields.length !== 1 || !Array.isArray(c.values) || !c.values.length)) add('requirement_field_values', `"${say}": allowed answers need exactly one field.`, id);
            }
            break;
          case 'assessment':
            if (!Array.isArray(c.accepts) || !c.accepts.length || c.accepts.some((a: string) => !['ok', 'limitation', 'finding', 'any_entry'].includes(a))) add('requirement_assessment', `"${say}": the assessment option accepts nothing valid.`, id);
            if (company && c.accepts?.includes('any_entry')) add('requirement_legacy', `"${say}": "any entry" is a compatibility rule.`, id);
            if (shape && !shape.takesCondition) add('requirement_assessment_item', `"${say}" asks for an assessment of an item that is not assessed.`, id);
            break;
          case 'finding':
            if (company && c.legacyCountsProposed) add('requirement_legacy', `"${say}": an unconfirmed finding never satisfies a company requirement.`, id);
            break;
          case 'measurement':
            if (!String(c.point ?? '').trim()) add('requirement_measurement', `"${say}": a measurement option names no point.`, id);
            if (typeof c.min === 'number' && typeof c.max === 'number' && c.min > c.max) add('requirement_measurement_range', `"${say}": the range is empty.`, id);
            break;
          case 'evidence':
            if (!['photo', 'video', 'document'].includes(c.media)) add('requirement_evidence', `"${say}": evidence must be a photo, a video or a document.`, id);
            break;
          default: add('requirement_clause_kind', `"${say}" has an unknown option "${String(c?.kind)}".`, id);
        }
      }
    });
    // unmet policy
    const u = raw.unmet;
    if (!u || !['resolves', 'not_allowed'].includes(u.limitation) || !['allowed', 'not_allowed'].includes(u.exception)) add('requirement_unmet', `"${say}" does not say what happens when it can't be satisfied.`, id);
    // Exceptions are not built (no store, no approval authority): a company requirement may not rely on one yet.
    else if (company && u.exception === 'allowed') add('requirement_exceptions_unavailable', `"${say}": exceptions are not available yet.`, id);
    if (raw.level === 'optional' && u?.exception === 'allowed') add('requirement_optional_exception', `"${say}": an optional requirement never needs an exception.`, id, 'warning');
  });
  return out;
}

// ── a template's requirements (Phase A, 2026-10-25) ─────────────────────────────────────────────────────────────
//
// What a COMPANY TEMPLATE may carry (ADR §5): company requirements on their own items (`TemplateNode.requirements`),
// a pinned Ledrix default set (`requirementDefaults`; absent = 'ledrix-r0', today's behaviour) and overrides of that
// set's requirements (`requirementOverrides`, keyed by Ledrix requirement id). Ledrix defaults themselves are NEVER
// stored in a template — they come from the pinned set when an inspection is created (a later phase).
// Nothing reads these at runtime yet: an inspection is unaffected until requirements are frozen and evaluated.

/** The Ledrix default sets this build knows. */
export const REQUIREMENT_DEFAULT_SETS: readonly string[] = ['ledrix-r0'];
export type RequirementOverride = { level?: RequirementLevel; disabled?: true; unmet?: RequirementDef['unmet'] };

/** The node shape validation needs, read from a template item: its attribute ids (and the method axis), and whether
 *  it is assessed (a missing `condition` reads as assessed — the app's rule, conditionMatch.componentAxes). */
export const nodeShapeOf = (n: TemplateNode): NodeShape => ({
  id: n.id,
  attributeIds: [...(n.attributes ?? []).map(a => a.id), ...((n.method ?? []).length ? ['__method'] : [])],
  takesCondition: n.condition !== false,
});

/** Judge a template's requirements, pin and overrides. Empty for a template that carries none of them. Called by
 *  templateValidate.validateTemplate, so every edit and publish is held to it. */
export function validateTemplateRequirements(tpl: Pick<InspectionTemplate, 'systems' | 'trimmedSystems'> & { requirementDefaults?: unknown; requirementOverrides?: unknown }): RequirementIssue[] {
  const out: RequirementIssue[] = [];
  const add = (code: string, message: string, requirementId?: string, severity: 'error' | 'warning' = 'error') =>
    out.push({ code, severity, message, ...(requirementId ? { requirementId } : {}) });
  const shapes = new Map<string, NodeShape>();
  const owned: Array<{ owner: TemplateNode; def: any }> = [];
  const walk = (n: TemplateNode) => {
    shapes.set(n.id, nodeShapeOf(n));
    const reqs = (n as TemplateNode & { requirements?: unknown }).requirements;
    if (reqs !== undefined) {
      if (!Array.isArray(reqs)) add('requirements_shape', `"${n.label}": its requirements must be a list.`);
      else for (const def of reqs) owned.push({ owner: n, def });
    }
    (n.children ?? []).forEach(walk);
    ((n as TemplateNode & { trimmed?: TemplateNode[] }).trimmed ?? []).forEach(walk);
  };
  (tpl.systems ?? []).forEach(walk);
  (tpl.trimmedSystems ?? []).forEach(walk);

  for (const { owner, def } of owned) {
    const id = typeof def?.id === 'string' ? def.id : undefined;
    if (def?.origin !== 'company') add('requirement_template_origin', `"${owner.label}": a template carries only the company's own requirements; Ledrix defaults come from the pinned set.`, id);
    const subject = def?.subject?.nodeId;
    if (typeof subject === 'string' && subject !== owner.id) add('requirement_wrong_item', `"${owner.label}" carries a requirement for another item ("${subject}").`, id);
  }
  out.push(...validateRequirements(owned.map(o => o.def), shapes));

  const pin = tpl.requirementDefaults;
  if (pin !== undefined && (typeof pin !== 'string' || !REQUIREMENT_DEFAULT_SETS.includes(pin))) add('requirement_defaults', `Unknown Ledrix default requirement set "${String(pin)}".`);
  const set = typeof pin === 'string' ? pin : 'ledrix-r0';
  const ov = tpl.requirementOverrides;
  if (ov !== undefined) {
    if (!ov || typeof ov !== 'object' || Array.isArray(ov)) add('requirement_overrides_shape', 'Requirement overrides must be a map of Ledrix requirement ids.');
    else for (const [key, raw] of Object.entries(ov as Record<string, unknown>)) {
      const o = raw as Record<string, unknown> | null;
      if (!key.startsWith(`ledrix:${set.replace(/^ledrix-/, '')}:`)) add('requirement_override_key', `"${key}" is not a requirement of the pinned default set (${set}).`, key);
      if (!o || typeof o !== 'object' || Array.isArray(o)) { add('requirement_override_shape', `The override of "${key}" is not readable.`, key); continue; }
      const extra = Object.keys(o).filter(k => !['level', 'disabled', 'unmet'].includes(k));
      if (extra.length) add('requirement_override_shape', `The override of "${key}" sets ${extra.join(', ')}, which cannot be overridden.`, key);
      if (o.level !== undefined && !REQUIREMENT_LEVELS.includes(o.level as RequirementLevel)) add('requirement_override_level', `The override of "${key}" has no valid level.`, key);
      if (o.disabled !== undefined && o.disabled !== true) add('requirement_override_disabled', `The override of "${key}": "disabled" can only be true.`, key);
      const u = o.unmet as Record<string, unknown> | undefined;
      if (u !== undefined && (!u || !['resolves', 'not_allowed'].includes(u.limitation as string) || !['allowed', 'not_allowed'].includes(u.exception as string))) add('requirement_override_unmet', `The override of "${key}" has an unreadable unmet policy.`, key);
      else if (u?.exception === 'allowed') add('requirement_exceptions_unavailable', `The override of "${key}": exceptions are not available yet.`, key);
      if (!extra.length && o.level === undefined && o.disabled === undefined && u === undefined) add('requirement_override_empty', `The override of "${key}" changes nothing.`, key, 'warning');
    }
  }
  return out;
}

/** What requirement configuration a template carries beyond today's behaviour: company requirements on items, overrides
 *  of the Ledrix defaults, or a pin to a set other than 'ledrix-r0'. Empty = the template behaves exactly as today.
 *  Owner decision (Phase A, 2026-10-25): companies may not PUBLISH requirements the inspector's app cannot yet evaluate
 *  and enforce — the desktop publish refuses while this is non-empty (ledrixlabs-web lib/templates/useDraft.ts). */
export function carriedRequirements(tpl: Pick<InspectionTemplate, 'systems' | 'trimmedSystems'> & { requirementDefaults?: unknown; requirementOverrides?: unknown }): string[] {
  const out: string[] = [];
  const walk = (n: TemplateNode) => {
    const r = (n as TemplateNode & { requirements?: unknown }).requirements;
    if (Array.isArray(r) ? r.length > 0 : r !== undefined) out.push(`requirements on "${n.label}"`);
    (n.children ?? []).forEach(walk);
    ((n as TemplateNode & { trimmed?: TemplateNode[] }).trimmed ?? []).forEach(walk);
  };
  (tpl.systems ?? []).forEach(walk);
  (tpl.trimmedSystems ?? []).forEach(walk);
  const ov = tpl.requirementOverrides;
  if (ov !== undefined && !(ov && typeof ov === 'object' && !Array.isArray(ov) && Object.keys(ov).length === 0)) out.push('changes to Ledrix default requirements');
  if (tpl.requirementDefaults !== undefined && tpl.requirementDefaults !== 'ledrix-r0') out.push(`the default requirement set "${String(tpl.requirementDefaults)}"`);
  return out;
}
