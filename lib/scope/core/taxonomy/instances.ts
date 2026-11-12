// ─── instances — the library node, instantiated for THIS house ──────────────────────────
//
// P4 of LEDRIX_INSPECTION_PIPELINE_SPEC.md §3, which is the distinction every argument of the
// last week came from:
//
//   A LIBRARY NODE answers "what is a hose bib, and what can be said about one?"
//   A TEMPLATE     answers "what must this inspection cover?"
//   AN INSTANCE    answers "which hose bibs does THIS house have, and what did I find?"
//
// Collapsing the three is what produced a shipped taxonomy with two bathrooms in it — Hall
// Bathroom was a byte-for-byte second copy of the schema, every field duplicated, and a fix to
// one silently not reaching the other. The library gets ONE Bathroom; a house declares three
// instances; a fourth costs nothing.
//
// "COSTS NOTHING" IS THE WHOLE DESIGN, not a slogan. An instance is STORED as a reference —
// four fields, no axes:
//
//     { id: 'plumb_wh~i2', label: 'Water Heater (garage)', kind: 'component', instanceOf: 'plumb_wh' }
//
// and MATERIALIZED at load, when the library node is in hand. Three consequences follow, all
// of them the point:
//
//   • No duplication. The stored diff grows by one line, not by a schema.
//   • Taxonomy updates reach instances. Add a spec field to Water Heater and every instance in
//     every open inspection has it on next load — the exact property the overlay format was
//     built for, applied one level down.
//   • Nothing downstream changes. Two hundred call sites read a normal TemplateNode with real
//     axes; they never learn instances exist. Materializing at load was chosen over teaching
//     componentAxes about references for precisely that reason.
//
// A CONTAINER INSTANCE RE-IDS ITS WHOLE SUBTREE, and this is the part that is easy to get
// wrong. Instancing "Bathroom" without re-iding its children gives both bathrooms the same
// `bath_sink` node — so an OK on the hall sink lights up the master sink, because state is
// keyed by nodeId and they are now the same key. The children carry the parent's ordinal.
//
// ID FORMAT is deterministic and reversible: `<libraryId>~i<n>`. `baseIdOf` recovers the
// library node from any instance, which is what lets the report group an instance under the
// same trade section as its original.
//
// THE SEPARATOR IS `~i` BECAUSE `__i` WAS TAKEN. The first draft used a double underscore and
// the guard caught `attic__insulation` on the very first run — a real authored node whose id
// contains it. Every instance of that node would have carried an id the parser read as
// "instance 1 of `attic`", aliasing a completely different component, and the symptom would
// have been findings landing on the wrong node with nothing in the code looking wrong. Tilde
// appears in neither shipped copy and cannot survive slugify, so it cannot be authored by
// accident; the guard asserts that against both copies on every run rather than trusting it.
//
// THE ORIGINAL IS INSTANCE #1, implicitly and with no migration. `plumb_wh` stays `plumb_wh`
// forever; only the second and later copies carry a suffix. Renaming the first one to
// `plumb_wh~i1` would orphan every finding, spec value and condition state already keyed to
// it, on every inspection in the field.
//
// Pure module: no imports, no storage, so scripts/verify-instances.mjs exercises the shipping
// re-id and materialize logic rather than a twin. Same discipline as templateOverlay.

/** The one separator. A pack id may never contain it — the guard asserts that against both
 *  shipped copies, because the day one does, every instance silently aliases a real node. */
export const INSTANCE_SEP = '~i';

type Node = { id: string; label?: string; children?: Node[]; [k: string]: unknown };

export function isInstanceId(id: string): boolean {
  return typeof id === 'string' && id.includes(INSTANCE_SEP);
}

/** The library node an id refers to, instance or not. Strips EVERY suffix, so a nested
 *  instance (`bath_sink~i2~i3` — the second sink in the third bathroom) still resolves to
 *  `bath_sink`. Total: a plain id returns itself. */
/** The library item a node is an instance or a room's copy of: its `recordOf` (a space's own copy, 2026-11-12), else
 *  its base id. The one way to look a node up in the pack, the rules or a trade's section. */
export function libraryIdOf(node: { id: string; recordOf?: string } | null | undefined): string {
  if (!node) return '';
  return typeof node.recordOf === 'string' && node.recordOf ? baseIdOf(node.recordOf) : libraryBaseOf(node.id);
}

