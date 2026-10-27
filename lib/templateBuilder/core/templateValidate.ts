// ─── templateValidate — one validator for every template change (Template Builder, increment 1) ─────────────
//
// Run at three points, always the same function: on an incoming proposal (before anyone reviews it), as each op
// is applied, and at publish. An AI proposal is held to exactly the rules a hand edit is.
//
// `validateTemplate` judges a whole template. `validateOps` judges a batch against a base template and reports
// only what the batch INTRODUCES — a company template carrying an old warning must not make every new proposal
// look broken, and a proposal must not be able to hide a new error behind an old one.
//
// PURE. Type-only imports.
import type { InspectionTemplate, TemplateNode } from './InspectionTemplate';
import { parseOp, applyOp, runtimePendingFields, classifyOp, allIds, storageFields, type TemplateOp, type Predicate, type OpClass } from './templateOps';
import { ruleShapeError } from './templateRules';
import { validateStructureTypes } from './structureTypes';
import { validateTemplateRequirements } from './requirementsContract';

export type Issue = { code: string; severity: 'error' | 'warning'; nodeId?: string; message: string };

type Walked = { node: TemplateNode; active: boolean; parentId: string | null };

function walk(tpl: InspectionTemplate): Walked[] {
  const out: Walked[] = [];
  const go = (arr: TemplateNode[] | undefined, active: boolean, parentId: string | null) => {
    for (const n of arr ?? []) { out.push({ node: n, active, parentId }); go(n.children, active, n.id); go(n.trimmed, false, n.id); }
  };
  go(tpl.systems, true, null); go(tpl.trimmedSystems, false, null);
  return out;
}

const fieldsOf = (p: Predicate): string[] =>
  'all' in p ? p.all.flatMap(fieldsOf) : 'any' in p ? p.any.flatMap(fieldsOf) : [p.field];
const valuesOf = (p: Predicate): Array<{ field: string; value: string }> =>
  'all' in p ? p.all.flatMap(valuesOf) : 'any' in p ? p.any.flatMap(valuesOf) : 'anyOf' in p ? p.anyOf.map(value => ({ field: p.field, value })) : [];

/** Base id of an instance id (`plumb_wh_flue~i2` → `plumb_wh_flue`). Duplicated from taxonomy/instances so
 *  this module stays import-free for guards; verify:template-ops checks the two agree. */
export const baseOf = (id: string) => id.replace(/~i\d+$/, '');

