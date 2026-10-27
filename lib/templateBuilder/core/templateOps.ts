// ─── templateOps — the ONLY way a company template changes (Template Builder, increment 1, 2026-10-17) ───────
//
// Every producer of template changes — the owner editing by hand, Ledrix's AI drafting a section, onboarding
// answers, a Ledrix default update, an inspector's suggestion from the field, an import — emits the same closed
// set of OPERATIONS. One schema, one parser, one applier, one inverse, one classifier. Review, provenance and
// rollback (templateChangeSets.ts) and validation (templateValidate.ts) sit on top of this and nothing else.
//
// WHY AI-FIRST FROM THE START (owner, 2026-10-17): "AI-assisted template generation is a core product
// requirement." So the schema is JSON-native (no `undefined`; `null` removes a field), the parser is strict
// (an unknown key or a wrong type is refused, never coerced), and every op names its target by id, so a model's
// output can be checked op by op before an owner ever sees it. Manual editing is simply a change set the owner
// approved as they made it — there is no second, manual-only path to redesign later.
//
// PURE. Type-only imports, no store, no clock, no randomness: ids are minted by the PRODUCER and carried in the
// op, so applying the same ops to the same template always gives the same template (and the same hash).
//
// WHAT IS NOT HERE YET (by design, increment 1):
//   · Nothing in the app calls this. customTemplateService's editor functions are proven EQUIVALENT to their
//     op form by verify:template-ops; switching them over is the next increment.
//   · Fields marked RUNTIME_PENDING are authored and validated here, but no consumer reads them until the shared
//     template runtime lands. validateOps warns on every op that writes one, so a draft never looks more live
//     than it is.
import type { InspectionTemplate, TemplateNode } from './InspectionTemplate';

// ── field registries ────────────────────────────────────────────────────────────────────────────────────────

export type OpClass = 'content' | 'policy';
type FieldSpec = { check: (v: unknown) => string | null; class: OpClass; pending?: true; why: string };

const str = (v: unknown) => (typeof v === 'string' ? null : 'must be text');
const nonEmpty = (v: unknown) => (typeof v === 'string' && v.trim() ? null : 'must be non-empty text');
const bool = (v: unknown) => (typeof v === 'boolean' ? null : 'must be true or false');
const strList = (v: unknown) =>
  Array.isArray(v) && v.every(x => typeof x === 'string' && x.trim()) ? null : 'must be a list of non-empty text';
const oneOf = (...xs: string[]) => (v: unknown) => (xs.includes(v as string) ? null : `must be one of ${xs.join(' | ')}`);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (v: Record<string, unknown>, allowed: string[]) => {
  const extra = Object.keys(v).filter(k => !allowed.includes(k));
  return extra.length ? `unknown key(s): ${extra.join(', ')}` : null;
};

/** Internal finding tiers a shortcut may pre-fill (SeverityConfig ids; the inspector still confirms). */
export const SHORTCUT_PRIORITIES = ['critical', 'deficiency', 'maintenance', 'characteristic'] as const;

/** Conditional loading. EXACT values (decision 1, 2026-10-17): substring matching is how "gas" once matched
 *  both "Gas Furnace" and "Natural Gas". `field` is `<baseNodeId>::<attrId>`. `typed` matches an answer the
 *  inspector typed under Other — the only way a value outside the list can drive a rule. */
export type Predicate =
  | { field: string; anyOf: string[] }
  | { field: string; typed: true }
  | { all: Predicate[] }
  | { any: Predicate[] };

export type FindingShortcut = { id: string; label: string; guidance?: string; defaultPriority?: typeof SHORTCUT_PRIORITIES[number] };

export function checkPredicate(p: unknown, depth = 0): string | null {
  if (depth > 6) return 'rule nests too deeply';
  if (!obj(p)) return 'rule must be an object';
  if ('all' in p || 'any' in p) {
    const k = 'all' in p ? 'all' : 'any';
    const bad = onlyKeys(p, [k]); if (bad) return bad;
    const xs = p[k];
    if (!Array.isArray(xs) || !xs.length) return `${k} must be a non-empty list`;
    for (const x of xs) { const e = checkPredicate(x, depth + 1); if (e) return e; }
    return null;
  }
  if (typeof p.field !== 'string' || !/^[^:]+::[^:]+$/.test(p.field)) return 'field must be "<nodeId>::<attrId>"';
  if ('typed' in p) return onlyKeys(p, ['field', 'typed']) ?? (p.typed === true ? null : 'typed must be true');
  return onlyKeys(p, ['field', 'anyOf']) ?? strList(p.anyOf) ?? ((p.anyOf as unknown[]).length ? null : 'anyOf must not be empty');
}

function checkShortcuts(v: unknown): string | null {
  if (!Array.isArray(v)) return 'must be a list';
  for (const s of v) {
    if (!obj(s)) return 'each shortcut must be an object';
    const e = onlyKeys(s, ['id', 'label', 'guidance', 'defaultPriority'])
      ?? (nonEmpty(s.id) && 'shortcut id must be non-empty text') ?? (nonEmpty(s.label) && 'shortcut label must be non-empty text')
      ?? (s.guidance !== undefined ? str(s.guidance) : null)
      ?? (s.defaultPriority !== undefined ? oneOf(...SHORTCUT_PRIORITIES)(s.defaultPriority) : null);
    if (e) return e;
  }
  return null;
}

/** Fields `setNodeField` may write. Everything else on a node is structural (id, kind, children, pockets,
 *  instanceOf), owned by its own op (attributes, pointsTo), snapshot-only (inScope), or deprecated (options,
 *  facet, limitationOptions — "never write them", S4). */