// ── A ROOM COPY'S ITEM, BY ID (2026-11-12) ── many pack and rule lookups have only an id. Every loaded template notes
// its room copies here (noteRoomCopies — the inspection store, Scope's provider, the report), and libraryBaseOf answers
// with the item a copy was made from. A copy's id is unique and never re-pointed, so the map only grows. STORAGE keys
// (answers, condition, photos) keep the copy's own id — only lookups of WHAT the item is go through this.
const _recordOf = new Map<string, string>();
export function noteRoomCopies(systems: readonly any[] | null | undefined): void {
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.recordOf === 'string' && n.recordOf) _recordOf.set(baseIdOf(String(n.id)), baseIdOf(n.recordOf));
    (n.children ?? []).forEach(walk);
  };
  (systems ?? []).forEach(walk);
}
/** baseIdOf, then through a room copy to the item it was copied from — for pack, rule, tip and section lookups. */
export function libraryBaseOf(id: string): string {
  const b = baseIdOf(id);
  return _recordOf.get(b) ?? b;
}

export function baseIdOf(id: string): string {
  if (typeof id !== 'string') return id;
  const i = id.indexOf(INSTANCE_SEP);
  return i < 0 ? id : id.slice(0, i);
}

/** Which copy this is. 1 for an un-suffixed (original) node — see "the original is instance
 *  #1" above. Reads the LAST segment, which is the one this node was created with. */
export function instanceOrdinal(id: string): number {
  if (typeof id !== 'string') return 1;
  const m = id.match(/~i(\d+)$/);
  return m ? Number(m[1]) : 1;
}

export function makeInstanceId(baseId: string, ordinal: number): string {
  return `${baseId}${INSTANCE_SEP}${ordinal}`;
}

/** The next free ordinal for a library node, given every id already in the tree. Scans rather
 *  than counts: deleting instance #2 and adding another must not reuse #2, or the new node
 *  inherits the deleted one's findings, specs and condition state — all of which are keyed by
 *  nodeId and none of which were deleted with it. */
export function nextOrdinal(baseId: string, existingIds: Iterable<string>): number {
  let max = 1;
  for (const id of existingIds) {
    if (baseIdOf(id) !== baseId) continue;
    max = Math.max(max, instanceOrdinal(id));
  }
  return max + 1;
}

