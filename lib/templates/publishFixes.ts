// What stands between a draft and Publish — each one a place to tap, not a description to go and find (owner,
// 2026-10-27). PURE: the Review & Publish section and the header read this; nothing here writes.
//
// Every fix names WHERE it is fixed: the section, and for an item, the item and the tab its problem lives on.
// `blocks` = Publish stays off until it is fixed; otherwise it is worth a look but never stops a publish.
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { Issue } from '@/lib/templateBuilder/core/templateValidate';
import { locate, ops } from './editorModel';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';

export type FixTab = 'overview' | 'condition' | 'details' | 'requirements' | 'applicability';
export type Fix = {
  key: string;
  blocks: boolean;
  /** Where: "HEATING › Thermostat", or a section name. */
  where: string;
  /** What is wrong, in a few words. */
  what: string;
  go: { section: 'buildings' | 'systems' | 'requirements'; systemId?: string; nodeId?: string; tab?: FixTab };
  /** A one-tap fix, when there is a safe one. */
  quick?: { label: string; ops: TemplateOp[] };
};

/** The tab an item's validation problem is fixed on. */
const TAB_OF: Record<string, FixTab> = {
  rule_unsupported: 'applicability', rule_missing_item: 'applicability', rule_missing_field: 'applicability', rule_self: 'applicability', rule_cycle: 'applicability',
  duplicate_attr: 'details', duplicate_value: 'details', empty_value: 'details', title_missing_field: 'details', group_missing_host: 'details',
  duplicate_shortcut: 'condition',
};

const strip = (m: string) => m.replace(/^"[^"]*"(: | )/, '').replace(/\.$/, '');

export function publishFixes(tree: InspectionTemplate, issues: readonly Issue[], building: { errors: readonly string[]; warnings: readonly string[] }): Fix[] {
  const out: Fix[] = [];
  const at = (id: string | undefined) => (id ? locate(tree, id) : null);
  const whereOf = (l: NonNullable<ReturnType<typeof locate>>) => (l.node === l.system ? l.system.label : `${l.system.label} › ${l.node.label}`);

  // 1 · item requirements no longer hold Publish (Stage 2, 2026-10-27 — the phone checks them, soft). Changes to Ledrix's
  //     own default rules still do.
  const t = tree as InspectionTemplate & { requirementOverrides?: unknown; requirementDefaults?: unknown };
  if (t.requirementOverrides !== undefined && !(t.requirementOverrides && typeof t.requirementOverrides === 'object' && !Object.keys(t.requirementOverrides).length))
    out.push({ key: 'req:overrides', blocks: true, where: 'Requirements', what: 'Changes to Ledrix default requirements', go: { section: 'requirements' } });

  // 2 · building types
  building.errors.forEach((m, i) => out.push({ key: `b:e${i}`, blocks: true, where: 'Building types', what: m, go: { section: 'buildings' } }));

  // 3 · template checks — the item and the tab the problem lives on
  issues.forEach((i, k) => {
    const l = at(i.nodeId);
    out.push({ key: `i:${k}:${i.code}`, blocks: i.severity === 'error', where: l ? whereOf(l) : 'Template', what: strip(i.message),
      go: l ? { section: 'systems', systemId: l.system.id, ...(l.node !== l.system ? { nodeId: l.node.id, tab: TAB_OF[i.code] ?? 'overview' } : {}) } : { section: 'systems' } });
  });

  // 4 · items inspectors won't see (directly under a system that has groups)
  for (const s of tree.systems) {
    if (!(s.children ?? []).some(c => c.kind === 'subsystem')) continue;
    for (const c of s.children ?? []) if (c.kind === 'component')
      out.push({ key: `u:${c.id}`, blocks: false, where: `${s.label} › ${c.label}`, what: 'Not shown to inspectors — move it into a group', go: { section: 'systems', systemId: s.id, nodeId: c.id, tab: 'overview' } });
  }
  building.warnings.forEach((m, i) => out.push({ key: `b:w${i}`, blocks: false, where: 'Building types', what: m, go: { section: 'buildings' } }));

  return out.sort((a, b) => Number(b.blocks) - Number(a.blocks));
}
