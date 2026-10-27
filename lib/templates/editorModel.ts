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
  if (recordsNothingHere(n)) return 'Nothing to record — hidden from inspectors';
  const x = n as TemplateNode & { findingShortcuts?: FindingShortcut[] };
  const parts: string[] = [];
  if (n.pointsTo) parts.push('Shown here from another section');
  for (const a of n.attributes ?? []) parts.push(a.label);
  if (assessesCondition(n)) parts.push('Condition');
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

// ── the item's three switches: Condition, Details, Requirements (owner rulings 2026-10-27 (second)) ──────────────
// Switching Details or Requirements OFF keeps their setup on the item, hidden (`parked`); switching back ON restores it.
// The phone never reads `parked`, so a switched-off part is simply absent for inspectors.
type Parked = { attributes?: ComponentAttribute[]; requirements?: unknown[] };
const parkedOf = (n: TemplateNode): Parked => ((n as TemplateNode & { parked?: Parked }).parked ?? {});
const currentRequirements = (n: TemplateNode): unknown[] => ((n as TemplateNode & { requirements?: unknown[] }).requirements ?? []);
function parkedWith(n: TemplateNode, patch: Parked): Parked | null {
  const p: Record<string, unknown> = { ...parkedOf(n), ...patch };
  for (const k of Object.keys(p)) if (!Array.isArray(p[k]) || !(p[k] as unknown[]).length) delete p[k];
  return Object.keys(p).length ? (p as Parked) : null;
}
/** Details fields kept while the switch is off. */
export const parkedDetails = (n: TemplateNode): number => parkedOf(n).attributes?.length ?? 0;
/** Requirements kept while the switch is off. */
export const parkedRequirementCount = (n: TemplateNode): number => parkedOf(n).requirements?.length ?? 0;
/** An item whose company switched Condition, Details and Requirements all off asks inspectors for nothing — the phone
 *  hides it (ledrix-app conditionMatch.recordsNothing). */
export function recordsNothingHere(n: TemplateNode): boolean {
  if (n.kind !== 'component' || n.pointsTo || (n as TemplateNode & { freeFormValue?: boolean }).freeFormValue) return false;
  return !assessesCondition(n) && !(n.attributes ?? []).length && !((n as TemplateNode & { method?: string[] }).method ?? []).length && !currentRequirements(n).length;
}
const listOrNull = (xs: string[]) => { const v = xs.map(s => s.trim()).filter(Boolean); return v.length ? v : null; };