/** The stored form: a reference, not a copy. What goes into the overlay's `added` list. */
export function instanceStub(
  library: { id: string; label?: string; kind?: unknown },
  ordinal: number,
  label?: string,
): Node {
  return {
    id: makeInstanceId(library.id, ordinal),
    label: label?.trim() || `${library.label ?? library.id} #${ordinal}`,
    kind: library.kind,
    instanceOf: library.id,
  } as Node;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Re-id a subtree for one instance, carrying the parent's ordinal down. The ROOT keeps the
 *  caller's chosen label (that is the whole point of "Water Heater (garage)"); descendants
 *  keep the library's labels, because a sink in the second bathroom is still a sink. */
function reid(node: Node, ordinal: number, rootLabel?: string, depth = 0): Node {
  const out: Node = { ...clone(node), id: makeInstanceId(baseIdOf(node.id), ordinal) };
  if (depth === 0 && rootLabel) out.label = rootLabel;
  if (Array.isArray(node.children)) out.children = node.children.map(c => reid(c, ordinal, undefined, depth + 1));
  return out;
}

/** A reference → a full node. Returns the stub unchanged when the library node is gone: a
 *  component retired from the taxonomy must not delete an inspector's instance along with the
 *  findings hanging off it. It degrades to a bare labelled row — visibly diminished, never
 *  silently dropped. */
/** ── SNAPSHOT > PACK (B4, owner rulings 2026-10-07) ── the INSPECTION-LOCAL definition a new copy of `libraryId` is
 *  made from — unambiguous, or none:
 *    · the node with that exact id (the original), when it is a full node;
 *    · otherwise, when the original was removed and exactly ONE full copy of it survives, that copy;
 *    · otherwise null — no copy, or several and no authoritative one. The caller REFUSES; it never guesses and it
 *      never reaches for the shipped pack, which may classify words but never supplies inspection content. */
export function localDefinitionOf(systems: readonly Node[], libraryId: string): Node | null {
  const bare = (n: Node) => typeof n.instanceOf === 'string' && Object.keys(n).every(k => k === 'id' || k === 'label' || k === 'kind' || k === 'instanceOf');
  let exact: Node | null = null;
  const copies: Node[] = [];
  const walk = (n: Node) => {
    if (!n || typeof n !== 'object') return;   // a malformed child: skipped here; the fill that copies it refuses
    if (!bare(n)) {
      if (n.id === libraryId) exact = n;
      else if (baseIdOf(n.id) === libraryId) copies.push(n);
    }
    (n.children ?? []).forEach(walk);
  };
  (systems ?? []).forEach(walk);
  if (exact) return exact;
  return copies.length === 1 ? copies[0] : null;
}

/** ── A RETAINED DEFINITION (owner rulings 2026-10-07, B4 follow-up) ── what deleting a company-offered section or
 *  physical unit KEEPS: the node as it was, and where it sat (`parentId` null = a top-level section). Stored on the
 *  snapshot tree's root (`template.retained`), never under `systems`, so nothing that walks the inspection — coverage,
 *  the report, the frozen record, "touched" — ever sees it. It is a DEFINITION, never an instance. */
export type RetainedDefinition = { node: Node; parentId: string | null; at?: number };

/** The retained definition of `libraryId`: the one entry kept for it (deleting keeps one per base id); else, when
 *  none is keyed to it, the ONE node of that base inside a retained section (the panel inside a deleted Electrical);
 *  otherwise null — none, or several with no deterministic source. `parentId` is where it sat (for a node found
 *  inside a retained section: its parent there, which is not live — so it can define, but not be placed). */
export function retainedDefinitionOf(retained: readonly RetainedDefinition[] | null | undefined, libraryId: string): RetainedDefinition | null {
  const list = (retained ?? []).filter(e => e && e.node && typeof e.node === 'object');
  const keyed = list.filter(e => baseIdOf(e.node.id) === libraryId);
  if (keyed.length) return keyed.length === 1 ? keyed[0] : null;
  const nested: RetainedDefinition[] = [];
  for (const e of list) {
    const walk = (n: Node, parent: Node) => {
      if (!n || typeof n !== 'object') return;
      if (baseIdOf(n.id) === libraryId) nested.push({ node: n, parentId: parent.id });
      (n.children ?? []).forEach(c => walk(c, n));
    };
    (e.node.children ?? []).forEach(c => walk(c, e.node));
  }
  return nested.length === 1 ? nested[0] : null;
}

/** ── THE INSPECTION'S DEFINITION OF A NODE — the one source order (owner rulings 2026-10-07) ─────────────────────
 *    1 · the live original;  2 · the single live copy;  3 · the retained definition.
 *  Never the shipped pack. `live` says which half answered; a retained answer carries where it sat. */
export function inspectionDefinitionOf(
  tpl: { systems: readonly Node[]; retained?: readonly RetainedDefinition[] | null } | null | undefined, libraryId: string,
): { node: Node; live: boolean; parentId: string | null } | null {
  if (!tpl) return null;
  const live = localDefinitionOf(tpl.systems as any, libraryId);
  if (live) return { node: live, live: true, parentId: null };   // (parentId is meaningful only for a retained answer)
  const kept = retainedDefinitionOf(tpl.retained, libraryId);
  return kept ? { node: kept.node, live: false, parentId: kept.parentId } : null;
}

export function materializeInstance(stub: Node, library: Node | null | undefined): Node {
  if (!library) return stub;
  const ordinal = instanceOrdinal(stub.id);
  const built = reid(library, ordinal, typeof stub.label === 'string' ? stub.label : undefined);
  // Fields the STUB owns win — a renamed instance, or an edit the overlay recorded on it —
  // over the library's version. Everything else comes from the library, which is what makes a
  // taxonomy change reach an existing instance.
  const { id: _i, label: _l, children: stubKids, ...stubOwn } = stub;
  // CHILDREN MERGE BY ID rather than replacing wholesale. Taking the stored array outright
  // would pin an edited instance's subtree forever — a company that renames one checkpoint on
  // the second bathroom would stop receiving every future taxonomy change to that bathroom,
  // which is the staleness this whole format exists to prevent, arriving through the back door.
  // So the library rebuilds the subtree and each stored child overlays only ITS OWN changed
  // fields on top; a stored child with no library counterpart (added by hand) is appended.
  let children = built.children;
  if (Array.isArray(stubKids) && Array.isArray(children)) {
    const stored = new Map(stubKids.map(c => [c.id, c]));
    children = children.map(c => {
      const s = stored.get(c.id);
      if (!s) return c;
      stored.delete(c.id);
      const merged = materializeInstance({ ...s, instanceOf: s.instanceOf ?? baseIdOf(c.id) }, c);
      return { ...merged, id: c.id };
    });
    children = [...children, ...stored.values()];
  } else if (Array.isArray(stubKids) && !children) {
    children = stubKids;
  }
  return { ...built, ...stubOwn, id: built.id, label: built.label, ...(children ? { children } : {}) };
}

/** Enough structural equality for template field values (scalars, arrays, plain objects). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a !== 'object') return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual((a as any)[k], (b as any)[k]));
}

/** The inverse of materialize: a full instance node back down to what gets STORED.
 *
 *  This is the half that makes the design real. Without it, saving a template diffs a
 *  materialized instance against a base that has never heard of it, the overlay stores the
 *  entire expanded node in `added`, and that instance is frozen against every future taxonomy
 *  change — which is precisely the staleness the reference format exists to prevent. The bug
 *  would be invisible: everything renders correctly, and the schema quietly stops updating.
 *
 *  Lossless by construction rather than by trust. Identity fields are always kept; every other
 *  field is kept ONLY where it differs from what materialization would rebuild, so an edit made
 *  to one instance survives while the ~30 fields it shares with the library do not get written.
 */
export function dematerializeInstance(node: Node, library: Node | null | undefined): Node {
  const ref = typeof node.instanceOf === 'string' ? node.instanceOf : null;
  if (!ref || !library) return node;
  const built = materializeInstance(
    { id: node.id, label: node.label, kind: node.kind, instanceOf: ref } as Node, library,
  );
  return reduce(node, built, { id: node.id, label: node.label, kind: node.kind, instanceOf: ref });
}

/** `node` minus everything materialization would rebuild. Recurses into children so ONE edited
 *  checkpoint stores one changed field, not the whole subtree — the difference between a
 *  reference that keeps tracking the taxonomy and the frozen copy this replaces. */
function reduce(node: Node, built: Node, identity: Node): Node {
  const out: Node = { ...identity };
  for (const [k, v] of Object.entries(node)) {
    if (k in identity || k === 'children') continue;
    if (!deepEqual(v, (built as any)[k])) out[k] = v;
  }
  if (Array.isArray(node.children)) {
    const builtKids = new Map((built.children ?? []).map(c => [c.id, c]));
    const kids: Node[] = [];
    for (const c of node.children) {
      const b = builtKids.get(c.id);
      if (!b) { kids.push(c); continue; }               // hand-added: stored whole
      if (deepEqual(c, b)) continue;                    // pure library content: stored not at all
      kids.push(reduce(c, b, { id: c.id, label: c.label, kind: c.kind }));
    }
    if (kids.length) out.children = kids;
  }
  return out;
}

/** Every instance in a tree, reduced to its stored form. Call before diffing on save. */
export function dematerializeInstances(systems: Node[], lookup: (id: string) => Node | null): Node[] {
  const walk = (n: Node): Node => {
    const ref = typeof n.instanceOf === 'string' ? n.instanceOf : null;
    if (ref) return dematerializeInstance(n, lookup(ref));
    if (Array.isArray(n.children)) return { ...n, children: n.children.map(walk) };
    return n;
  };
  return (systems ?? []).map(walk);
}

/** Walk a composed template and replace every instance reference with a materialized node.
 *  `lookup` resolves a library id against the pack. Idempotent — a node that is already
 *  materialized (has children or its own fields) is re-materialized from the library, which is
 *  exactly how it stays current. */
export function materializeInstances(systems: Node[], lookup: (id: string) => Node | null): Node[] {
  const walk = (n: Node): Node => {
    const ref = typeof n.instanceOf === 'string' ? n.instanceOf : null;
    const self = ref ? materializeInstance(n, lookup(ref)) : n;
    if (Array.isArray(self.children)) return { ...self, children: self.children.map(walk) };
    return self;
  };
  return (systems ?? []).map(walk);
}
