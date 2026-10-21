// ─── templateRules — ONE rule model: what the company authors becomes what the inspection runs ─────────
//
// 2026-10-21, parity remediation (DECISIONS 2026-10-16 rulings 1 + (second) 1, 2, 6; 2026-10-17 (second)).
//
// Template Builder authors `appliesWhen` / `whenUnknown` (templateOps.Predicate: EXACT values, `typed`, `all`,
// `any`). The runtime resolver (taxonomy/applicability.ts) reads spec predicates (`requires`) and the shipped
// `dependsOnSpec`. Two vocabularies, one of them read — so a company rule did nothing on the phone. This module
// is the single translation between them, and the single place an inspection's EFFECTIVE rules are decided:
//
//   compileAppliesWhen  template rule  → runtime predicates (exact match, origin 'template')
//   captureRuleDefinitions  a resolved template + the Ledrix pack → the frozen rule set a new inspection keeps
//
// Captured ONCE, at inspection creation (inspectionTemplateStore.createInspectionSnapshot), into
// `template.ruleDefinitions`. From then on the inspection reads ONLY those rules — a later pack or company-template
// change cannot alter it (ruling 1). An inspection without them (every one created before this) keeps the documented
// legacy fallback: live pack rules, with any rule its template carries laid over them (2026-10-16 (third) 9).
//
// ── PURE, NO IMPORTS ─────────────────────────────────────────────────────────────────────────────────────
// Same discipline as applicability.ts and templateOps.ts: a guard loads and EXECUTES it, and the desktop workspace
// (ledrixlabs-web lib/templateBuilder/core) carries a byte-identical copy, so the inspector preview and the phone
// compile a rule the same way. Spec storage keys and the pack are the caller's; both are injected.
//
// ── FAIL PERMISSIVE ──────────────────────────────────────────────────────────────────────────────────────
// A rule that cannot be compiled never narrows scope: the item stays applicable and the reason is recorded on the
// node's definition (`error`). The validator refuses such a rule before it can be published (rule_unsupported), so
// reaching this path means malformed stored data — and hiding inspection work on malformed data is the one failure
// this engine is never allowed.

/** The template's authored rule (templateOps.Predicate), restated structurally so this module imports nothing. */
export type AuthoredRule =
  | { field: string; anyOf: string[] }
  | { field: string; typed: true }
  | { all: AuthoredRule[] }
  | { any: AuthoredRule[] };

/** A runtime spec predicate (applicability.SpecPredicate) as this module emits it. `exact` switches the resolver
 *  from substring fragments to whole-value equality (decision 1, 2026-10-17: "gas" must not match "Natural Gas"
 *  by accident). `origin: 'template'` marks a company-authored rule: typeConditions never mistakes it for a
 *  Ledrix per-type condition CARD, so authoring a rule cannot change how Scope lays an item out. */
export type CompiledPredicate = {
  specNodeId: string;
  includes: string[];
  exact: true;
  origin: 'template';
  unlisted?: string[];
  whenUnanswered?: 'not_applicable';
};

export type RuleFieldResolver = {
  /** The spec STORAGE key a rule field (`<baseNodeId>::<attrId>`) reads — the key Scope writes the answer under.
   *  Null when the template has no such node or field. */
  keyFor: (baseNodeId: string, attrId: string) => string | null;
  /** The values the field offers (for `typed`: an answer outside them was typed under Other). */
  optionsFor: (baseNodeId: string, attrId: string) => readonly string[] | null;
};

export type CompileResult = { ok: true; requires: CompiledPredicate[] } | { ok: false; reason: string };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const splitField = (f: unknown): [string, string] | null => {
  if (typeof f !== 'string') return null;
  const m = /^([^:]+)::([^:]+)$/.exec(f);
  return m ? [m[1], m[2]] : null;
};

type Leaf = { field: string; anyOf?: string[]; typed?: true };

