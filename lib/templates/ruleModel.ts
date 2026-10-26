// Applicability rules as the editor shows them: a list of conditions that must ALL hold.
//
// The editor offers exactly what an inspection can run and nothing more. core/templateRules (clausesOf, the compiler
// the app runs at inspection creation) accepts an AND of clauses where each clause is ONE spec field whose answer is
// one of some choices, optionally "or an answer typed in". There is no OR across fields, no presence atom and no
// accessibility atom (ADR 2026-10-25 §4 M2: an item that can't be reached is a LIMITATION, recorded by the inspector,
// never a rule that hides it). So a condition here is { field, values, typed } and a rule is a list of them.
//
// PURE: no React, no store, no clock.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';

export type Condition = { field: string; values: string[]; typed: boolean };
/** `ok: false` = the stored rule has a shape this editor can't show as conditions (it is shown as-is, never rewritten). */
export type RuleView = { ok: true; conditions: Condition[] } | { ok: false; reason: string };

type Leaf = { field: string; anyOf?: string[]; typed?: true };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function leavesOf(p: unknown): Leaf[] | string {
  if (!isObj(p)) return 'not a rule';
  if ('any' in p) {
    if (!Array.isArray(p.any) || !p.any.length) return 'an empty "any"';
    const out: Leaf[] = [];
    for (const x of p.any) { const l = leavesOf(x); if (typeof l === 'string') return l; out.push(...l); }
    return new Set(out.map(l => l.field)).size === 1 ? out : 'an "any" over more than one field';
  }
  if ('all' in p) return 'an "all" inside an "any"';
  if (typeof p.field !== 'string') return 'a condition with no field';
  if (p.typed === true) return [{ field: p.field, typed: true }];
  if (Array.isArray(p.anyOf) && p.anyOf.every(v => typeof v === 'string')) return [{ field: p.field, anyOf: p.anyOf as string[] }];
  return 'a condition with no answers';
}

function clausesOf(p: unknown): Leaf[][] | string {
  if (isObj(p) && 'all' in p) {
    if (!Array.isArray(p.all) || !p.all.length) return 'an empty "all"';
    const out: Leaf[][] = [];
    for (const x of p.all) { const c = clausesOf(x); if (typeof c === 'string') return c; out.push(...c); }
    return out;
  }
  const l = leavesOf(p);
  return typeof l === 'string' ? l : [l];
}

/** A stored `appliesWhen` → the conditions the editor shows. Absent = no conditions (always applies). */
export function readRule(rule: unknown): RuleView {
  if (rule === undefined || rule === null) return { ok: true, conditions: [] };
  const clauses = clausesOf(rule);
  if (typeof clauses === 'string') return { ok: false, reason: clauses };
  return {
    ok: true,
    conditions: clauses.map(leaves => ({
      field: leaves[0].field,
      values: [...new Set(leaves.flatMap(l => l.anyOf ?? []))],
      typed: leaves.some(l => l.typed === true),
    })),
  };
}

/** Conditions → the stored rule, in the smallest shape the runtime accepts. `null` = no rule (removes the field).
 *  A condition with nothing picked is incomplete and is left out. */
export function writeRule(conditions: readonly Condition[]): unknown | null {
  const clauses = conditions.filter(c => c.field && (c.values.length || c.typed)).map(c => {
    const leaves: Leaf[] = [
      ...(c.values.length ? [{ field: c.field, anyOf: [...c.values] }] : []),
      ...(c.typed ? [{ field: c.field, typed: true as const }] : []),
    ];
    return leaves.length === 1 ? leaves[0] : { any: leaves };
  });
  if (!clauses.length) return null;
  return clauses.length === 1 ? clauses[0] : { all: clauses };
}

/** A spec field a rule can test: `<nodeId>::<attrId>`, with where it lives and the choices it offers. */
export type RuleField = { field: string; nodeId: string; attrId: string; label: string; path: string; values: string[]; typed: boolean };

const baseOf = (id: string) => id.replace(/~i\d+$/, '');

/** Every spec field in the template's active items, in template order. `except`: the item the rule is for — an item
 *  can't load on its own answer (templateValidate `rule_self`). Set-aside items are not offered. */
export function ruleFields(tree: InspectionTemplate, except?: string): RuleField[] {
  const out: RuleField[] = [];
  const walk = (n: TemplateNode, trail: string[]) => {
    const here = [...trail, n.label];
    if (n.kind === 'component' && !n.pointsTo && (!except || baseOf(n.id) !== baseOf(except))) {
      for (const a of n.attributes ?? []) {
        out.push({
          field: `${n.id}::${a.id}`, nodeId: n.id, attrId: a.id, label: a.label, path: here.join(' › '),
          values: [...a.values], typed: (a as typeof a & { allowTyped?: boolean }).allowTyped === true,
        });
      }
    }
    (n.children ?? []).forEach(c => walk(c, here));
  };
  tree.systems.forEach(s => walk(s, []));
  return out;
}

/** One condition in words, for summaries: "Heating System — Fuel Source is Gas or Oil". */
export function describeCondition(c: Condition, fields: readonly RuleField[]): string {
  const f = fields.find(x => x.field === c.field);
  const name = f ? `${f.path.split(' › ').slice(-1)[0]} — ${f.label}` : c.field;
  const answers = [...c.values.map(v => `“${v}”`), ...(c.typed ? ['an answer typed in'] : [])];
  return `${name} is ${answers.length ? answers.join(' or ') : '(nothing picked)'}`;
}