export const NODE_FIELDS: Record<string, FieldSpec> = {
  label:            { check: nonEmpty, class: 'content', why: 'wording' },
  description:      { check: str, class: 'content', why: 'guidance wording' },
  icon:             { check: str, class: 'content', why: 'presentation' },
  keywords:         { check: strList, class: 'content', why: 'voice and routing vocabulary' },
  locationAxis:     { check: oneOf('room', 'elevation', 'none'), class: 'content', why: 'where findings are located' },
  walkZones:        { check: strList, class: 'content', why: 'where the inspector meets it' },
  trimmedOptions:   { check: strList, class: 'content', why: 'spec values set aside, restorable' },
  condition:        { check: bool, class: 'policy', why: 'whether this item is assessed (inspection work)' },
  method:           { check: strList, class: 'policy', why: 'method values are disclosures in the report' },
  limitations:      { check: strList, class: 'policy', why: 'limitation reasons are disclosures in the report' },
  defaultActive:    { check: bool, class: 'policy', why: 'what a new inspection covers' },
  appliesToTypes:   { check: strList, class: 'policy', why: 'when this item is inspected (legacy Equipment Types)' },
  equipmentTypes:   { check: (v) => (Array.isArray(v) && v.every(t => obj(t) && !onlyKeys(t, ['id', 'label', 'matchKeywords']) && !nonEmpty(t.id) && !nonEmpty(t.label) && !strList(t.matchKeywords)) ? null : 'must be a list of {id, label, matchKeywords}'), class: 'policy', why: 'when items are inspected (legacy Equipment Types)' },
  // LIVE since 2026-10-21 (one rule model): compiled into the inspection's frozen rules at creation (templateRules.ts).
  appliesWhen:      { check: (v) => checkPredicate(v), class: 'policy', why: 'when this item is inspected' },
  whenUnknown:      { check: oneOf('show', 'hide'), class: 'policy', why: 'whether an unanswered rule shows the item' },
  methodPrompt:     { check: nonEmpty, class: 'content', pending: true, why: 'the method question wording' },
  findingShortcuts: { check: checkShortcuts, class: 'content', pending: true, why: 'finding shortcuts' },
  titleFrom:        { check: (v) => (obj(v) ? onlyKeys(v, ['attrId', 'map']) ?? nonEmpty(v.attrId) ?? (v.map === undefined || (obj(v.map) && Object.values(v.map).every(x => typeof x === 'string')) ? null : 'map must be {value: title}') : 'must be {attrId, map?}'), class: 'content', pending: true, why: 'title from an answer' },
  groupUnder:       { check: (v) => (obj(v) ? onlyKeys(v, ['nodeId', 'attrId']) ?? nonEmpty(v.nodeId) ?? nonEmpty(v.attrId) : 'must be {nodeId, attrId}'), class: 'content', pending: true, why: 'shown under a spec card' },
  // Phase A (2026-10-25): the item's COMPANY requirements — the whole list, judged by templateValidate
  // (requirementsContract.validateTemplateRequirements). Pending: no inspection reads them yet. Never from Ledrix's AI.
  requirements:     { check: (v) => (Array.isArray(v) ? null : 'must be a list'), class: 'policy', pending: true, why: 'what inspectors must record for this item' },
  // 2026-10-26 (equipment component catalog): which Ledrix catalog entry an item or group was picked from —
  // `<equipmentTypeId>` on a group, `<equipmentTypeId>.<componentId>` on an item (equipmentCatalog.catalogRefOf).
  // Provenance only: nothing at inspection time reads it.
  catalogRef:       { check: (v) => (typeof v === 'string' && /^[a-z0-9_]+(\.[a-z0-9_]+)?$/.test(v) ? null : 'must be a catalog reference'), class: 'content', why: 'which catalog entry the item came from' },
};

/** Fields `setAttributeField` may write. `id` is identity; `legacyBareKey` decides where recorded values are
 *  STORED, so changing it would move answers — Ledrix-owned, never authored here. */
export const ATTR_FIELDS: Record<string, FieldSpec> = {
  label:      { check: nonEmpty, class: 'content', why: 'wording' },
  values:     { check: (v) => (Array.isArray(v) && v.every(x => typeof x === 'string' && x.trim()) ? null : 'must be a list of non-empty text'), class: 'content', why: 'the choices offered' },
  multi:      { check: bool, class: 'content', why: 'one answer or several' },
  allowTyped: { check: bool, class: 'content', pending: true, why: 'whether Other (typed) is offered' },
};

export const TEMPLATE_FIELDS: Record<string, FieldSpec> = {
  name:       { check: nonEmpty, class: 'content', why: 'template name' },
  advisories: { check: (v) => (Array.isArray(v) ? null : 'must be a list'), class: 'policy', why: 'report advisories are disclosures' },
  // 2026-10-24: the building types (templates/structureTypes.ts) — validated as a whole by templateValidate
  structureTypes: { check: (v) => (Array.isArray(v) ? null : 'must be a list'), class: 'policy', why: 'which systems each kind of building starts with' },
  // Phase A (2026-10-25): the pinned Ledrix default requirement set, and company overrides of it (validated as a whole).
  requirementDefaults:  { check: (v) => (typeof v === 'string' && v.trim() ? null : 'must be a default set id'), class: 'policy', why: 'which Ledrix default requirements apply' },
  requirementOverrides: { check: (v) => (obj(v) ? null : 'must be a map of requirement ids'), class: 'policy', why: 'changes to Ledrix default requirements' },
};

const NODE_KINDS = ['system', 'subsystem', 'component'];

// ── the operations ──────────────────────────────────────────────────────────────────────────────────────────

/** `null` as a field value removes the field. `expect` (optional on every write) is the hash of the value the
 *  producer saw; a mismatch is a CONFLICT and the op is refused — never silently overwritten. */
export type TemplateOp =
  | { op: 'addNode'; parentId: string | null; node: TemplateNode; index?: number; expect?: string }
  | { op: 'unaddNode'; nodeId: string; expect: string }                          // rollback ONLY
  | { op: 'reinsertNode'; parentId: string | null; index: number; node: TemplateNode; as: 'node' | 'link'; expect?: string } // rollback ONLY
  | { op: 'trimNode'; nodeId: string; pocketIndex?: number; expect?: string }
  | { op: 'restoreNode'; nodeId: string; index?: number; expect?: string }
  | { op: 'moveNode'; nodeId: string; parentId: string | null; index: number; expect?: string }
  | { op: 'setNodeField'; nodeId: string; field: string; value: unknown; expect?: string }
  | { op: 'addAttribute'; nodeId: string; attribute: Record<string, unknown>; index?: number; expect?: string }
  | { op: 'removeAttribute'; nodeId: string; attrId: string; expect?: string }
  | { op: 'setAttributeField'; nodeId: string; attrId: string; field: string; value: unknown; expect?: string }
  | { op: 'addLink'; pointerId: string; homeId: string; parentId: string; label?: string; index?: number; expect?: string }
  | { op: 'removeLink'; pointerId: string; expect?: string }
  | { op: 'setTemplateField'; field: string; value: unknown; expect?: string };

