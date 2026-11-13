import type { TemplateNode } from '../templates/InspectionTemplate';   // TYPE-ONLY: erased, no cycle

// ─── conditionMatch — how a component's meaning is read from its data ───────────
//
// Two jobs, one module ON PURPOSE: the text predicates below, and componentAxes at the
// bottom which uses them. They live together because this module must have ZERO runtime
// imports — that is what lets scripts/verify-matchers.mjs and verify-component-model.mjs
// exercise the SHIPPING logic instead of keeping copies (the liability vocab-check.mjs
// called out). Node's type-stripping cannot resolve an extensionless relative import, so a
// separate componentAxes.ts could not be loaded by a guard without duplicating these
// predicates — and a second copy of the rules is exactly what this file exists to prevent.
//
// ── Part 1: is this string a CONDITION, or a LIMITATION? ───────────────────────
//
// The two text predicates the whole app routes on. A string that reads as a condition is
// stripped out of the SPEC picker; a string that reads as a limitation is routed to the
// report's Access & Inspection Limitations page. Both decisions are load-bearing and both
// are made from TEXT, so the matching rules are the product.
//
// Pure module ON PURPOSE — no imports at all. These used to live inside
// customTemplateService (which pulls in the template library, the outbox and Supabase) and
// InspectionTemplate (which pulls in the component KB), so a guard script could not reach
// them without stubbing half the app. vocab-check.mjs already learned this lesson the hard
// way: "it used to carry its own copy of the matcher, which was fine while it was a probe
// and a liability the moment the app grew one too." One implementation, reachable from both
// the app and scripts/verify-matchers.mjs. Their original homes re-export, so no call site
// changed.
//
// ── The rule that took four bugs to learn ──────────────────────────────────────
// Match WORDS, not substrings, and read the negation in front of them.
//
//   `ac`      matched inside "satisfactory"
//   `lean`    matched inside "cleaner"
//   `cracked?` needed "cracke"
//   `rust`    matches inside "crusted"
//   and the one that shipped: `defect` matched inside "Visible — No Defects", so the app's
//   own passing value for a furnace Heat Exchanger was classified as a defect and hidden.

/** Keywords that mean "something is wrong here" — matched as whole words. The trailing
 *  \w{0,3} covers the ordinary inflections (damage/damaged, leak/leaks/leaking) without
 *  opening the door to unrelated words that merely start the same way. */
const CONDITION_WORDS = ['improper', 'damaged', 'leak', 'defect', 'corroded', 'corrosion', 'rust', 'hazard'];

/** Does a negation sit immediately before the keyword? "No Defects", "free of rust" and
 *  "without damage" are the ABSENCE of the condition — the good news, not the bad. Matches
 *  at the END of the text preceding the hit, allowing the separators these labels actually
 *  use (spaces, hyphens, em/en dashes, commas, colons, slashes). */
const NEGATED_BEFORE = /(?:\b(?:no|none|not|free\s+of|without)\b[\s\-—–,:/]*)$/i;

/** An authored suffix, never prose — explicit author intent. The suffix CARRIES A REASON in
 *  24 authored options and the old pattern demanded the closing paren immediately, so
 *  "(Flag — PRV)", "(Flag — Structural)", "(Flag — Short-Circuit)", "(Flag — No Screen)" and
 *  "(Flag — clearance)" all slipped through and sat in the MATERIAL picker as pickable
 *  values — the app offering "High > 80 psi (Flag — PRV)" as a thing a pipe is made of.
 *  `\b` after the keyword keeps "(flagpole)" out. Found 2026-08-12 auditing every SPEC row. */
const AUTHORED_SUFFIX = /\((?:flag|limitation)\b[^)]*\)/i;

