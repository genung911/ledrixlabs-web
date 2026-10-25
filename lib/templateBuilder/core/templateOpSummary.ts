// ─── templateOpSummary — every proposed change in plain words (Template Builder, increment 2) ───────────────
//
// PURE. What the owner reads in review: a title ("Add “Foundation Walls”"), a detail line, a before/after where
// there is one, and the section it belongs to. Labels are resolved against the tree AS IT WILL BE when that
// change runs (summarizeChangeSet walks the change set in order), so a field added to a component the same
// proposal creates still reads by name rather than by id.
import type { InspectionTemplate, TemplateNode } from './InspectionTemplate';
import { applyOp, type TemplateOp, type Predicate } from './templateOps';
import type { ChangeSet, ChangeEntry } from './templateChangeSets';

export type OpSummary = { title: string; detail?: string; before?: string; after?: string; section: string[] };

type Hit = { node: TemplateNode; path: TemplateNode[] };
function find(tpl: InspectionTemplate, id: string): Hit | null {
  let hit: Hit | null = null;
  const walk = (n: TemplateNode, path: TemplateNode[]) => {
    if (hit) return;
    if (n.id === id) { hit = { node: n, path }; return; }
    for (const c of n.children ?? []) walk(c, [...path, n]);
    for (const c of n.trimmed ?? []) walk(c, [...path, n]);
  };
  for (const s of tpl.systems) walk(s, []);
  for (const s of tpl.trimmedSystems ?? []) walk(s, []);
  return hit;
}
const q = (s: string) => `“${s}”`;
const labelOf = (tpl: InspectionTemplate, id: string | null) => (id ? find(tpl, id)?.node.label ?? id : 'the template');
const sectionOf = (tpl: InspectionTemplate, id: string | null): string[] => {
  if (!id) return [];
  const h = find(tpl, id);
  if (!h) return [];
  const chain = [...h.path, h.node].filter(n => n.kind !== 'component');
  return chain.map(n => n.label);
};
const list = (xs: unknown) => (Array.isArray(xs) && xs.length ? xs.map(String).join(' · ') : 'none');

/** "Foundation Type is Crawlspace or Basement". */
export function describeRule(tpl: InspectionTemplate, p: Predicate): string {
  if ('all' in p) return p.all.map(x => describeRule(tpl, x)).join(' and ');
  if ('any' in p) return p.any.map(x => describeRule(tpl, x)).join(' or ');
  const [nid, aid] = p.field.split('::');
  const n = find(tpl, nid)?.node;
  const a = n?.attributes?.find(x => x.id === aid);
  const field = n ? `${n.label}${a && a.label !== n.label ? ` ${a.label}` : ''}` : p.field;
  return 'typed' in p ? `${field} is typed under Other` : `${field} is ${p.anyOf.join(' or ')}`;
}

const FIELD_WORDS: Record<string, string> = {
  description: 'Guidance', keywords: 'Voice words', method: 'Method choices', limitations: 'Limitation reasons',
  methodPrompt: 'Method question', titleFrom: 'Title from an answer', groupUnder: 'Shown under a spec card',
  whenUnknown: 'When the rule is unanswered', icon: 'Icon', locationAxis: 'Location', walkZones: 'Walk zones',
  trimmedOptions: 'Choices set aside', defaultActive: 'On for new inspections', appliesToTypes: 'Equipment types',
  equipmentTypes: 'Equipment type menu',
};