export function validateTemplate(tpl: InspectionTemplate): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, message: string, nodeId?: string) => issues.push({ code, severity, message, ...(nodeId ? { nodeId } : {}) });
  const nodes = walk(tpl);
  const byId = new Map<string, Walked>();
  const seen = new Set<string>();

  // Two ACTIVE items with one id is an error: every record keyed by that id would belong to both. One active and
  // one set aside is a warning — harmless until someone restores it (applyOp refuses that restore). The shipped
  // default carries three of these (attic_moisture / attic_pests / attic_wiring, active under Conditions and set
  // aside under Concerns), which is why this is not an error.
  const activeSeen = new Set<string>();
  for (const w of nodes) {
    if (w.active) {
      if (activeSeen.has(w.node.id)) add('error', 'duplicate_id', `Two items share the id "${w.node.id}".`, w.node.id);
      activeSeen.add(w.node.id);
    }
  }
  for (const w of nodes) {
    if (seen.has(w.node.id) && !(w.active && activeSeen.has(w.node.id) && nodes.filter(x => x.node.id === w.node.id && x.active).length > 1)) {
      const both = nodes.filter(x => x.node.id === w.node.id);
      if (both.some(x => x.active) && both.some(x => !x.active)) add('warning', 'set_aside_duplicate', `"${w.node.label}" is both in the template and set aside; restoring the set-aside copy is refused.`, w.node.id);
      else if (!both.some(x => x.active)) add('error', 'duplicate_id', `Two set-aside items share the id "${w.node.id}".`, w.node.id);
    }
    seen.add(w.node.id);
    if (!byId.has(w.node.id) || (w.active && !byId.get(w.node.id)!.active)) byId.set(w.node.id, w);
  }
  // Rules name BASE ids; an instance resolves to its first-listed base.
  const byBase = new Map<string, Walked>();
  for (const w of nodes) { const b = baseOf(w.node.id); if (!byBase.has(b) || (w.active && !byBase.get(b)!.active)) byBase.set(b, w); }
  const fieldOn = (nid: string, aid: string) => {
    const w = byBase.get(baseOf(nid));
    return { w, a: w?.node.attributes?.find(a => a.id === aid) };
  };
  /** A rule's `field` is authored as `<nodeId>::<attrId>`; it is SPLIT here, never rebuilt. */
  const attrOf = (field: string) => { const [nid, aid] = field.split('::'); return fieldOn(nid, aid); };

  const ruleEdges = new Map<string, string[]>();
  for (const { node: n, active } of nodes) {
    const x = n as TemplateNode & Record<string, any>;
    if (!String(n.label ?? '').trim()) add('error', 'empty_label', 'An item has no name.', n.id);

    // spec fields
    const attrIds = new Set<string>();
    for (const a of n.attributes ?? []) {
      if (attrIds.has(a.id)) add('error', 'duplicate_attr', `"${n.label}" has two fields with the id "${a.id}".`, n.id);
      attrIds.add(a.id);
      const lower = a.values.map(v => v.trim().toLowerCase());
      const dupV = lower.find((v, i) => lower.indexOf(v) !== i);
      if (dupV) add('error', 'duplicate_value', `"${n.label} — ${a.label}" lists "${dupV}" twice.`, n.id);
      if (a.values.some(v => !v.trim())) add('error', 'empty_value', `"${n.label} — ${a.label}" has an empty choice.`, n.id);
    }

    // conditional loading
    if (x.appliesWhen !== undefined) {
      const p = x.appliesWhen as Predicate;
      const deps: string[] = [];
      // A rule the runtime cannot express is refused here, before it can reach an inspection (templateRules: an
      // uncompilable rule would leave the item always shown — permissive, but not what the company wrote).
      const shape = ruleShapeError(p);
      if (shape) add('error', 'rule_unsupported', `"${n.label}": this rule can't be used in inspections — ${shape}.`, n.id);
      for (const f of fieldsOf(p)) {
        const { w, a } = attrOf(f);
        if (!w) { add('error', 'rule_missing_item', `"${n.label}" loads on "${f}", which is not in the template.`, n.id); continue; }
        if (!a) { add('error', 'rule_missing_field', `"${n.label}" loads on "${f}", but that item has no such field.`, n.id); continue; }
        if (baseOf(w.node.id) === baseOf(n.id)) add('error', 'rule_self', `"${n.label}" cannot load on its own answer.`, n.id);
        if (!w.active && active) add('warning', 'rule_on_set_aside', `"${n.label}" loads on "${w.node.label}", which is set aside — it will never load.`, n.id);
        deps.push(baseOf(w.node.id));
      }
      for (const { field, value } of valuesOf(p)) {
        const { a } = attrOf(field);
        if (a && !a.values.includes(value)) add('warning', 'rule_unknown_value', `"${n.label}" loads on "${value}", which "${a.label}" does not offer.`, n.id);
      }
      ruleEdges.set(baseOf(n.id), deps);
    }
    if (x.whenUnknown !== undefined && x.appliesWhen === undefined) add('warning', 'when_unknown_without_rule', `"${n.label}" says what to do when its rule is unanswered, but has no rule.`, n.id);

    // finding shortcuts
    if (Array.isArray(x.findingShortcuts)) {
      const ids = x.findingShortcuts.map((s: any) => s.id);
      const dup = ids.find((id: string, i: number) => ids.indexOf(id) !== i);
      if (dup) add('error', 'duplicate_shortcut', `"${n.label}" has two shortcuts with the id "${dup}".`, n.id);
      if (n.condition !== true && x.findingShortcuts.length) add('warning', 'shortcuts_without_condition', `"${n.label}" has finding shortcuts but is not assessed.`, n.id);
    }

    // title from an answer, grouping under a card
    if (x.titleFrom && !(n.attributes ?? []).some(a => a.id === x.titleFrom.attrId)) add('error', 'title_missing_field', `"${n.label}" takes its title from a field it does not have.`, n.id);
    if (x.groupUnder) {
      const { w, a } = fieldOn(x.groupUnder.nodeId, x.groupUnder.attrId);
      if (!w || !a) add('error', 'group_missing_host', `"${n.label}" is grouped under a spec field that is not in the template.`, n.id);
    }

    // linked records — one record, at its home
    if (n.pointsTo) {
      const home = byId.get(n.pointsTo.nodeId);
      if (!home) add('error', 'link_missing_home', `"${n.label}" links to a record that is not in the template.`, n.id);
      else {
        if (home.node.pointsTo) add('error', 'link_to_link', `"${n.label}" links to another link instead of the record.`, n.id);
        if (active && !home.active) add('error', 'link_home_set_aside', `"${n.label}" links to "${home.node.label}", which is set aside — restore it or remove the link.`, n.id);
      }
      if ((n.children ?? []).length || (n.attributes ?? []).length || n.condition !== undefined) add('error', 'link_holds_content', `"${n.label}" is a link; the record it points to holds the fields and assessment.`, n.id);
    }

    if (n.kind === 'component' && (n.children ?? []).length) add('warning', 'component_has_children', `"${n.label}" is a component with items under it.`, n.id);
  }

  // loading rules must not chase each other in a circle
  const state = new Map<string, 1 | 2>();
  const cyc = (id: string, path: string[]): string[] | null => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...path, id];
    state.set(id, 1);
    for (const d of ruleEdges.get(id) ?? []) { const c = cyc(d, [...path, id]); if (c) return c; }
    state.set(id, 2);
    return null;
  };
  for (const id of ruleEdges.keys()) {
    const c = cyc(id, []);
    if (c) { add('error', 'rule_cycle', `Loading rules go in a circle: ${c.join(' → ')}.`, c[0]); break; }
  }
  // building types (2026-10-24) — which of these systems each kind of building starts with
  for (const i of validateStructureTypes(tpl)) add(i.severity, i.code, i.message);
  // requirements (Phase A, 2026-10-25) — the company's requirements, default-set pin and overrides
  for (const i of validateTemplateRequirements(tpl)) add(i.severity, i.code, i.message);
  return issues;
}