export type OpKind = TemplateOp['op'];
export const OP_KINDS: readonly OpKind[] = ['addNode', 'unaddNode', 'reinsertNode', 'trimNode', 'restoreNode', 'moveNode', 'setNodeField', 'addAttribute', 'removeAttribute', 'setAttributeField', 'addLink', 'removeLink', 'setTemplateField'];

const OP_KEYS: Record<OpKind, { req: string[]; opt: string[] }> = {
  addNode:           { req: ['parentId', 'node'], opt: ['index', 'expect'] },
  unaddNode:         { req: ['nodeId', 'expect'], opt: [] },
  reinsertNode:      { req: ['parentId', 'index', 'node', 'as'], opt: ['expect'] },
  trimNode:          { req: ['nodeId'], opt: ['pocketIndex', 'expect'] },
  restoreNode:       { req: ['nodeId'], opt: ['index', 'expect'] },
  moveNode:          { req: ['nodeId', 'parentId', 'index'], opt: ['expect'] },
  setNodeField:      { req: ['nodeId', 'field', 'value'], opt: ['expect'] },
  addAttribute:      { req: ['nodeId', 'attribute'], opt: ['index', 'expect'] },
  removeAttribute:   { req: ['nodeId', 'attrId'], opt: ['expect'] },
  setAttributeField: { req: ['nodeId', 'attrId', 'field', 'value'], opt: ['expect'] },
  addLink:           { req: ['pointerId', 'homeId', 'parentId'], opt: ['label', 'index', 'expect'] },
  removeLink:        { req: ['pointerId'], opt: ['expect'] },
  setTemplateField:  { req: ['field', 'value'], opt: ['expect'] },
};

export type ParseResult = { ok: true; op: TemplateOp } | { ok: false; error: string };

const isIndex = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

/** A node subtree as an op may carry it: the authorable fields only, checked with the same rules as setNodeField. */
export function checkNodeShape(n: unknown, path = 'node'): string | null {
  if (!obj(n)) return `${path} must be an object`;
  const allowed = ['id', 'label', 'kind', 'children', 'attributes', 'pointsTo', ...Object.keys(NODE_FIELDS)];
  const bad = onlyKeys(n, allowed); if (bad) return `${path}: ${bad}`;
  if (nonEmpty(n.id)) return `${path}.id must be non-empty text`;
  if (nonEmpty(n.label)) return `${path}.label must be non-empty text`;
  if (!NODE_KINDS.includes(n.kind as string)) return `${path}.kind must be one of ${NODE_KINDS.join(' | ')}`;
  for (const [k, spec] of Object.entries(NODE_FIELDS)) {
    if (k === 'label' || n[k] === undefined) continue;
    const e = spec.check(n[k]); if (e) return `${path}.${k} ${e}`;
  }
  if (n.pointsTo !== undefined) {
    const p = n.pointsTo;
    if (!obj(p) || onlyKeys(p, ['systemId', 'nodeId']) || nonEmpty(p.systemId) || nonEmpty(p.nodeId)) return `${path}.pointsTo must be {systemId, nodeId}`;
  }
  if (n.attributes !== undefined) {
    if (!Array.isArray(n.attributes)) return `${path}.attributes must be a list`;
    for (const [i, a] of n.attributes.entries()) { const e = checkAttributeShape(a); if (e) return `${path}.attributes[${i}] ${e}`; }
  }
  if (n.children !== undefined) {
    if (!Array.isArray(n.children)) return `${path}.children must be a list`;
    for (const [i, c] of n.children.entries()) { const e = checkNodeShape(c, `${path}.children[${i}]`); if (e) return e; }
  }
  return null;
}

export function checkAttributeShape(a: unknown): string | null {
  if (!obj(a)) return 'must be an object';
  const bad = onlyKeys(a, ['id', 'legacyBareKey', ...Object.keys(ATTR_FIELDS)]); if (bad) return bad;
  if (a.legacyBareKey !== undefined && a.legacyBareKey !== true) return 'legacyBareKey must be true when present';
  if (nonEmpty(a.id)) return 'id must be non-empty text';
  if (a.label === undefined || a.values === undefined) return 'needs label and values';
  for (const [k, spec] of Object.entries(ATTR_FIELDS)) {
    if (a[k] === undefined) continue;
    const e = spec.check(a[k]); if (e) return `${k} ${e}`;
  }
  return null;
}

/** Strict: an op from a model, a file or a screen is either exactly right or refused with the reason. */
export function parseOp(x: unknown): ParseResult {
  if (!obj(x)) return { ok: false, error: 'an operation must be an object' };
  const kind = x.op as OpKind;
  if (!OP_KINDS.includes(kind)) return { ok: false, error: `unknown operation "${String(x.op)}"` };
  const { req, opt } = OP_KEYS[kind];
  const extra = onlyKeys(x, ['op', ...req, ...opt]); if (extra) return { ok: false, error: `${kind}: ${extra}` };
  const missing = req.filter(k => !(k in x));
  if (missing.length) return { ok: false, error: `${kind}: missing ${missing.join(', ')}` };
  const fail = (e: string): ParseResult => ({ ok: false, error: `${kind}: ${e}` });
  for (const k of ['nodeId', 'attrId', 'pointerId', 'homeId', 'expect']) if (k in x && nonEmpty(x[k])) return fail(`${k} must be non-empty text`);
  for (const k of ['index', 'pocketIndex']) if (k in x && x[k] !== undefined && !isIndex(x[k])) return fail(`${k} must be a whole number ≥ 0`);
  if ('parentId' in x && x.parentId !== null && nonEmpty(x.parentId)) return fail('parentId must be an id or null');
  if (kind === 'addLink' && x.parentId === null) return fail('a link must sit under a section');
  if ('label' in x && x.label !== undefined && nonEmpty(x.label)) return fail('label must be non-empty text');
  if (kind === 'addNode') { const e = checkNodeShape(x.node); if (e) return fail(e); }
  // reinsertNode puts back EXACTLY what an undo took out — a link or an added item, with every key it carried
  // (including ones no producer may author, e.g. sectionType or evidenceRequirements). So its node is checked
  // for identity only, and the op itself is refused from every source except an undo (templateChangeSets,
  // templateValidate). Never authored; only ever produced by applyOp as an inverse.
  if (kind === 'reinsertNode') {
    const n = x.node;
    if (!obj(n) || nonEmpty(n.id) || nonEmpty(n.label) || !NODE_KINDS.includes(n.kind as string)) return fail('node must carry id, label and kind');
    if (x.as !== 'node' && x.as !== 'link') return fail('as must be node | link');
    if (x.as === 'link' && !obj(n.pointsTo)) return fail('a link must carry pointsTo');
  }
  if (kind === 'addAttribute') { const e = checkAttributeShape(x.attribute); if (e) return fail(`attribute ${e}`); }
  const reg = kind === 'setNodeField' ? NODE_FIELDS : kind === 'setAttributeField' ? ATTR_FIELDS : kind === 'setTemplateField' ? TEMPLATE_FIELDS : null;
  if (reg) {
    const f = reg[x.field as string];
    if (!f) return fail(`field "${String(x.field)}" cannot be authored`);
    if (x.value !== null) { const e = f.check(x.value); if (e) return fail(`${String(x.field)} ${e}`); }
    else if (x.field === 'label' || x.field === 'name' || x.field === 'values') return fail(`${String(x.field)} cannot be removed`);
  }
  return { ok: true, op: clone(x) as TemplateOp };
}