export const ops = {
  rename: (nodeId: string, label: string): TemplateOp[] => (label.trim() ? [setField(nodeId, 'label', label.trim())] : []),
  describe: (nodeId: string, text: string): TemplateOp[] => [setField(nodeId, 'description', text.trim() ? text : null)],
  /** Whether a new inspection covers this system. The app's rule (ledrix-app inspectionOffering.ts, mirrored by
   *  isCovered below): covered = `defaultActive === true`; a template that switches NONE on uses Ledrix's default
   *  list instead. So the first switch in such a template writes every system's current state explicitly — otherwise
   *  turning one system on would silently turn every other default system off. */
  coverByDefault: (tree: InspectionTemplate, systemId: string, on: boolean): TemplateOp[] => {
    const explicit = tree.systems.some(s => s.defaultActive === true);
    const out: TemplateOp[] = [];
    for (const s of tree.systems) {
      const want = s.id === systemId ? on : isCovered(tree, s);
      if (s.id === systemId || !explicit) { if ((s.defaultActive === true) !== want || s.defaultActive === undefined) out.push(setField(s.id, 'defaultActive', want)); }
    }
    return out;
  },
  // EXPLICIT BOTH WAYS (report integrity, 2026-10-24). OFF wrote `null`, which deletes the field — and the app reads a
  // MISSING `condition` as ON (conditionMatch.componentAxes: `n.condition ?? true`), so the editor said "not assessed"
  // while every inspection kept assessing it. ON writes true, OFF writes false; a missing value stays the app's default.
  assessed: (nodeId: string, on: boolean): TemplateOp[] => [setField(nodeId, 'condition', on)],
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
    // A new system is covered — the owner added it to inspect it. In a template still on Ledrix's default list,
    // the others are written explicitly first, so the new `defaultActive: true` doesn't switch them all off.
    const keep: TemplateOp[] = tree.systems.some(s => s.defaultActive === true) ? []
      : tree.systems.map(s => setField(s.id, 'defaultActive', isCovered(tree, s)));
    return [...keep, { op: 'addNode', parentId: null, node: { id, label: label.trim(), kind: 'system', defaultActive: true, children: [] } }];
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
  /** When the item is inspected: a rule in the existing grammar (lib/templates/ruleModel.writeRule), or null for
   *  "always". `whenUnknown` only means something with a rule, so clearing the rule clears it too. */
  applicability: (node: TemplateNode, rule: unknown | null, whenUnknown: 'show' | 'hide' | null): TemplateOp[] => {
    const x = node as TemplateNode & { appliesWhen?: unknown; whenUnknown?: unknown };
    const out: TemplateOp[] = [setField(node.id, 'appliesWhen', rule)];
    const wu = rule === null ? null : whenUnknown;
    if ((x.whenUnknown ?? null) !== wu) out.push(setField(node.id, 'whenUnknown', wu));
    return out;
  },
  /** What an item with a rule does before the rule's answer is recorded: 'hide' (not applicable until answered) or
   *  absent (shown; the inspector decides — the runtime's default). */
  whenUnknown: (nodeId: string, hide: boolean): TemplateOp[] => [setField(nodeId, 'whenUnknown', hide ? 'hide' : null)],
  /** The item's company requirements, the whole list (lib/templates/requirementModel builds them; the contract judges
   *  them on every edit). The ONLY writer of `requirements` in the website. It never writes the Ledrix default-set pin
   *  or overrides. A template carrying any is not published (useDraft.publish). */
  setRequirements: (nodeId: string, defs: readonly unknown[]): TemplateOp[] => [setField(nodeId, 'requirements', defs.length ? [...defs] : null)],
  /** Details switch. OFF parks every field (kept, hidden); ON restores the parked fields. Nothing to park or restore →
   *  no change (the panel just opens or closes the empty Details tab). */
  switchDetails: (node: TemplateNode, on: boolean): TemplateOp[] => {
    const attrs = node.attributes ?? [], parked = parkedOf(node).attributes ?? [];
    if (!on) return attrs.length
      ? [setField(node.id, 'parked', parkedWith(node, { attributes: [...attrs] })), ...attrs.map(a => ({ op: 'removeAttribute', nodeId: node.id, attrId: a.id }) as TemplateOp)] : [];
    return parked.length ? [...parked.map(a => ({ op: 'addAttribute', nodeId: node.id, attribute: a }) as TemplateOp), setField(node.id, 'parked', parkedWith(node, { attributes: [] }))] : [];
  },
  /** Requirements switch — the same keep-but-hide rule. */
  switchRequirements: (node: TemplateNode, on: boolean): TemplateOp[] => {
    const cur = currentRequirements(node), parked = parkedOf(node).requirements ?? [];
    if (!on) return cur.length ? [setField(node.id, 'parked', parkedWith(node, { requirements: [...cur] })), ...ops.setRequirements(node.id, [])] : [];
    return parked.length ? [...ops.setRequirements(node.id, parked), setField(node.id, 'parked', parkedWith(node, { requirements: [] }))] : [];
  },
};

/** Ledrix's default coverage when a template switches no system on (ledrix-app inspectionOffering.ts). */
export const DEFAULT_COVERED = ['safety', 'roofing', 'attic', 'exterior', 'interior', 'foundation', 'electrical', 'plumbing', 'water_heater', 'heating', 'cooling'];

/** Is this system covered when an inspection starts? The app's rule, exactly (offeringForNewSnapshot). */
export function isCovered(tree: InspectionTemplate, sys: TemplateNode): boolean {
  if (tree.offeringModel === 1) return sys.inScope === true;
  return tree.systems.some(s => s.defaultActive === true) ? sys.defaultActive === true : DEFAULT_COVERED.includes(sys.id);
}

/** A blank template for "New template → Blank". */
export const blankTree = (name: string): InspectionTemplate => ({ id: 'custom', name, version: 1, systems: [] });

/** Does this item take a condition (Satisfactory / Limitation / Finding)? The APP's rule, exactly —
 *  ledrix-app src/core/taxonomy/conditionMatch.ts `componentAxes` + `facetOf`: an item in the typed shape assesses
 *  unless `condition` is false (missing = true); an older item (options / facet) assesses unless its facet is
 *  'spec'. The editor shows THIS, so the switch, the saved draft, the published template and the phone agree —
 *  including for a legacy item that never stored the field (scripts/verify-template-builder.mjs cross-checks it
 *  against the app's own function). */
export function assessesCondition(n: TemplateNode): boolean {
  const x = n as TemplateNode & { options?: string[]; facet?: string; method?: unknown };
  if (n.attributes || n.condition !== undefined || n.limitations || x.method) return n.condition ?? true;
  const facet = x.facet ?? ((x.options?.length ?? 0) > 0 ? 'both' : 'condition');
  return facet !== 'spec';
}
