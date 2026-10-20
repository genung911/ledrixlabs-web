// Desktop template editor — the owner's direct edits, as template operations.
//
// A direct edit is a change set the owner approved as they made it (templateOps header: "there is no second,
// manual-only path"). So every control in the editor builds ops here, and applyManual runs them through the same
// pipeline Ledrix's proposals use — parse, anchor, validate, apply all-or-nothing, record provenance — which is
// what makes every edit undoable and every refusal explainable. PURE: no store, no network, no clock read.
import type { InspectionTemplate, TemplateNode, ComponentAttribute } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp, FindingShortcut } from '@/lib/templateBuilder/core/templateOps';
import { createChangeSet, setStatus, type ChangeSet } from '@/lib/templateBuilder/core/templateChangeSets';
import { applyToDraft, type TemplateDraft } from '@/lib/templateBuilder/core/templateDraft';
import { allIds } from '@/lib/templateBuilder/core/templateValidate';

export type Author = ChangeSet['author'];
export type ManualResult = { ok: true; draft: TemplateDraft } | { ok: false; error: string };

let seq = 0;
export const mintId = (prefix: string, now: number) => `${prefix}_${now.toString(36)}_${(seq++).toString(36)}`;

/** Apply the owner's own edit to the draft. Refused edits leave the draft exactly as it was. */
export function applyManual(d: TemplateDraft, ops: TemplateOp[], author: Author, now: number): ManualResult {
  if (!ops.length) return { ok: true, draft: d };
  const c = createChangeSet({ id: mintId('manual', now), source: 'manual', author, base: d.tree, now, ops: ops.map(op => ({ op })) });
  if (!c.ok) return { ok: false, error: c.errors.map(e => e.error).join(' ') };
  let cs = c.cs;
  for (const e of cs.entries) { const n = setStatus(cs, e.id, 'accepted'); if (n) cs = n; }
  const r = applyToDraft(d, cs, now);
  return r.ok ? { ok: true, draft: r.draft } : { ok: false, error: r.error };
}

// ── finding things ────────────────────────────────────────────────────────────────────────────────────────

export type Located = { node: TemplateNode; system: TemplateNode; parent: TemplateNode | null; index: number; depth: number };

export function locate(tree: InspectionTemplate, id: string | null | undefined): Located | null {
  if (!id) return null;
  for (const system of tree.systems) {
    if (system.id === id) return { node: system, system, parent: null, index: tree.systems.indexOf(system), depth: 0 };
    const walk = (n: TemplateNode, depth: number): Located | null => {
      const kids = n.children ?? [];
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].id === id) return { node: kids[i], system, parent: n, index: i, depth };
        const hit = walk(kids[i], depth + 1); if (hit) return hit;
      }
      return null;
    };
    const hit = walk(system, 1); if (hit) return hit;
  }
  return null;
}

/** Every item of a system in display order, with its depth (subsystems are headings, components rows). */
export function flatItems(system: TemplateNode): Array<{ node: TemplateNode; depth: number; parentId: string }> {
  const out: Array<{ node: TemplateNode; depth: number; parentId: string }> = [];
  const walk = (n: TemplateNode, depth: number) => (n.children ?? []).forEach(c => { out.push({ node: c, depth, parentId: n.id }); walk(c, depth + 1); });
  walk(system, 0);
  return out;
}

/** A short, honest line under an item: what the inspector records there. */
export function itemSummary(n: TemplateNode): string {
  const x = n as TemplateNode & { findingShortcuts?: FindingShortcut[] };
  const parts: string[] = [];
  if (n.pointsTo) parts.push('Shown here from another section');
  for (const a of n.attributes ?? []) parts.push(a.label);
  if (n.condition) parts.push('Condition');
  if (x.findingShortcuts?.length) parts.push(`${x.findingShortcuts.length} finding shortcut${x.findingShortcuts.length === 1 ? '' : 's'}`);
  if (!parts.length && n.children?.length) return `${n.children.length} item${n.children.length === 1 ? '' : 's'}`;
  return parts.length ? parts.join(' · ') : 'Nothing recorded yet';
}

// ── ids ───────────────────────────────────────────────────────────────────────────────────────────────────

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'item';

/** A new id inside a system: lowercase snake case, starting with the system's id (the authoring rule), unique in
 *  the whole template including set-aside items. */
