// ─── specKeyDefs — the Ledrix definitions that fix every spec key (Phase 1, 2026-10-16) ─────────────
//
// `conditionMatch.specStoreKey` decides a key from the node's LEDRIX definition, not from a company's edited
// template, so adding or removing a field in Template Builder never moves a stored value. The definitions
// are the BUNDLED core pack — never an adopted remote pack, which could change shape between releases and
// would move keys with it. A change to the bundled pack that would move a key fails `verify:spec-keys`
// (golden list).
//
// Imported for its side effect by the modules that compute or read keys (InspectionTemplate, specStore).
import corePack from './ledrix.core.json';
import { registerSpecKeyDefs, type SpecKeyDef } from './conditionMatch';

const defs = new Map<string, SpecKeyDef>();
const keyAttr = (a: any) => ({ id: a.id, ...(a.legacyBareKey ? { legacyBareKey: true } : {}), ...(a.formerBareKey ? { formerBareKey: true } : {}) });
const nodes: any[] = ((corePack as any).systems ?? []).flatMap((sys: any) => sys.nodes ?? []);
const labelOf = new Map<string, string>(nodes.map(n => [String(n.id), String(n.label ?? n.id)]));
for (const n of nodes) {
  defs.set(n.id, {
    // AGE ROWS (owner 2026-11-04): a row with `storedOn` stores its field on that owner's key, under the owner's label.
    attributes: (n.attributes ?? []).map((a: any) => ({ ...keyAttr(a),
      ...(n.storedOn ? { storedOn: String(n.storedOn), storedOnLabel: labelOf.get(String(n.storedOn)) ?? String(n.storedOn) } : {}) })),
    hasMethod: Array.isArray(n.method) && n.method.length > 0,
  });
}
// …and the owner's definition still lists that field (marked `movedTo`), so the owner's keys — and the shape that
// decides them — are exactly what they were before the row existed. verify:spec-keys holds the golden list.
for (const n of nodes) {
  if (!n.storedOn) continue;
  const owner = defs.get(String(n.storedOn));
  if (!owner) continue;
  defs.set(String(n.storedOn), { ...owner, attributes: [...owner.attributes, ...(n.attributes ?? []).map((a: any) => ({ ...keyAttr(a), movedTo: n.id }))] });
}
registerSpecKeyDefs(id => defs.get(id));

export const SPEC_KEY_DEFS_REGISTERED = true;