/** Is this option text describing a CONDITION (something wrong) rather than a spec value? */
export function isConditionOption(v: string): boolean {
  if (!v) return false;
  if (AUTHORED_SUFFIX.test(v)) return true;
  for (const w of CONDITION_WORDS) {
    const re = new RegExp(`\\b${w}\\w{0,3}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(v)) !== null) {
      if (!NEGATED_BEFORE.test(v.slice(0, m.index))) return true;
    }
  }
  return false;
}

// Limitation phrases are matched as whole words too, but WITHOUT the negation rule — most
// of them legitimately begin with a negation ("not visible", "not inspected"), which is the
// point of them. Anchoring alone is the fix here.
const LIMITATION_PHRASES = [
  'limitation', 'not visible', 'inaccessible', 'no access', 'not removed',
  "could ?n'?t inspect", 'not inspected', 'unable',
];
const LIMITATION_RE = new RegExp(`\\b(?:${LIMITATION_PHRASES.join('|')})\\b`, 'i');

/** Heuristic: an option/value that represents an inspection limitation. */
export function isLimitationValue(v?: string | null): boolean {
  return !!v && LIMITATION_RE.test(v);
}

// ── Part 2: what a component actually offers ───────────────────────────────────
// SPEC vs CONDITION (owner-ratified 2026-07-13): a component leaf's declared facet, explicit
// author intent rather than inferred from options.length. 'spec' = description only, NEVER
// takes a finding (the only facet that removes a capability). 'condition' = findings and
// satisfactory only. 'both' = a picker AND findings. A legacy node with no explicit facet
// infers 'both' when it carries options, else 'condition', so nothing built before the field
// existed ever loses capability.
export type NodeFacet = 'spec' | 'condition' | 'both';

export function facetOf(n: TemplateNode): NodeFacet {
  if (n.facet) return n.facet;
  return (n.options?.length ?? 0) > 0 ? 'both' : 'condition';
}

/** One SPEC row on a component — "Capacity: 40 Gallon". Values are MATERIALS/TYPES only:
 *  never a grade (conditions are derived from OK/FINDING/LIMIT), never a limitation (typed
 *  separately below), never a method. That constraint is the entire point of the type — a
 *  grade has nowhere to live, so it cannot be authored by accident. */
export type ComponentAttribute = {
  id:     string;          // stable within the component ('type', 'capacity', 'age')
  label:  string;          // the SPEC row's caption
  values: string[];        // pickable choices
  multi?: boolean;         // more than one can be true at once (Flooring: Hardwood + Carpet)
  /** Keep storing this attribute under the BARE node id even though the component now has more
   *  than one attribute — so values recorded while it was the only one do not move (A5-7: the AC's
   *  "AC System Type" when Cooling gained its Age field). Authored, never inferred. */
  legacyBareKey?: boolean;
  /** How the answer is entered when it is not a tile grid. `dimensions` (owner 2026-11-08, Filter › Size): wheels for
   *  width × height × depth plus a quantity, stored as "20x20x1" / "20x20x1 × 2" (filterSize.ts). `values` stay the
   *  common sizes (what a photo read and a spoken answer may match). */
  input?: 'dimensions' | 'temperature';   // temperature (2026-11-13): a head's supply air, one wheel in °F (supplyTemp.ts)
};

export type ComponentAxes = {
  attributes:  ComponentAttribute[];   // SPEC rows
  condition:   boolean;                // OK / FINDING / LIMIT
  limitations: string[];               // typed reasons, suffix stripped
  method:      string[];               // what the inspector DID
};

const ABSENCE_RE = /^none$|^n\/?a$/i;
const stripSuffix = (v: string) => v.replace(/\s*\((?:flag|limitation)\b[^)]*\)\s*$/i, '').trim();

/** Either shape, one answer.
 *
 *  Reading the OLD shape reproduces today's behaviour EXACTLY — heuristics and all — and
 *  that is deliberate: S1 must change nothing on screen, or the migration's golden test has
 *  no baseline to compare later stages against. */
export function componentAxes(n: TemplateNode): ComponentAxes {
  // NEW shape — authored, nothing inferred.
  if (n.attributes || n.condition !== undefined || n.limitations || n.method) {
    return {
      attributes:  n.attributes ?? [],
      condition:   n.condition ?? true,
      limitations: n.limitations ?? [],
      method:      n.method ?? [],
    };
  }
  // OLD shape — derive.
  const opts = n.options ?? [];
  const facet = facetOf(n);
  const values = opts.filter(o => !isConditionOption(o) && !isLimitationValue(o) && !ABSENCE_RE.test(o.trim()));
  // One UNNAMED attribute: the old shape has nowhere to put a name, and the tile already
  // renders it under the component's own heading. Naming them is S3's job. The >= 2 test is
  // today's hasTypeChoice — a single meaningful option is a presence check, not a choice.
  const attributes: ComponentAttribute[] =
    facet !== 'condition' && values.length >= 2 ? [{ id: 'spec', label: n.label, values }] : [];
  return {
    attributes,
    condition:   facet !== 'spec',
    limitations: [...(n.limitationOptions ?? []), ...opts.filter(isLimitationValue)].map(stripSuffix).filter(Boolean),
    method:      [],   // the old shape cannot express it — method values hide inside options
  };
}

/** A component that asks the inspector for NOTHING (owner ruling 2026-10-27 (second) #5): its company switched
 *  Condition, Details and Requirements all off in the Template Builder. Hidden from inspectors — the builder warns
 *  about it. A pointer, a free-form value or a method still asks for something, so those never count. */
export function recordsNothing(n: TemplateNode): boolean {
  if (n.kind !== 'component' || n.pointsTo || n.freeFormValue) return false;
  const ax = componentAxes(n);
  return !ax.condition && !ax.attributes.length && !ax.method.length && !(n.requirements?.length);
}

// ── STABLE SPEC KEYS (Phase 1, owner-approved 2026-10-16 — PLAN_2026-10-16_dynamic_checklists.md) ──────
//
// A key used to be decided by the TEMPLATE node's CURRENT field count: one field → the bare node id, two or
// more → `<id>::<attr>`. A company that added or removed a field in Template Builder therefore moved every
// value of that component, and the pack's rules (`plumb_wh_type::type`, `roof_material::type`, bare
// `kit_range`) went blind. Now a key is FIXED by the node's LEDRIX definition (the bundled core pack,
// registered once by `specKeyDefs.ts`), so editing the template never moves it:
//
//   · an attribute of a Ledrix node keeps exactly the key it has today (the old rule, applied to the
//     Ledrix definition — `verify:spec-keys` holds the golden list);
//   · an attribute a company ADDED to a Ledrix node, and every attribute of a company's own node, is
//     `<id>::<attr>`;
//   · METHOD is its own field: bare id on a method-only node (Roof "Method of Inspection" — nothing else
//     lives there), `<id>::__method` on a node that also has attributes;
//   · a node with BOTH a method and attributes (Attic Access) gives every field its own suffixed key. Its
//     old bare key was shared by two fields — that value is never read as either field (see
//     `sharedLegacyKey`), and nothing writes the bare key again.
//
// Reading stays backward-compatible WITHOUT moving data: `specLegacyKey` names where today's rule put a value
// when that differs from the canonical key, and readers fall back to it only while the canonical key holds no
// entry at all (an explicit clear wins). Nothing here writes, moves or deletes a stored value.
//
// THIS FILE STILL IMPORTS NOTHING: guards execute it bare. The Ledrix definitions are INJECTED; when none are
// registered (a guard that does not care), every node is its own definition — the old rule, except that a key
// two fields shared is still split.

/** The METHOD axis's attribute id (re-exported by materialGap as METHOD_ATTR_ID). */
export const METHOD_KEY_ATTR = '__method';

/** `formerBareKey` (2026-10-27): the field's answers USED to be stored under the bare node id and now take the normal
 *  `<id>::<attr>` key (AC System Type). Only the old-rule reader uses it — saved answers stay readable. */
type KeyAttr = { id: string; legacyBareKey?: boolean; formerBareKey?: boolean;
  /** AGE ROWS (owner 2026-11-04: "age should be its own category like data plate is"). On the Age row's definition:
   *  the field is stored on THIS node's key instead of its own (`hvac_heating_age` → `hvac_heating::system_age`), so
   *  every answer already given, and every reader of the owner's key, is untouched. */
  storedOn?: string;
  /** With `storedOn`: the owner's Ledrix label ("Heating System"), so the answer is saved under the label it always had
   *  ("Heating System — Age") and the report prints it as before. */
  storedOnLabel?: string;
  /** On the owner's definition: the field now asked on that row (it still counts toward the owner's key shape). */
  movedTo?: string };
/** The shape a key depends on: the attributes and whether a method axis exists. */
export type SpecKeyDef = { attributes: readonly KeyAttr[]; hasMethod: boolean };

let keyDefOf: ((baseId: string) => SpecKeyDef | undefined) | null = null;
/** Register the Ledrix definitions (`specKeyDefs.ts`). `null` unregisters (tests). */
export function registerSpecKeyDefs(lookup: ((baseId: string) => SpecKeyDef | undefined) | null): void { keyDefOf = lookup; }

const keyBaseId = (id: string) => { const i = id.indexOf('~i'); return i < 0 ? id : id.slice(0, i); };
const shapeOf = (n: TemplateNode): SpecKeyDef => {
  const ax = componentAxes(n);
  return { attributes: ax.attributes, hasMethod: ax.method.length > 0 };
};

/** The key the PRE-2026-10-16 rule gave, from the template node as it is now. */
function oldRuleKey(n: TemplateNode, attributeId?: string): string {
  const axes = componentAxes(n);
  // An Age row's field: the old rule keyed it on its owner, where it then lived — the canonical key, no legacy.
  if (attributeId && storedOnAttr(n.id, attributeId)) return specStoreKey(n, attributeId);
  // An owner still counts the field it gave its Age row (2026-11-04), so its other fields keep their old keys — but
  // only while it holds every other Ledrix field. A company that trimmed the owner gets the old rule on what it kept,
  // exactly as before the row existed (a Water Heater kept to Type & Fuel still reads its bare-key answer).
  if (savedFieldCount(n) <= 1 || !attributeId) return n.id;
  if (axes.attributes.find(a => a.id === attributeId)?.legacyBareKey) return n.id;
  if (keyDefOf?.(keyBaseId(n.id))?.attributes.find(a => a.id === attributeId)?.formerBareKey) return n.id;
  return `${n.id}::${attributeId}`;
}

/** The Age row's field definition when `nodeId`'s field is stored on another node (its owner) — else undefined. */
function storedOnAttr(nodeId: string, attributeId: string): KeyAttr | undefined {
  const a = keyDefOf?.(keyBaseId(nodeId))?.attributes.find(x => x.id === attributeId);
  return a?.storedOn ? a : undefined;
}
/** AGE ROWS (2026-11-04): the node a row's field is stored on — the owner, with this row's unit suffix (`~i2`) — when
 *  the Ledrix definition says so; null for every other node and field. */
export function storedOnNode(nodeId: string, attributeId: string): string | null {
  const a = storedOnAttr(nodeId, attributeId);
  return a?.storedOn ? `${a.storedOn}${String(nodeId).slice(keyBaseId(String(nodeId)).length)}` : null;
}
/** AGE ROWS: the unit an Age row belongs to (`hvac_heating_age~i2` → `hvac_heating~i2`), else null. */
export function storedOnOwner(nodeId: string): string | null {
  const a = keyDefOf?.(keyBaseId(String(nodeId ?? '')))?.attributes.find(x => x.storedOn);
  return a?.storedOn ? `${a.storedOn}${String(nodeId).slice(keyBaseId(String(nodeId)).length)}` : null;
}
/** AGE ROWS: the owner's label for an Age row's field ("Heating System"), else null. */
export function storedOnLabelOf(nodeId: string, attributeId: string): string | null {
  return storedOnAttr(nodeId, attributeId)?.storedOnLabel ?? null;
}
/** How many fields a node's answers are SAVED as having — its own, plus a field it gave its Age row while it holds
 *  every other Ledrix field (see oldRuleKey). The spec label and the old key rule both read this. */
export function savedFieldCount(n: TemplateNode): number {
  const own = componentAxes(n).attributes;
  const def = keyDefOf?.(keyBaseId(n.id));
  if (!def) return own.length;
  const has = (id: string) => own.some(x => x.id === id);
  const whole = def.attributes.filter(a => !a.movedTo).every(a => has(a.id));
  return own.length + (whole ? def.attributes.filter(a => a.movedTo && !has(a.id)).length : 0);
}
/** AGE ROWS: the Ledrix rows that hold fields of this owner (`hvac_heating` → [{ row: 'hvac_heating_age', attr:
 *  'system_age' }]). Empty for every other node. */
export function movedFieldsOf(ownerId: string): { row: string; attr: string }[] {
  return (keyDefOf?.(keyBaseId(ownerId))?.attributes ?? []).filter(a => a.movedTo).map(a => ({ row: a.movedTo!, attr: a.id }));
}

/** The canonical key for one field, from a definition. */
function keyFromDef(id: string, def: SpecKeyDef, attributeId: string, isLedrix: boolean): string {
  if (attributeId === METHOD_KEY_ATTR) return def.attributes.length ? `${id}::${METHOD_KEY_ATTR}` : id;
  const attr = def.attributes.find(a => a.id === attributeId);
  // An Age row's field lives on its owner's key — exactly where it was stored before the row existed.
  if (attr?.storedOn && isLedrix) {
    const ownerDef = keyDefOf?.(attr.storedOn);
    const owner = `${attr.storedOn}${id.slice(keyBaseId(id).length)}`;
    if (ownerDef) return keyFromDef(owner, ownerDef, attributeId, true);
  }
  if (!attr || !isLedrix) return `${id}::${attributeId}`;          // company-added field / company node
  if (def.hasMethod) return attr.legacyBareKey ? id : `${id}::${attributeId}`;   // bare id would be shared
  if (def.attributes.length <= 1 || attr.legacyBareKey) return id;
  return `${id}::${attributeId}`;
}

/** WHERE a spec value is stored — the one canonical key per (component, field). Exported so the chip row,
 *  the drawer, the counters, VAL and the report can never disagree about the key.
 *
 *  `attributeId` omitted: the node's only attribute when it has exactly one (so a caller that does not name
 *  the field can never write a shared bare key), otherwise the bare id as before. */
export function specStoreKey(n: TemplateNode, attributeId?: string): string {
  const own = componentAxes(n).attributes;
  const attr = attributeId ?? (own.length === 1 ? own[0].id : undefined);
  if (!attr) return n.id;
  if (!keyDefOf) return keyFromDef(n.id, shapeOf(n), attr, true);   // nothing registered → the node is its own definition
  const def = keyDefOf(keyBaseId(n.id));
  return def ? keyFromDef(n.id, def, attr, true) : keyFromDef(n.id, shapeOf(n), attr, false);
}

/** Where the OLD rule stored this field, when that differs from the canonical key AND the old key belonged
 *  to this field alone. Readers may fall back to it while the canonical key has no entry. `undefined` when
 *  there is nothing to fall back to — including a shared old key (see `sharedLegacyKey`). */
export function specLegacyKey(n: TemplateNode, attributeId?: string): string | undefined {
  const own = componentAxes(n).attributes;
  const attr = attributeId ?? (own.length === 1 ? own[0].id : undefined);
  if (!attr) return undefined;
  // Only a field this template HAS can have an old key here: the old rule keyed the template's own fields, so a
  // field the template dropped never had one (and its "old key" would be another field's value).
  if (attr === METHOD_KEY_ATTR ? !componentAxes(n).method.length : !own.some(a => a.id === attr)) return undefined;
  const legacy = oldRuleKey(n, attr === METHOD_KEY_ATTR ? METHOD_KEY_ATTR : attr);
  if (legacy === specStoreKey(n, attr)) return undefined;
  // The bare id a DIFFERENT field used to live on (formerBareKey — AC System Type) holds that field's old answer,
  // never this one's: a template that dropped AC Type must not read the old type as its Age.
  const former = keyDefOf?.(keyBaseId(n.id))?.attributes.find(a => a.formerBareKey);
  if (former && former.id !== attr && legacy === n.id) return undefined;
  if (sharedLegacyKey(n) === legacy) return undefined;
  // Never another field's LIVE key (corrective pass): a template that dropped a field can leave this field's old
  // key on the key the Ledrix definition gives a different field. Reading or retiring it would take that value.
  return liveKeysOf(n).has(legacy) ? undefined : legacy;
}

/** Every canonical key a field of this node can hold today — the template's fields AND the Ledrix definition's. */
function liveKeysOf(n: TemplateNode): Set<string> {
  const ax = componentAxes(n);
  const def = keyDefOf?.(keyBaseId(n.id));
  const ids = new Set<string>([...ax.attributes.map(a => a.id), ...(ax.method.length ? [METHOD_KEY_ATTR] : [])]);
  for (const a of def?.attributes ?? []) ids.add(a.id);
  if (def?.hasMethod) ids.add(METHOD_KEY_ATTR);
  return new Set([...ids].map(f => specStoreKey(n, f)));
}

/** The legacy key of whichever field of `n` has `canonicalKey` as its key — for a caller that holds a key,
 *  not a field id (the confirm bridge's merges). `undefined` when none applies. */
export function legacyKeyFor(n: TemplateNode, canonicalKey: string): string | undefined {
  const ax = componentAxes(n);
  for (const f of [...ax.attributes.map(a => a.id), ...(ax.method.length ? [METHOD_KEY_ATTR] : [])]) {
    if (specStoreKey(n, f) === canonicalKey) return specLegacyKey(n, f);
  }
  return undefined;
}

/** The old key that two fields of this node SHARED (Attic Access: its access field and its method both
 *  resolved to the bare id). Its value is preserved untouched and only ever offered for review — never read
 *  as either field. `undefined` for every node whose fields had their own keys. */
export function sharedLegacyKey(n: TemplateNode): string | undefined {
  const ax = componentAxes(n);
  const fields = [...ax.attributes.map(a => a.id), ...(ax.method.length ? [METHOD_KEY_ATTR] : [])];
  const seen = new Map<string, number>();
  for (const f of fields) { const k = oldRuleKey(n, f); seen.set(k, (seen.get(k) ?? 0) + 1); }
  // A key a field still writes today is that field's live value, never a retired shared entry (corrective pass:
  // a method-only Ledrix node a company gave an attribute keeps its method on the bare id).
  for (const [k, c] of seen) if (c > 1) return liveKeysOf(n).has(k) ? undefined : k;
  return undefined;
}

/** The fields whose keys a shared legacy key used to hold (attribute ids and/or METHOD_KEY_ATTR). */
export function fieldIdsOf(n: TemplateNode): string[] {
  const ax = componentAxes(n);
  return [...ax.attributes.map(a => a.id), ...(ax.method.length ? [METHOD_KEY_ATTR] : [])];
}

/** How a preserved shared legacy value relates to the node's fields — READ-ONLY, never a confirmation.
 *  `fieldId` is set only when EVERY part of the value matches that field's allowed values (trimmed,
 *  case-insensitive, exact) and NO part matches another field. Anything else is `review`. */
export type LegacyClass = { kind: 'field'; fieldId: string } | { kind: 'review' };
export function classifyLegacyValue(
  value: string, fields: readonly { id: string; values: readonly string[] }[], delim = ', ',
): LegacyClass {
  const parts = value.split(delim).map(p => p.trim()).filter(Boolean);
  if (!parts.length) return { kind: 'review' };
  const norm = (s: string) => s.trim().toLowerCase();
  const owners = parts.map(p => fields.filter(f => f.values.some(v => norm(v) === norm(p))).map(f => f.id));
  if (owners.some(o => o.length !== 1)) return { kind: 'review' };   // unmatched or matching several
  const first = owners[0][0];
  return owners.every(o => o[0] === first) ? { kind: 'field', fieldId: first } : { kind: 'review' };
}

/** A template's node for a plain node id — a unit (`plumb_wh_type~i2`) through its library node when the template
 *  holds no node of its own for it. Pure; used by the report and VAL to recognise a shared legacy key. */
export function templateNodeLookup(systems: readonly TemplateNode[] | null | undefined): (id: string) => TemplateNode | undefined {
  const idx = new Map<string, TemplateNode>();
  const walk = (ns: readonly any[] | undefined) => { for (const n of ns ?? []) { if (n?.id) idx.set(n.id, n); walk(n?.children); } };
  try { walk(systems ?? []); } catch { /* unwalkable → no nodes */ }
  return (id: string) => {
    const hit = idx.get(id); if (hit) return hit;
    const lib = idx.get(keyBaseId(id));
    return lib && lib.id !== id ? { ...lib, id } : undefined;
  };
}

/** The legacy-entry review sheet's save check (corrective pass): the first value that would be saved into MORE
 *  THAN ONE field (trimmed, case-insensitive), or `undefined`. An unsplit combined entry copied into two fields
 *  is not a review, so the sheet refuses it and asks for each field's own part. */
export function duplicateReviewValue(values: readonly string[]): string | undefined {
  const norm = (v: string) => v.trim().toLowerCase();
  return values.find((v, i) => !!norm(v) && values.some((o, j) => j !== i && norm(o) === norm(v)));
}