export type OpReport = {
  index: number;
  ok: boolean;                       // parsed AND applied AND introduced no error
  class?: OpClass; classReason?: string;
  errors: Issue[]; warnings: Issue[];
};
export type BatchReport = { ok: boolean; ops: OpReport[]; result: InspectionTemplate; introduced: Issue[] };

const key = (i: Issue) => `${i.code}|${i.nodeId ?? ''}|${i.message}`;

/** Judge a proposed batch op by op, in order. Each op is held responsible for exactly the issues IT introduces
 *  (the template is validated before and after that op). An op that fails to parse, fails to apply, or
 *  introduces an error is NOT applied, so every later op is judged against the template without it — an AI's
 *  twentieth op is neither hidden behind its third nor blamed for it. (Corrected 2026-10-17, increment 2: this
 *  used to validate once at the end and pin each new issue on the LAST op that touched its item, which blamed a
 *  harmless later edit and kept the op that actually broke the rule.) `result` is the template with every
 *  passing op applied — a preview, never a write. */
export function validateOps(base: InspectionTemplate, raw: readonly unknown[]): BatchReport {
  const baseKeys = new Set(validateTemplate(base).map(key));
  let cur = base;
  let curKeys = baseKeys;
  const reports: OpReport[] = [];
  for (let index = 0; index < raw.length; index++) {
    const r: OpReport = { index, ok: false, errors: [], warnings: [] };
    reports.push(r);
    const p = parseOp(raw[index]);
    if ('error' in p) { r.errors.push({ code: 'schema', severity: 'error', message: p.error }); continue; }
    if (p.op.op === 'unaddNode' || p.op.op === 'reinsertNode') { r.errors.push({ code: 'rollback_only', severity: 'error', message: 'Only an undo can remove an added item outright; set it aside instead.' }); continue; }
    if (storageFields(p.op, cur).length) { r.errors.push({ code: 'storage_field', severity: 'error', message: 'legacyBareKey decides where answers are stored; only Ledrix sets it.' }); continue; }
    const c = classifyOp(p.op, cur);
    r.class = c.class; r.classReason = c.reason;
    const a = applyOp(cur, p.op);
    if ('error' in a) { r.errors.push({ code: a.error.code, severity: 'error', message: a.error.message }); continue; }
    const after = validateTemplate(a.tpl);
    const mine = after.filter(i => !curKeys.has(key(i)));
    for (const i of mine) (i.severity === 'error' ? r.errors : r.warnings).push(i);
    if (r.errors.length) continue;                      // introduced an error: not applied
    cur = a.tpl; curKeys = new Set(after.map(key)); r.ok = true;
    const pending = runtimePendingFields(p.op);
    if (pending.length) r.warnings.push({ code: 'runtime_pending', severity: 'warning', message: `Saved in the draft, but inspections do not use ${pending.join(', ')} yet.` });
  }
  const introduced = validateTemplate(cur).filter(i => !baseKeys.has(key(i)));
  return { ok: reports.every(r => r.ok), ops: reports, result: cur, introduced };
}

/** Ids in `tpl` — re-exported for producers that mint ids and must avoid collisions. */
export { allIds };
export type { TemplateOp };
