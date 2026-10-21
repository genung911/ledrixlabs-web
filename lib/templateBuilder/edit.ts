// What a reviewer may change on a proposed entry, as plain controls — the same rules as the app's review screen
// (ledrix-app src/app/TemplateDraftScreen.tsx › editableOf / withEdit). Anything else is accept / decline only.
// The edited op goes through templateChangeSets.editEntry, which re-parses, re-anchors and re-validates it.
import type { TemplateOp } from './core/templateOps';

export type Edit = {
  text?: { label: string; value: string; key: string };
  list?: { label: string; value: string[]; key: string };
  toggle?: { label: string; value: boolean; key: string };
};

export function editableOf(op: TemplateOp): Edit | null {
  switch (op.op) {
    case 'addNode': return { text: { label: 'Name', value: op.node.label, key: 'label' }, toggle: { label: 'Assessed (OK · Finding · Limitation)', value: op.node.condition === true, key: 'condition' } };
    case 'setNodeField':
      if (typeof op.value === 'string') return { text: { label: op.field === 'label' ? 'Name' : op.field === 'description' ? 'Guidance' : 'Text', value: op.value, key: 'value' } };
      if (Array.isArray(op.value) && op.value.every(v => typeof v === 'string')) return { list: { label: 'Choices (one per line)', value: op.value as string[], key: 'value' } };
      if (typeof op.value === 'boolean') return { toggle: { label: op.field === 'condition' ? 'Assessed' : op.field, value: op.value, key: 'value' } };
      return null;
    case 'setAttributeField':
      if (op.field === 'values') return { list: { label: 'Choices (one per line)', value: (op.value as string[]) ?? [], key: 'value' } };
      if (op.field === 'label' && typeof op.value === 'string') return { text: { label: 'Field name', value: op.value, key: 'value' } };
      if (typeof op.value === 'boolean') return { toggle: { label: op.field === 'multi' ? 'Several answers allowed' : 'Offer Other (typed)', value: op.value, key: 'value' } };
      return null;
    case 'addAttribute': return { text: { label: 'Field name', value: String(op.attribute.label ?? ''), key: 'label' }, list: { label: 'Choices (one per line)', value: (op.attribute.values as string[]) ?? [], key: 'values' }, toggle: { label: 'Several answers allowed', value: op.attribute.multi === true, key: 'multi' } };
    default: return null;
  }
}

export function withEdit(op: TemplateOp, text?: string, list?: string[], toggle?: boolean): TemplateOp {
  const x = JSON.parse(JSON.stringify(op));
  delete x.expect;                                   // re-anchored against the draft by editEntry
  if (op.op === 'addNode') { if (text !== undefined) x.node.label = text; if (toggle !== undefined) { if (toggle) x.node.condition = true; else delete x.node.condition; } return x; }
  if (op.op === 'addAttribute') { if (text !== undefined) x.attribute.label = text; if (list) x.attribute.values = list; if (toggle !== undefined) x.attribute.multi = toggle; return x; }
  if (text !== undefined) x.value = text; else if (list) x.value = list; else if (toggle !== undefined) x.value = toggle;
  return x;
}