export function summarizeOp(op: TemplateOp, tpl: InspectionTemplate): OpSummary {
  switch (op.op) {
    case 'addNode': {
      const n = op.node as TemplateNode & Record<string, any>;
      const bits = [n.kind === 'subsystem' ? 'New section' : n.condition ? 'New assessed item' : 'New item'];
      if (n.attributes?.length) bits.push(`fields: ${n.attributes.map(a => a.label).join(', ')}`);
      if (n.appliesWhen) bits.push(`loads when ${describeRule(tpl, n.appliesWhen)}`);
      if (n.findingShortcuts?.length) bits.push(`shortcuts: ${n.findingShortcuts.map((s: any) => s.label).join(', ')}`);
      if (n.children?.length) bits.push(`${n.children.length} item${n.children.length === 1 ? '' : 's'} inside`);
      return { title: `Add ${q(n.label)}`, detail: bits.join(' · '), before: `Not in ${labelOf(tpl, op.parentId)}`, after: `In ${labelOf(tpl, op.parentId)}`, section: sectionOf(tpl, op.parentId) };
    }
    case 'trimNode': return { title: `Set aside ${q(labelOf(tpl, op.nodeId))}`, detail: 'Removed from what you inspect · stays restorable', section: sectionOf(tpl, op.nodeId) };
    case 'restoreNode': return { title: `Restore ${q(labelOf(tpl, op.nodeId))}`, detail: 'Back in what you inspect', section: sectionOf(tpl, op.nodeId) };
    case 'moveNode': {
      const h = find(tpl, op.nodeId);
      const from = h?.path[h.path.length - 1]?.id ?? null;
      return from === op.parentId
        ? { title: `Reorder ${q(labelOf(tpl, op.nodeId))}`, detail: `Position ${op.index + 1}`, section: sectionOf(tpl, op.nodeId) }
        : { title: `Move ${q(labelOf(tpl, op.nodeId))}`, before: `In ${labelOf(tpl, from)}`, after: `In ${labelOf(tpl, op.parentId)}`, section: sectionOf(tpl, op.parentId) };
    }
    case 'setNodeField': {
      const n = find(tpl, op.nodeId)?.node as (TemplateNode & Record<string, any>) | undefined;
      const name = n?.label ?? op.nodeId;
      const prev = n?.[op.field];
      const section = sectionOf(tpl, op.nodeId);
      if (op.field === 'label') return { title: `Rename ${q(String(prev ?? name))}`, before: String(prev ?? ''), after: String(op.value ?? ''), section };
      if (op.field === 'condition') return { title: `${op.value ? 'Assess' : 'Stop assessing'} ${q(name)}`, detail: op.value ? 'Gets OK · Finding · Limitation' : 'Described only', section };
      if (op.field === 'appliesWhen') return { title: op.value ? `Load ${q(name)} only when…` : `Always load ${q(name)}`, before: prev ? describeRule(tpl, prev) : 'always', after: op.value ? describeRule(tpl, op.value as Predicate) : 'always', section };
      if (op.field === 'requirements') return { title: `Requirements on ${q(name)}`, before: list((prev ?? []).map((r: any) => `${r.label} (${r.level})`)), after: list(((op.value as any[]) ?? []).map((r: any) => `${r.label} (${r.level})`)), section };
      if (op.field === 'findingShortcuts') return { title: `Shortcuts on ${q(name)}`, before: list((prev ?? []).map((s: any) => s.label)), after: list(((op.value as any[]) ?? []).map((s: any) => s.label + (s.defaultPriority ? ` (${s.defaultPriority})` : ''))), section };
      const word = FIELD_WORDS[op.field] ?? op.field;
      const show = (v: unknown) => (v == null ? 'none' : Array.isArray(v) ? list(v) : typeof v === 'object' ? JSON.stringify(v) : String(v));
      return { title: `${word} on ${q(name)}`, before: show(prev), after: show(op.value), section };
    }
    case 'addAttribute': {
      const a = op.attribute as Record<string, any>;
      return { title: `Add field ${q(String(a.label))} to ${q(labelOf(tpl, op.nodeId))}`, detail: `${a.multi ? 'Several answers' : 'One answer'} · ${list(a.values)}${a.allowTyped ? ' · Other (typed)' : ''}`, section: sectionOf(tpl, op.nodeId) };
    }
    case 'removeAttribute': {
      const a = find(tpl, op.nodeId)?.node.attributes?.find(x => x.id === op.attrId);
      return { title: `Remove field ${q(a?.label ?? op.attrId)} from ${q(labelOf(tpl, op.nodeId))}`, detail: 'What the report describes for this item', section: sectionOf(tpl, op.nodeId) };
    }
    case 'setAttributeField': {
      const n = find(tpl, op.nodeId)?.node;
      const a = n?.attributes?.find(x => x.id === op.attrId) as Record<string, any> | undefined;
      const name = `${n?.label ?? op.nodeId} — ${a?.label ?? op.attrId}`;
      const section = sectionOf(tpl, op.nodeId);
      if (op.field === 'values') return { title: `Choices for ${q(name)}`, before: list(a?.values), after: list(op.value), section };
      if (op.field === 'multi') return { title: `${q(name)}: ${op.value ? 'several answers' : 'one answer'}`, before: a?.multi ? 'Several answers' : 'One answer', after: op.value ? 'Several answers' : 'One answer', section };
      if (op.field === 'allowTyped') return { title: `${q(name)}: ${op.value ? 'offer' : 'stop offering'} Other (typed)`, section };
      return { title: `Rename field ${q(String(a?.label ?? op.attrId))}`, before: String(a?.label ?? ''), after: String(op.value ?? ''), section };
    }
    case 'addLink': return { title: `Show ${q(labelOf(tpl, op.homeId))} in ${q(labelOf(tpl, op.parentId))}`, detail: 'One record, answered from either place — not a copy', section: sectionOf(tpl, op.parentId) };
    case 'removeLink': return { title: `Stop showing ${q(labelOf(tpl, op.pointerId))} here`, detail: 'The record itself is unchanged', section: sectionOf(tpl, op.pointerId) };
    case 'setTemplateField': return { title: op.field === 'name' ? `Rename the template` : op.field === 'structureTypes' ? 'Change the building types'
      : op.field === 'requirementDefaults' ? 'Change the Ledrix default requirements' : op.field === 'requirementOverrides' ? 'Change Ledrix default requirements for this template' : `Change ${op.field}`, after: typeof op.value === 'string' ? op.value : undefined, section: [] };
    case 'unaddNode': return { title: `Remove ${q(labelOf(tpl, op.nodeId))} (undo)`, section: sectionOf(tpl, op.nodeId) };
    case 'reinsertNode': return { title: `Put back ${q(op.node.label)} (undo)`, section: sectionOf(tpl, op.parentId) };
  }
}

export type EntrySummary = OpSummary & { entry: ChangeEntry };

/** Each entry summarized against the tree as it will stand when it runs (earlier entries applied in order). */
export function summarizeChangeSet(cs: ChangeSet, base: InspectionTemplate): EntrySummary[] {
  let cur = base;
  return cs.entries.map(entry => {
    const op = entry.edited ?? entry.op;
    const s = summarizeOp(op, cur);
    const r = applyOp(cur, op);
    if (r.ok) cur = r.tpl;
    return { ...s, entry };
  });
}