/** An `all` clause: one or more leaves on ONE field, OR-ed (a leaf, or an `any` of leaves sharing a field). */
function clauseOf(p: unknown): Leaf[] | string {
  if (!isObj(p)) return 'rule must be an object';
  if ('any' in p) {
    const xs = p.any;
    if (!Array.isArray(xs) || !xs.length) return 'any must be a non-empty list';
    const leaves: Leaf[] = [];
    for (const x of xs) {
      const c = clauseOf(x);
      if (typeof c === 'string') return c;
      leaves.push(...c);
    }
    const fields = new Set(leaves.map(l => l.field));
    if (fields.size > 1) return 'an "any" rule may only offer choices of ONE field';
    return leaves;
  }
  if ('all' in p) return 'an "all" rule cannot sit inside an "any"';
  if (typeof p.field !== 'string') return 'rule field missing';
  if (p.typed === true) return [{ field: p.field, typed: true }];
  if (Array.isArray(p.anyOf) && p.anyOf.length && p.anyOf.every(v => typeof v === 'string')) return [{ field: p.field, anyOf: p.anyOf as string[] }];
  return 'rule must name values (anyOf) or typed';
}

/** The AND-ed clauses of a rule: `all` flattens (nested `all` too); anything else is one clause. */
function clausesOf(p: unknown): Leaf[][] | string {
  if (isObj(p) && 'all' in p) {
    const xs = p.all;
    if (!Array.isArray(xs) || !xs.length) return 'all must be a non-empty list';
    const out: Leaf[][] = [];
    for (const x of xs) {
      const c = clausesOf(x);
      if (typeof c === 'string') return c;
      out.push(...c);
    }
    return out;
  }
  const c = clauseOf(p);
  return typeof c === 'string' ? c : [c];
}

/** Can the runtime express this rule? Shape only — no template needed (the validator uses it). Null = yes. */
export function ruleShapeError(rule: unknown): string | null {
  const c = clausesOf(rule);
  return typeof c === 'string' ? c : null;
}

/**
 * A template rule → runtime predicates, one per AND-ed clause. `whenUnknown: 'hide'` opts every predicate out of
 * Rule 2 (unanswered → not applicable, as Ledrix's own type cards do); `'show'` or absent leaves Rule 2 as it is
 * (unanswered → the item shows and the inspector decides).
 */
export function compileAppliesWhen(rule: unknown, whenUnknown: unknown, fields: RuleFieldResolver): CompileResult {
  const clauses = clausesOf(rule);
  if (typeof clauses === 'string') return { ok: false, reason: clauses };
  const out: CompiledPredicate[] = [];
  for (const leaves of clauses) {
    const parts = splitField(leaves[0].field);
    if (!parts) return { ok: false, reason: `field must be "<nodeId>::<attrId>" (${String(leaves[0].field)})` };
    const key = fields.keyFor(parts[0], parts[1]);
    if (!key) return { ok: false, reason: `the template has no field ${leaves[0].field}` };
    const includes = [...new Set(leaves.flatMap(l => l.anyOf ?? []))];
    const typed = leaves.some(l => l.typed);
    const pred: CompiledPredicate = { specNodeId: key, includes, exact: true, origin: 'template' };
    if (typed) {
      const opts = fields.optionsFor(parts[0], parts[1]);
      if (!opts) return { ok: false, reason: `the template has no field ${leaves[0].field}` };
      pred.unlisted = [...opts];
    }
    if (whenUnknown === 'hide') pred.whenUnanswered = 'not_applicable';
    out.push(pred);
  }
  return { ok: true, requires: out };
}

// ── THE FROZEN RULE SET ──────────────────────────────────────────────────────────────────────────────────

export const RULE_DEFINITIONS_VERSION = 1;