export function newNodeId(tree: InspectionTemplate, systemId: string | null, label: string): string {
  const used = new Set(allIds(tree));
  const base = systemId ? `${systemId}__${slug(label)}` : slug(label);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
}
export function newAttrId(node: TemplateNode, label: string): string {
  const used = new Set((node.attributes ?? []).map(a => a.id));
  const base = slug(label);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}_${i}`)) return `${base}_${i}`;
}

// ── the edits ─────────────────────────────────────────────────────────────────────────────────────────────

const setField = (nodeId: string, field: string, value: unknown): TemplateOp => ({ op: 'setNodeField', nodeId, field, value });
const listOrNull = (xs: string[]) => { const v = xs.map(s => s.trim()).filter(Boolean); return v.length ? v : null; };

export const ops = {
  rename: (nodeId: string, label: string): TemplateOp[] => (label.trim() ? [setField(nodeId, 'label', label.trim())] : []),
  describe: (nodeId: string, text: string): TemplateOp[] => [setField(nodeId, 'description', text.trim() ? text : null)],
  /** Whether a new inspection covers this system (the template's `defaultActive`). */
  coverByDefault: (systemId: string, on: boolean): TemplateOp[] => [setField(systemId, 'defaultActive', on ? null : false)],
  assessed: (nodeId: string, on: boolean): TemplateOp[] => [setField(nodeId, 'condition', on ? true : null)],
  limitations: (nodeId: string, reasons: string[]): TemplateOp[] => [setField(nodeId, 'limitations', listOrNull(reasons))],
  findingShortcuts: (node: TemplateNode, labels: string[], now: number): TemplateOp[] => {
    const prior = ((node as TemplateNode & { findingShortcuts?: FindingShortcut[] }).findingShortcuts ?? []);
    const byLabel = new Map(prior.map(s => [s.label.trim().toLowerCase(), s]));
    const used = new Set<string>();
    const next = labels.map(l => l.trim()).filter(Boolean).map(label => {
      const keep = byLabel.get(label.toLowerCase());
      if (keep && !used.has(keep.id)) { used.add(keep.id); return { ...keep, label }; }
      let id = slug(label); while (used.has(id)) id = `${id}_${(now % 1000).toString(36)}`; used.add(id);
      return { id, label };
    });
    return [setField(node.id, 'findingShortcuts', next.length ? next : null)];
  },
  addSystem: (tree: InspectionTemplate, label: string): TemplateOp[] => {
    const id = newNodeId(tree, null, label);
    return [{ op: 'addNode', parentId: null, node: { id, label: label.trim(), kind: 'system', children: [] } }];
  },
  addItem: (tree: InspectionTemplate, systemId: string, parentId: string, label: string, kind: 'component' | 'subsystem' = 'component'): TemplateOp[] => {
    const id = newNodeId(tree, systemId, label);
    const node: TemplateNode = kind === 'component' ? { id, label: label.trim(), kind, condition: true } : { id, label: label.trim(), kind, children: [] };
    return [{ op: 'addNode', parentId, node }];
  },
  setAside: (nodeId: string): TemplateOp[] => [{ op: 'trimNode', nodeId }],
  restore: (nodeId: string): TemplateOp[] => [{ op: 'restoreNode', nodeId }],
  move: (nodeId: string, parentId: string | null, index: number): TemplateOp[] => [{ op: 'moveNode', nodeId, parentId, index }],
  addField: (node: TemplateNode, label: string, values: string[], multi: boolean): TemplateOp[] =>
    [{ op: 'addAttribute', nodeId: node.id, attribute: { id: newAttrId(node, label), label: label.trim(), values: values.map(v => v.trim()).filter(Boolean), multi } }],
  fieldLabel: (nodeId: string, a: ComponentAttribute, label: string): TemplateOp[] =>
    label.trim() ? [{ op: 'setAttributeField', nodeId, attrId: a.id, field: 'label', value: label.trim() }] : [],
  fieldValues: (nodeId: string, a: ComponentAttribute, values: string[]): TemplateOp[] =>
    [{ op: 'setAttributeField', nodeId, attrId: a.id, field: 'values', value: values.map(v => v.trim()).filter(Boolean) }],
  fieldMulti: (nodeId: string, a: ComponentAttribute, multi: boolean): TemplateOp[] =>
    [{ op: 'setAttributeField', nodeId, attrId: a.id, field: 'multi', value: multi }],
  fieldOther: (nodeId: string, a: ComponentAttribute, on: boolean): TemplateOp[] =>
    [{ op: 'setAttributeField', nodeId, attrId: a.id, field: 'allowTyped', value: on }],
  removeField: (nodeId: string, a: ComponentAttribute): TemplateOp[] => [{ op: 'removeAttribute', nodeId, attrId: a.id }],
};

/** A blank template for "New template → Blank". */
export const blankTree = (name: string): InspectionTemplate => ({ id: 'custom', name, version: 1, systems: [] });
