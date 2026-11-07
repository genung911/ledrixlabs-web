// Buildings across the top of the Template Builder (owner 2026-11-06, mockup https://claude.ai/artifact/HHfBh3wvLanc1CG4UcNxaU,
// "Approved. Build and push"): pick a building and Systems shows that building — its parts listed as usual, the rest in
// its Off list. The main house is the template itself (the Included switches, includeOps). Every other building is a
// building type (structureTypes.ts): its `systems`, and the groups / items inside them it starts without (`off`).
// Pure. Every change is ONE setTemplateField of the whole building-type list, so it validates and undoes like any edit;
// a template still on Ledrix's defaults gets its own list (limited to its systems) with the first change.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import {
  LEDRIX_DEFAULT_STRUCTURE_TYPES, hasOwnStructureTypes, isPartOff, newStructureTypeId, seedStructureTypes, structureTypesOf, type StructureTypeDef,
} from '@/lib/templateBuilder/core/structureTypes';

/** The template's buildings other than the main house — its own list, or Ledrix's starting list limited to its systems. */
export function buildingsOf(tree: InspectionTemplate): StructureTypeDef[] {
  return hasOwnStructureTypes(tree) ? structureTypesOf(tree).types : seedStructureTypes(tree);
}

/** Each node's parent in the template (null at a system). */
export function parentMap(tree: InspectionTemplate): Map<string, string | null> {
  const m = new Map<string, string | null>();
  const walk = (n: TemplateNode, p: string | null) => { m.set(n.id, p); for (const c of n.children ?? []) walk(c, n.id); };
  for (const s of tree.systems) walk(s, null);
  return m;
}
const topOf = (pm: Map<string, string | null>, id: string): string => { let cur = id; for (let i = 0; i < 50; i++) { const p = pm.get(cur); if (!p) return cur; cur = p; } return cur; };

/** Is this part in the building? A system: on its list. Anything inside: its system is, and neither it nor a group it
 *  sits in is off. */
export function inBuilding(b: StructureTypeDef, tree: InspectionTemplate, nodeId: string, pm = parentMap(tree)): boolean {
  if (!b.systems.includes(topOf(pm, nodeId))) return false;
  return !isPartOff(new Set(b.off ?? []), nodeId, id => pm.get(id) ?? null);
}

/** Switch a part on or off in ONE building — one op. On: its system joins the building, and any group above it that was
 *  off comes back with only this branch (its other children go on the off list), then the part itself. Off: a system
 *  leaves the list; a group or item joins the off list (and marks under it are dropped, the group covers them). */
export function partOps(tree: InspectionTemplate, typeId: string, nodeId: string, on: boolean): TemplateOp[] {
  const pm = parentMap(tree);
  const types = buildingsOf(tree).map(t => ({ ...t, systems: [...t.systems], off: [...(t.off ?? [])] }));
  const b = types.find(t => t.id === typeId);
  if (!b || !pm.has(nodeId)) return [];
  if (inBuilding(b, tree, nodeId, pm) === on) return [];
  const top = topOf(pm, nodeId);
  const isSystem = top === nodeId;
  const off = new Set(b.off);
  const byId = new Map<string, TemplateNode>();
  const walk = (n: TemplateNode) => { byId.set(n.id, n); (n.children ?? []).forEach(walk); };
  tree.systems.forEach(walk);
  const under = (id: string): string[] => { const out: string[] = []; const w = (n: TemplateNode) => { for (const c of n.children ?? []) { out.push(c.id); w(c); } }; const n = byId.get(id); if (n) w(n); return out; };
  if (on) {
    if (!b.systems.includes(top)) {
      b.systems = tree.systems.map(s => s.id).filter(id => id === top || b.systems.includes(id));
      // A system joining for one part brings only that part: its other top-level parts start off.
      if (!isSystem) for (const c of byId.get(top)?.children ?? []) off.add(c.id);
    }
    // The path from the system down to the part: an off step comes back with only this branch.
    const path: string[] = []; for (let cur: string | null | undefined = nodeId; cur && cur !== top; cur = pm.get(cur)) path.unshift(cur);
    for (let i = 0; i < path.length; i++) {
      const id = path[i];
      if (off.has(id)) {
        off.delete(id);
        if (i < path.length - 1) for (const c of byId.get(id)?.children ?? []) if (c.id !== path[i + 1]) off.add(c.id);
      }
    }
  } else if (isSystem) {
    b.systems = b.systems.filter(s => s !== nodeId);
    for (const id of under(nodeId)) off.delete(id);
  } else {
    for (const id of under(nodeId)) off.delete(id);
    off.add(nodeId);
  }
  b.off = [...off];
  if (!b.off.length) delete (b as Partial<StructureTypeDef>).off;
  return [{ op: 'setTemplateField', field: 'structureTypes', value: types }];
}

/** The building's parts that are off, as rows for its Off list: the highest off part of each branch, under its parent. */
export function offPartsIn(b: StructureTypeDef, tree: InspectionTemplate, systemId: string): Array<{ node: TemplateNode; under: string }> {
  const sys = tree.systems.find(s => s.id === systemId);
  if (!sys || !b.systems.includes(systemId)) return [];
  const off = new Set(b.off ?? []);
  const out: Array<{ node: TemplateNode; under: string }> = [];
  const walk = (n: TemplateNode) => { for (const c of n.children ?? []) { if (off.has(c.id)) out.push({ node: c, under: n.label }); else walk(c); } };
  walk(sys);
  return out;
}

/** Ledrix's buildings a template can add (the kinds it doesn't have yet), and a custom one. */
export function addableBuildings(tree: InspectionTemplate): StructureTypeDef[] {
  const have = new Set(buildingsOf(tree).map(t => t.kind ?? 'other'));
  const ids = new Set(tree.systems.map(s => s.id));
  return (LEDRIX_DEFAULT_STRUCTURE_TYPES as StructureTypeDef[]).filter(t => !have.has(t.kind ?? 'other')).map(t => ({ ...t, systems: t.systems.filter(s => ids.has(s)) }));
}
/** Add a building (one of Ledrix's, or a name of the company's own, starting with no systems). Returns the op and its id. */
export function addBuildingOps(tree: InspectionTemplate, from: StructureTypeDef | { name: string }, now: number): { ops: TemplateOp[]; id: string } | null {
  const types = buildingsOf(tree);
  const name = ('id' in from ? from.name : from.name).trim();
  if (!name || types.some(t => t.name.toLowerCase() === name.toLowerCase())) return null;
  const id = newStructureTypeId(types.map(t => t.id), now);
  const add: StructureTypeDef = 'id' in from ? { ...from, id, systems: [...from.systems] } : { id, name, icon: 'home-outline', systems: [], kind: 'other' };
  return { ops: [{ op: 'setTemplateField', field: 'structureTypes', value: [...types, add] }], id };
}
/** Rename, change the icon of, or remove one building — one op each. */
export function buildingEditOps(tree: InspectionTemplate, typeId: string, edit: { name?: string; icon?: string } | 'remove'): TemplateOp[] {
  const types = buildingsOf(tree);
  if (!types.some(t => t.id === typeId)) return [];
  const next = edit === 'remove' ? types.filter(t => t.id !== typeId) : types.map(t => (t.id === typeId ? { ...t, ...(edit.name?.trim() ? { name: edit.name.trim() } : {}), ...(edit.icon ? { icon: edit.icon } : {}) } : t));
  return [{ op: 'setTemplateField', field: 'structureTypes', value: next }];
}