export type RuleDefinition = {
  /** Every predicate the item answers to: the Ledrix rule it inherited (or the template's own), then the
   *  company's compiled rule. Null = universal. */
  requires: unknown[] | null;
  /** The shipped one-predicate spec rule, verbatim. Null = none. */
  dependsOnSpec: { nodeId: string; includes: readonly string[] } | null;
  /** Why the company rule was not compiled (the item stays applicable). */
  error?: string;
};

export type RuleDefinitions = { version: number; nodes: Record<string, RuleDefinition> };

/** The two pack fields a definition inherits. */
export type PackRules = { requires?: unknown; dependsOnSpec?: { nodeId: string; includes: readonly string[] } };

type RuleNode = { id: string; requires?: unknown; dependsOnSpec?: unknown; appliesWhen?: unknown; whenUnknown?: unknown; children?: readonly RuleNode[]; trimmed?: readonly RuleNode[] };

const baseOf = (id: string) => String(id).replace(/~i\d+$/, '');
const own = (n: object, k: string) => Object.prototype.hasOwnProperty.call(n, k);
const copy = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

/** One item's effective rules: the template's own rule field where it carries one (an explicit null cancels the
 *  pack's), else the pack's; then the company's `appliesWhen`, compiled. */
export function definitionFor(node: RuleNode, pack: PackRules | undefined, fields: RuleFieldResolver): RuleDefinition {
  const inherited = own(node, 'requires') ? node.requires : pack?.requires;
  const dep = own(node, 'dependsOnSpec') ? node.dependsOnSpec : pack?.dependsOnSpec;
  const requires: unknown[] = Array.isArray(inherited) ? copy(inherited) : [];
  const def: RuleDefinition = { requires: null, dependsOnSpec: isObj(dep) && typeof dep.nodeId === 'string' && Array.isArray(dep.includes) ? copy(dep as any) : null };
  if (node.appliesWhen !== undefined && node.appliesWhen !== null) {
    const c = compileAppliesWhen(node.appliesWhen, node.whenUnknown, fields);
    if ('requires' in c) requires.push(...c.requires);
    else def.error = c.reason;
  }
  def.requires = requires.length ? requires : null;
  return def;
}

/** Every item in a template (active and set aside), keyed by BASE id — first occurrence wins, the same rule as
 *  every other per-template index (a unit `~i2` shares its definition and is scoped by ordinal at read time). */
export function captureRuleDefinitions(
  systems: readonly RuleNode[] | null | undefined,
  packRulesOf: (baseId: string) => PackRules | undefined,
  fields: RuleFieldResolver,
  into?: RuleDefinitions,
): RuleDefinitions {
  const out: RuleDefinitions = into ? { version: into.version, nodes: { ...into.nodes } } : { version: RULE_DEFINITIONS_VERSION, nodes: {} };
  const walk = (n: RuleNode) => {
    const b = baseOf(n.id);
    if (!own(out.nodes, b)) out.nodes[b] = definitionFor(n, packRulesOf(b), fields);
    for (const c of n.children ?? []) walk(c);
    for (const c of n.trimmed ?? []) walk(c);
  };
  for (const s of systems ?? []) walk(s);
  return out;
}

/** Is this a usable frozen rule set? A malformed one is treated as absent (legacy fallback) — never as "no rules",
 *  which would silently drop every Ledrix rule. */
export function isRuleDefinitions(x: unknown): x is RuleDefinitions {
  return isObj(x) && typeof x.version === 'number' && isObj(x.nodes);
}

/** The node the resolver reads for `baseId` under a frozen rule set: exactly the definition, or nothing (an id the
 *  inspection never had rules for is universal). */
export function frozenRuleNode(defs: RuleDefinitions, baseId: string): { id: string; requires?: unknown; dependsOnSpec?: { nodeId: string; includes: readonly string[] } } | undefined {
  const d = defs.nodes[baseId];
  if (!d) return undefined;
  return { id: baseId, ...(d.requires ? { requires: d.requires } : {}), ...(d.dependsOnSpec ? { dependsOnSpec: d.dependsOnSpec } : {}) };
}
