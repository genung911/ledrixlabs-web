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
for (const sys of (corePack as any).systems ?? []) {
  for (const n of sys.nodes ?? []) {
    defs.set(n.id, {
      attributes: (n.attributes ?? []).map((a: any) => ({ id: a.id, ...(a.legacyBareKey ? { legacyBareKey: true } : {}), ...(a.formerBareKey ? { formerBareKey: true } : {}) })),
      hasMethod: Array.isArray(n.method) && n.method.length > 0,
    });
  }
}
registerSpecKeyDefs(id => defs.get(id));

export const SPEC_KEY_DEFS_REGISTERED = true;