/** A model's whole answer: `[...]` or `{ ops: [...] }`. Each op is judged on its own — one bad op never hides
 *  the good ones, and never lets itself through. */
export function parseOps(x: unknown): Array<ParseResult & { index: number }> {
  const arr = Array.isArray(x) ? x : obj(x) && Array.isArray(x.ops) ? x.ops : null;
  if (!arr) return [{ index: 0, ok: false, error: 'expected a list of operations' }];
  return arr.map((o, index) => ({ index, ...parseOp(o) }));
}

// ── canonical form + hash ───────────────────────────────────────────────────────────────────────────────────

function clone<T>(x: T): T { return x === undefined ? x : JSON.parse(JSON.stringify(x)); }

const EMPTY_POCKETS = new Set(['trimmed', 'trimmedSystems', 'trimmedOptions']);
/** Two templates that mean the same thing have the same canonical form: key order ignored, `undefined` dropped,
 *  and empty trim pockets dropped (the legacy editor leaves `trimmed: []` on every node it walks). */
export function canonical(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(canonical);
  if (!obj(x)) return x;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(x).sort()) {
    const v = x[k];
    if (v === undefined) continue;
    if (EMPTY_POCKETS.has(k) && Array.isArray(v) && v.length === 0) continue;
    out[k] = canonical(v);
  }
  return out;
}

function fnv(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
/** Stable content hash. Used for `expect` conflict checks and draft revisions — not for security. */
export function hashOf(x: unknown): string {
  const s = x === undefined ? '\u0000absent' : JSON.stringify(canonical(x));
  return fnv(s, 2166136261) + fnv(s, 0x9747b28c);
}
export const templateHash = (tpl: InspectionTemplate): string => hashOf(tpl);

// ── locating nodes ──────────────────────────────────────────────────────────────────────────────────────────

type N = TemplateNode & Record<string, any>;
type Where = { arr: N[]; index: number; parent: N | null; pocket: boolean };

/** Where a node lives: an active list (systems / children) or a trim pocket (trimmedSystems / trimmed). */
function locate(tpl: InspectionTemplate, id: string): Where | null {
  const scan = (arr: N[] | undefined, parent: N | null, pocket: boolean): Where | null => {
    if (!arr) return null;
    const i = arr.findIndex(n => n.id === id);
    if (i >= 0) return { arr, index: i, parent, pocket };
    for (const n of arr) {
      const hit = scan(n.children as N[], n, false) ?? scan(n.trimmed as N[], n, true);
      if (hit) return hit;
    }
    return null;
  };
  // Active first: when an id is both active and set aside (three in the shipped default), an edit means the
  // active item.
  return locateActive(tpl, id) ?? scan(tpl.systems as N[], null, false) ?? scan(tpl.trimmedSystems as N[], null, true);
}
/** The set-aside copy of `id`, if any. */
function locatePocket(tpl: InspectionTemplate, id: string): Where | null {
  const scan = (arr: N[] | undefined, parent: N | null): Where | null => {
    for (const n of arr ?? []) {
      const i = (n.trimmed ?? []).findIndex(c => c.id === id);
      if (i >= 0) return { arr: n.trimmed as N[], index: i, parent: n, pocket: true };
      const hit = scan(n.children as N[], n); if (hit) return hit;
    }
    return null;
  };
  const top = (tpl.trimmedSystems ?? []).findIndex(n => n.id === id);
  return top >= 0 ? { arr: tpl.trimmedSystems as N[], index: top, parent: null, pocket: true } : scan(tpl.systems as N[], null);
}
/** Active = reachable through `systems`/`children` only, never through a pocket. */
function locateActive(tpl: InspectionTemplate, id: string): Where | null {
  const scan = (arr: N[] | undefined, parent: N | null): Where | null => {
    if (!arr) return null;
    const i = arr.findIndex(n => n.id === id);
    if (i >= 0) return { arr, index: i, parent, pocket: false };
    for (const n of arr) { const hit = scan(n.children as N[], n); if (hit) return hit; }
    return null;
  };
  return scan(tpl.systems as N[], null);
}
export function allIds(tpl: InspectionTemplate): string[] {
  const out: string[] = [];
  const walk = (arr?: TemplateNode[]) => { for (const n of arr ?? []) { out.push(n.id); walk(n.children); walk(n.trimmed); } };
  walk(tpl.systems); walk(tpl.trimmedSystems);
  return out;
}
const subtreeIds = (n: TemplateNode): string[] => [n.id, ...(n.children ?? []).flatMap(subtreeIds), ...(n.trimmed ?? []).flatMap(subtreeIds)];
function rootOf(tpl: InspectionTemplate, id: string): string | null {
  for (const s of tpl.systems) if (s.id === id || subtreeIds(s).includes(id)) return s.id;
  return null;
}
const isDescendant = (n: TemplateNode, id: string): boolean => (n.children ?? []).some(c => c.id === id || isDescendant(c, id));

// ── applying ────────────────────────────────────────────────────────────────────────────────────────────────

export type OpError = { code: 'not_found' | 'conflict' | 'invalid' | 'duplicate_id' | 'refused'; message: string };
export type ApplyResult = { ok: true; tpl: InspectionTemplate; inverse: TemplateOp } | { ok: false; error: OpError };

const err = (code: OpError['code'], message: string): ApplyResult => ({ ok: false, error: { code, message } });
const listOf = (tpl: InspectionTemplate, parentId: string | null): N[] | null => {
  if (parentId === null) return tpl.systems as N[];
  const w = locateActive(tpl, parentId);
  if (!w) return null;
  const p = w.arr[w.index];
  return (p.children ?? (p.children = [])) as N[];
};
const pocketOf = (tpl: InspectionTemplate, parent: N | null): N[] =>
  (parent ? (parent.trimmed ?? (parent.trimmed = [])) : (tpl.trimmedSystems ?? (tpl.trimmedSystems = []))) as N[];
const dropEmptyPocket = (tpl: InspectionTemplate, parent: N | null) => {
  if (parent) { if (parent.trimmed && !parent.trimmed.length) delete parent.trimmed; }
  else if (tpl.trimmedSystems && !tpl.trimmedSystems.length) delete tpl.trimmedSystems;
};
const parentIdOf = (w: Where) => (w.parent ? w.parent.id : null);
/** A component carries no `children` key until something is placed under it (226 of 226 in the default
 *  template), so taking its last child away removes the key again — otherwise every undo would leave a
 *  `children: []` behind and the template would not hash back to where it started. Sections keep `[]`,
 *  which is the shape the editor gives a new, empty section. */
/** ── WHERE AN OP EXPECTS TO FIND THINGS (conflict anchors for structural ops) ─────────────────────────────
 *  A field write carries the hash of the value it replaces. A STRUCTURAL op carries where it expects the item
 *  to be — its parent, active-or-set-aside, and position — or, for an insert at a position, the ids of the list
 *  it inserts into. Every inverse carries one, so an undo that would move, set aside, restore or remove an item
 *  someone has since moved, restored or edited is refused instead of silently undoing that later work. */
export const positionHash = (parentId: string | null, pocket: boolean, index: number) => hashOf({ parentId, pocket, index });
const posOf = (w: Where) => positionHash(parentIdOf(w), w.pocket, w.index);
const listHash = (list: readonly { id: string }[]) => hashOf(list.map(n => n.id));
const placedHash = (node: unknown, w: Where) => hashOf({ node, at: posOf(w) });

const collapse = (parent: N | null) => { if (parent && parent.kind === 'component' && parent.children && !parent.children.length) delete parent.children; };

/** Apply ONE op. Never mutates `tpl`. The inverse, applied to the result, restores a template with the same hash. */
export function applyOp(tpl: InspectionTemplate, op: TemplateOp): ApplyResult {
  const parsed = parseOp(op);
  if ('error' in parsed) return err('invalid', parsed.error);
  const t = clone(tpl);
  const conflict = (cur: unknown, expect?: string) => expect !== undefined && hashOf(cur) !== expect;

  switch (op.op) {
    case 'addNode': {
      const list = listOf(t, op.parentId);
      if (!list) return err('not_found', `section "${op.parentId}" is not in the template`);
      const node = clone(op.node);
      const existing = new Set(allIds(t));
      const ids = subtreeIds(node);
      const dup = ids.find((id, i) => existing.has(id) || ids.indexOf(id) !== i);
      if (dup) return err('duplicate_id', `id "${dup}" is already used in this template`);
      if (op.expect !== undefined && listHash(list) !== op.expect) return err('conflict', 'that section changed since this was proposed');
      const index = op.index ?? list.length;
      if (index > list.length) return err('invalid', `index ${index} is past the end (${list.length})`);
      list.splice(index, 0, node as N);
      const at = locateActive(t, node.id)!;
      return { ok: true, tpl: t, inverse: { op: 'unaddNode', nodeId: node.id, expect: placedHash(node, at) } };
    }
    case 'reinsertNode': {
      const list = listOf(t, op.parentId);
      if (!list) return err('not_found', `section "${op.parentId}" is not in the template`);
      if (op.expect !== undefined && listHash(list) !== op.expect) return err('conflict', 'that section changed since this was undone; undo the later changes first');
      const node = clone(op.node);
      const existing = new Set(allIds(t));
      const dup = subtreeIds(node).find(id => existing.has(id));
      if (dup) return err('duplicate_id', `id "${dup}" is already used in this template`);
      if (op.index > list.length) return err('invalid', `index ${op.index} is past the end (${list.length})`);
      list.splice(op.index, 0, node as N);
      const at = locateActive(t, node.id)!;
      return { ok: true, tpl: t, inverse: op.as === 'link'
        ? { op: 'removeLink', pointerId: node.id, expect: placedHash(node, at) }
        : { op: 'unaddNode', nodeId: node.id, expect: placedHash(node, at) } };
    }
    case 'unaddNode': {
      const w = locateActive(t, op.nodeId);
      if (!w) return err('not_found', `"${op.nodeId}" is not in the template`);
      const node = w.arr[w.index];
      if (placedHash(node, w) !== op.expect) return err('conflict', `"${op.nodeId}" changed or moved after it was added; undo the later changes first`);
      w.arr.splice(w.index, 1);
      collapse(w.parent);
      return { ok: true, tpl: t, inverse: { op: 'reinsertNode', parentId: parentIdOf(w), index: w.index, node: clone(node), as: 'node', expect: listHash(w.arr) } };
    }
    case 'trimNode': {
      const w = locateActive(t, op.nodeId);
      if (!w) return err('not_found', `"${op.nodeId}" is not an active item`);
      if (op.expect !== undefined && posOf(w) !== op.expect) return err('conflict', `"${op.nodeId}" moved since this was proposed`);
      const [node] = w.arr.splice(w.index, 1);
      collapse(w.parent);
      const pocket = pocketOf(t, w.parent);
      const at = op.pocketIndex ?? pocket.length;
      if (at > pocket.length) return err('invalid', `pocketIndex ${at} is past the end (${pocket.length})`);
      pocket.splice(at, 0, node);
      return { ok: true, tpl: t, inverse: { op: 'restoreNode', nodeId: op.nodeId, index: w.index, expect: positionHash(parentIdOf(w), true, at) } };
    }
    case 'restoreNode': {
      const w = locatePocket(t, op.nodeId);
      if (!w) return err('not_found', `"${op.nodeId}" is not set aside`);
      if (op.expect !== undefined && posOf(w) !== op.expect) return err('conflict', `"${op.nodeId}" changed since this was proposed`);
      const clash = subtreeIds(w.arr[w.index]).find(id => locateActive(t, id));
      if (clash) return err('duplicate_id', `"${clash}" is already in the template; restoring "${op.nodeId}" would put the same item in twice`);
      const [node] = w.arr.splice(w.index, 1);
      const list = (w.parent ? (w.parent.children ?? (w.parent.children = [])) : t.systems) as N[];
      const at = op.index ?? list.length;
      if (at > list.length) return err('invalid', `index ${at} is past the end (${list.length})`);
      list.splice(at, 0, node);
      dropEmptyPocket(t, w.parent);
      return { ok: true, tpl: t, inverse: { op: 'trimNode', nodeId: op.nodeId, pocketIndex: w.index, expect: positionHash(parentIdOf(w), false, at) } };
    }
    case 'moveNode': {
      const w = locateActive(t, op.nodeId);
      if (!w) return err('not_found', `"${op.nodeId}" is not an active item`);
      if (op.expect !== undefined && posOf(w) !== op.expect) return err('conflict', `"${op.nodeId}" moved since this was proposed`);
      const node = w.arr[w.index];
      if (op.parentId !== null && (op.parentId === op.nodeId || isDescendant(node, op.parentId))) return err('invalid', 'an item cannot move inside itself');
      w.arr.splice(w.index, 1);
      collapse(w.parent);
      const list = listOf(t, op.parentId);
      if (!list) return err('not_found', `section "${op.parentId}" is not in the template`);
      if (op.index > list.length) return err('invalid', `index ${op.index} is past the end (${list.length})`);
      list.splice(op.index, 0, node);
      return { ok: true, tpl: t, inverse: { op: 'moveNode', nodeId: op.nodeId, parentId: parentIdOf(w), index: w.index, expect: positionHash(op.parentId, false, op.index) } };
    }
    case 'setNodeField': {
      const w = locate(t, op.nodeId);
      if (!w) return err('not_found', `"${op.nodeId}" is not in the template`);
      const n = w.arr[w.index];
      const prev = n[op.field];
      if (conflict(prev, op.expect)) return err('conflict', `"${op.field}" on "${op.nodeId}" changed since this was proposed`);
      if (op.value === null) delete n[op.field]; else n[op.field] = clone(op.value);
      return { ok: true, tpl: t, inverse: { op: 'setNodeField', nodeId: op.nodeId, field: op.field, value: prev === undefined ? null : clone(prev), expect: hashOf(n[op.field]) } };
    }
    case 'addAttribute': {
      const w = locate(t, op.nodeId);
      if (!w) return err('not_found', `"${op.nodeId}" is not in the template`);
      const n = w.arr[w.index];
      const attrs = (n.attributes ?? []) as Array<Record<string, unknown>>;
      if (attrs.some(a => a.id === op.attribute.id)) return err('duplicate_id', `"${op.nodeId}" already has a field "${String(op.attribute.id)}"`);
      if (op.expect !== undefined && hashOf(attrs.map(a => a.id)) !== op.expect) return err('conflict', `the fields of "${op.nodeId}" changed since this was proposed`);
      const at = op.index ?? attrs.length;
      if (at > attrs.length) return err('invalid', `index ${at} is past the end (${attrs.length})`);
      attrs.splice(at, 0, clone(op.attribute));
      n.attributes = attrs as any;
      return { ok: true, tpl: t, inverse: { op: 'removeAttribute', nodeId: op.nodeId, attrId: String(op.attribute.id), expect: hashOf(op.attribute) } };
    }
    case 'removeAttribute': {
      const w = locate(t, op.nodeId);
      if (!w) return err('not_found', `"${op.nodeId}" is not in the template`);
      const n = w.arr[w.index];
      const i = (n.attributes ?? []).findIndex(a => a.id === op.attrId);
      if (i < 0) return err('not_found', `"${op.nodeId}" has no field "${op.attrId}"`);
      const a = n.attributes![i];
      if (conflict(a, op.expect)) return err('conflict', `field "${op.attrId}" changed since this was proposed`);
      n.attributes!.splice(i, 1);
      const left = n.attributes!.map(x => x.id);
      if (!n.attributes!.length) delete n.attributes;
      return { ok: true, tpl: t, inverse: { op: 'addAttribute', nodeId: op.nodeId, attribute: clone(a) as any, index: i, expect: hashOf(left) } };
    }
    case 'setAttributeField': {
      const w = locate(t, op.nodeId);
      if (!w) return err('not_found', `"${op.nodeId}" is not in the template`);
      const a = (w.arr[w.index].attributes ?? []).find(x => x.id === op.attrId) as Record<string, unknown> | undefined;
      if (!a) return err('not_found', `"${op.nodeId}" has no field "${op.attrId}"`);
      const prev = a[op.field];
      if (conflict(prev, op.expect)) return err('conflict', `"${op.field}" of "${op.attrId}" changed since this was proposed`);
      if (op.value === null) delete a[op.field]; else a[op.field] = clone(op.value);
      return { ok: true, tpl: t, inverse: { op: 'setAttributeField', nodeId: op.nodeId, attrId: op.attrId, field: op.field, value: prev === undefined ? null : clone(prev), expect: hashOf(a[op.field]) } };
    }
    case 'addLink': {
      const home = locateActive(t, op.homeId);
      if (!home) return err('not_found', `"${op.homeId}" is not an active item`);
      const h = home.arr[home.index];
      if (h.pointsTo) return err('invalid', 'a link must point at the record itself, not at another link');
      const sys = rootOf(t, op.homeId)!;
      const list = listOf(t, op.parentId);
      if (!list) return err('not_found', `section "${op.parentId}" is not in the template`);
      if (allIds(t).includes(op.pointerId)) return err('duplicate_id', `id "${op.pointerId}" is already used in this template`);
      if (op.expect !== undefined && listHash(list) !== op.expect) return err('conflict', 'that section changed since this was proposed');
      const at = op.index ?? list.length;
      if (at > list.length) return err('invalid', `index ${at} is past the end (${list.length})`);
      const ptr = { id: op.pointerId, label: op.label ?? h.label, kind: h.kind, pointsTo: { systemId: sys, nodeId: op.homeId } } as N;
      list.splice(at, 0, ptr);
      return { ok: true, tpl: t, inverse: { op: 'removeLink', pointerId: op.pointerId, expect: placedHash(ptr, locateActive(t, op.pointerId)!) } };
    }
    case 'removeLink': {
      const w = locateActive(t, op.pointerId);
      if (!w) return err('not_found', `"${op.pointerId}" is not an active item`);
      const ptr = w.arr[w.index];
      if (!ptr.pointsTo) return err('refused', `"${op.pointerId}" is a record, not a link — it can only be set aside`);
      if (op.expect !== undefined && placedHash(ptr, w) !== op.expect) return err('conflict', `the link "${op.pointerId}" changed or moved since this was proposed`);
      w.arr.splice(w.index, 1);
      collapse(w.parent);
      // The WHOLE node goes into the undo, verbatim — every field it carried, authorable or not.
      return { ok: true, tpl: t, inverse: { op: 'reinsertNode', parentId: parentIdOf(w), index: w.index, node: clone(ptr), as: 'link', expect: listHash(w.arr) } };
    }
    case 'setTemplateField': {
      const rec = t as unknown as Record<string, unknown>;
      const prev = rec[op.field];
      if (conflict(prev, op.expect)) return err('conflict', `"${op.field}" changed since this was proposed`);
      if (op.value === null) delete rec[op.field]; else rec[op.field] = clone(op.value);
      return { ok: true, tpl: t, inverse: { op: 'setTemplateField', field: op.field, value: prev === undefined ? null : clone(prev), expect: hashOf(rec[op.field]) } };
    }
  }
}

export type ApplyManyResult =
  | { ok: true; tpl: InspectionTemplate; inverses: TemplateOp[] }
  | { ok: false; error: OpError; failedIndex: number };

/** All or nothing. `inverses` are already in undo order (last op's inverse first). */
export function applyOps(tpl: InspectionTemplate, ops: readonly TemplateOp[]): ApplyManyResult {
  let cur = tpl;
  const inverses: TemplateOp[] = [];
  for (let i = 0; i < ops.length; i++) {
    const r = applyOp(cur, ops[i]);
    if ('error' in r) return { ok: false, error: r.error, failedIndex: i };
    cur = r.tpl; inverses.unshift(r.inverse);
  }
  return { ok: true, tpl: cur, inverses };
}

// ── classification: content vs company policy ───────────────────────────────────────────────────────────────

/** By RULE, never by the producer's say-so (an AI cannot label its own scope change "content"). Policy = what
 *  is inspected, when, and what the report discloses. `tpl` is the template the op would apply to. */
export function classifyOp(op: TemplateOp, tpl?: InspectionTemplate): { class: OpClass; reason: string } {
  const P = (reason: string) => ({ class: 'policy' as const, reason });
  const C = (reason: string) => ({ class: 'content' as const, reason });
  switch (op.op) {
    case 'addNode': {
      if (op.parentId === null) return P('adds a section to what the company inspects');
      const assessed = (n: TemplateNode): boolean => (!n.pointsTo && n.condition === true) || (n.children ?? []).some(assessed);
      const rules = (n: TemplateNode): boolean => ['appliesWhen', 'whenUnknown', 'method', 'limitations', 'appliesToTypes'].some(k => (n as N)[k] !== undefined) || (n.children ?? []).some(rules);
      if (assessed(op.node)) return P('adds inspection work (an assessed item)');
      if (rules(op.node)) return P('adds rules or disclosures');
      return C('adds a descriptive item');
    }
    case 'unaddNode': return P('removes an item from the template');
    case 'reinsertNode': return op.as === 'link' ? C('shows a record in a second section again') : P('puts an item back into the template');
    case 'trimNode': return P('removes an item from what the company inspects (it stays restorable)');
    case 'restoreNode': return P('returns an item to what the company inspects');
    case 'moveNode': {
      if (!tpl) return C('reorders items');
      const w = locateActive(tpl, op.nodeId);
      return w && parentIdOf(w) !== op.parentId ? P('moves an item to a different section') : C('reorders items');
    }
    case 'setNodeField': {
      const f = NODE_FIELDS[op.field];
      if (!f) return P('unknown field');
      if (op.field === 'findingShortcuts' && Array.isArray(op.value) && op.value.some((s: any) => s?.defaultPriority !== undefined)) return P('pre-fills a finding priority');
      return f.class === 'policy' ? P(`changes ${f.why}`) : C(`changes ${f.why}`);
    }
    case 'addAttribute': return C('adds a spec field');
    case 'removeAttribute': return P('removes a spec field — what the report describes');
    case 'setAttributeField': { const f = ATTR_FIELDS[op.field]; return f?.class === 'content' ? C(`changes ${f.why}`) : P('unknown field'); }
    case 'addLink': return C('shows a record in a second section (one record, not a copy)');
    case 'removeLink': return C('stops showing a record in a second section');
    case 'setTemplateField': { const f = TEMPLATE_FIELDS[op.field]; return f?.class === 'content' ? C(`changes ${f.why}`) : P(`changes ${f?.why ?? 'an unknown field'}`); }
  }
}

/** The fields an op writes that no runtime consumer reads yet (see header). */
export function runtimePendingFields(op: TemplateOp): string[] {
  const out = new Set<string>();
  const fromNode = (n: TemplateNode) => {
    for (const [k, f] of Object.entries(NODE_FIELDS)) if (f.pending && (n as N)[k] !== undefined) out.add(k);
    for (const a of n.attributes ?? []) for (const [k, f] of Object.entries(ATTR_FIELDS)) if (f.pending && (a as any)[k] !== undefined) out.add(k);
    (n.children ?? []).forEach(fromNode);
  };
  if (op.op === 'addNode') fromNode(op.node);
  if (op.op === 'setNodeField' && NODE_FIELDS[op.field]?.pending && op.value !== null) out.add(op.field);
  if (op.op === 'setAttributeField' && ATTR_FIELDS[op.field]?.pending && op.value !== null) out.add(op.field);
  if (op.op === 'addAttribute') for (const [k, f] of Object.entries(ATTR_FIELDS)) if (f.pending && op.attribute[k] !== undefined) out.add(k);
  return [...out];
}

/** STORAGE fields an op carries. `legacyBareKey` decides where an attribute's recorded answers are stored, so
 *  only Ledrix may introduce it (a default update) or put it back (an undo of a removal) — never an owner edit,
 *  an AI draft, onboarding or an import. The parser accepts the key so those two can round-trip; the change-set
 *  and proposal layers refuse it from every other source. */
export function storageFields(op: TemplateOp): string[] {
  const has = (a: unknown) => !!a && typeof a === 'object' && (a as Record<string, unknown>).legacyBareKey !== undefined;
  const inNode = (n: TemplateNode): boolean => (n.attributes ?? []).some(has) || (n.children ?? []).some(inNode);
  if (op.op === 'addAttribute' && has(op.attribute)) return ['legacyBareKey'];
  if (op.op === 'addNode' && inNode(op.node)) return ['legacyBareKey'];
  return [];
}
export const STORAGE_SOURCES = ['rollback', 'ledrix_update'] as const;

/** Requirement settings an op writes (Phase A, 2026-10-25). Requirements are the COMPANY's: a Ledrix AI proposal that
 *  writes any of them is refused (templateAuthoring), like a storage field. */
export const REQUIREMENT_TEMPLATE_FIELDS = ['requirementDefaults', 'requirementOverrides'] as const;
export function requirementFields(op: TemplateOp): string[] {
  const inNode = (n: TemplateNode): boolean => (n as TemplateNode & { requirements?: unknown }).requirements !== undefined || (n.children ?? []).some(inNode);
  if (op.op === 'setNodeField' && op.field === 'requirements') return ['requirements'];
  if (op.op === 'addNode' && inNode(op.node)) return ['requirements'];
  if (op.op === 'setTemplateField' && (REQUIREMENT_TEMPLATE_FIELDS as readonly string[]).includes(op.field)) return [op.field];
  return [];
}

/** The op with an `expect` filled in from `tpl` wherever the producer left it out — so every op of a change
 *  set is anchored to the draft it was proposed against, whatever produced it. An append (no index) carries
 *  none: it overwrites nothing, a duplicate id is refused and a missing section is refused. */
export function withExpect(tpl: InspectionTemplate, op: TemplateOp): TemplateOp {
  if ((op as { expect?: string }).expect !== undefined) return op;
  const stamp = (expect: string): TemplateOp => ({ ...op, expect } as TemplateOp);
  switch (op.op) {
    case 'setNodeField': { const w = locate(tpl, op.nodeId); return w ? stamp(hashOf(w.arr[w.index][op.field])) : op; }
    case 'setAttributeField': { const w = locate(tpl, op.nodeId); const a = w && (w.arr[w.index].attributes ?? []).find(x => x.id === op.attrId) as Record<string, unknown> | undefined; return a ? stamp(hashOf(a[op.field])) : op; }
    case 'removeAttribute': { const w = locate(tpl, op.nodeId); const a = w && (w.arr[w.index].attributes ?? []).find(x => x.id === op.attrId); return a ? stamp(hashOf(a)) : op; }
    case 'setTemplateField': return stamp(hashOf((tpl as unknown as Record<string, unknown>)[op.field]));
    case 'trimNode': case 'moveNode': { const w = locateActive(tpl, op.nodeId); return w ? stamp(posOf(w)) : op; }
    case 'restoreNode': { const w = locatePocket(tpl, op.nodeId); return w ? stamp(posOf(w)) : op; }
    case 'removeLink': { const w = locateActive(tpl, op.pointerId); return w ? stamp(placedHash(w.arr[w.index], w)) : op; }
    case 'addNode': case 'addLink': {
      if (op.index === undefined) return op;
      const list = op.parentId === null ? tpl.systems : (() => { const w = locateActive(tpl, op.parentId!); return w ? (w.arr[w.index].children ?? []) : null; })();
      return list ? stamp(listHash(list)) : op;
    }
    case 'addAttribute': { if (op.index === undefined) return op; const w = locate(tpl, op.nodeId); return w ? stamp(hashOf((w.arr[w.index].attributes ?? []).map(a => a.id))) : op; }
    default: return op;
  }
}
/** Ops that may legitimately carry no `expect` (see withExpect). Every other op must, to be applied over a
 *  draft that changed since it was proposed. */
export const isUnanchoredAppend = (op: TemplateOp) =>
  (op.op === 'addNode' || op.op === 'addLink' || op.op === 'addAttribute') && op.index === undefined;

/** Ids an op touches — for provenance and for pinning a validation issue on the op that caused it. */
export function opTargets(op: TemplateOp): string[] {
  switch (op.op) {
    case 'addNode': case 'reinsertNode': return subtreeIds(op.node);
    case 'addLink': return [op.pointerId, op.homeId];
    case 'removeLink': return [op.pointerId];
    case 'setTemplateField': return ['@template'];
    default: return [(op as { nodeId: string }).nodeId];
  }
}

/** The provenance key an op sets: `node`, `node#field`, `node@attr`, `node@attr#field`, `@template#field`.
 *  Deliberately NOT the `node::attr` spec-key form — these label template authorship, never stored answers, and
 *  must not be mistakable for (or usable as) a spec key (verify:spec-keys). */
const attrLabel = (nodeId: string, attrId: string) => [nodeId, attrId].join('@');
export function provenanceKeys(op: TemplateOp): string[] {
  switch (op.op) {
    case 'setNodeField': return [`${op.nodeId}#${op.field}`];
    case 'setAttributeField': return [`${attrLabel(op.nodeId, op.attrId)}#${op.field}`];
    case 'addAttribute': return [attrLabel(op.nodeId, String(op.attribute.id))];
    case 'removeAttribute': return [attrLabel(op.nodeId, op.attrId)];
    case 'setTemplateField': return [`@template#${op.field}`];
    default: return opTargets(op);
  }
}
