'use client';

// The workspace for whatever is selected in the tree: a system, a group, or a component (Details · Requirements ·
// Fields · Applicability · Report). Everything edits the one draft through `onOps`; nothing here reads or writes
// anything else.
import { useEffect, useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { structureTypesOf } from '@/lib/templateBuilder/core/structureTypes';
import { assessesCondition, includeOps, isCovered, itemSummary, locate, locateOff, ops, recordsNothingHere } from '@/lib/templates/editorModel';
import { requirementsOf } from '@/lib/templates/requirementModel';
import { ComponentCondition, ComponentFields, ComponentOverview, GroupDetails, ItemsPanel, LinkOverview, UnseenPill, notShownToInspectors, type TypeView } from './EditorParts';
import { RequirementsEditor } from './RequirementsEditor';
import { RuleEditor } from './RuleEditor';
import { Pill, Toggle, btn, label } from './ui';

type Sel = { systemId: string | null; nodeId: string | null };
type OnOps = (o: TemplateOp[]) => boolean;
export type ComponentTab = 'overview' | 'condition' | 'details' | 'requirements' | 'applicability';

const TAB_LABEL: Record<ComponentTab, string> = { overview: 'Overview', condition: 'Condition', details: 'Details', requirements: 'Requirements', applicability: 'Applicability' };

export function NodeWorkspace({ tree, sel, onSelect, onOps, disabled, tab, setTab, onOpenBuildingTypes, typeView }: {
  tree: InspectionTemplate; sel: Sel; onSelect: (s: Sel) => void; onOps: OnOps; disabled: boolean;
  tab: ComponentTab; setTab: (t: ComponentTab) => void; onOpenBuildingTypes: () => void;
  /** The selected system's by-type layout (owner 2026-11-05), when it has one. */
  typeView?: TypeView | null;
}) {
  // A switch turned ON with nothing behind it yet opens its empty tab for this item (it is "on" once something is added).
  const [opened, setOpened] = useState<Record<string, { details?: boolean; reqs?: boolean }>>({});
  const system = sel.systemId ? tree.systems.find(s => s.id === sel.systemId) ?? null : null;
  const loc = sel.nodeId ? locate(tree, sel.nodeId) : null;
  // SWITCHED OFF (owner 2026-11-05): a set-aside system, group or item opens with its switch Off and what it holds; the
  // switch turns it back on where it was. Editing waits until it is on.
  const off = !loc ? locateOff(tree, sel.nodeId ?? (system ? null : sel.systemId)) : null;
  if (off) {
    const kind = off.offSystem ? 'System' : off.node.kind === 'component' ? 'Component' : 'Group';
    const where = off.offSystem ? '' : `${off.parent && off.parent.id !== off.system.id ? pathOf(tree, off.parent.id) + ' › ' + off.parent.label : off.system.label} · `;
    return (
      <Shell kind={kind} title={off.node.label} sub={`${where}${OFF_SUB}`} onClose={off.offSystem ? undefined : () => onSelect({ systemId: off.system.id, nodeId: null })}
        action={<IncludedSwitch on={false} label={off.node.label} disabled={disabled} onChange={v => { if (v) onOps(includeOps(tree, off.node.id, true)); }} />}>
        <OffContents node={off.node} />
      </Shell>
    );
  }
  if (!system) return <p className="px-4 py-6 text-sm text-muted">{tree.systems.length ? 'Pick a system or component in the tree.' : 'Add a system to start.'}</p>;
  const open = (id: string) => onSelect({ systemId: system.id, nodeId: id });

  if (!loc || loc.depth === 0) {
    return (
      <Shell kind="System" title={system.label}
        sub={isCovered(tree, system) ? ON_SUB : OFF_SUB}
        action={<IncludedSwitch on={isCovered(tree, system)} label={system.label} disabled={disabled} onChange={v => onOps(includeOps(tree, system.id, v))} />}>
        <ItemsPanel tree={tree} system={system} sel={sel} onSelect={onSelect} onOps={onOps} onOpen={open} disabled={disabled} typeView={typeView} />
      </Shell>
    );
  }
  const node = loc.node;
  const path = pathOf(tree, node.id);
  const close = () => onSelect({ systemId: system.id, nodeId: null });
  if (node.kind !== 'component') {
    return (
      <Shell kind="Group" title={node.label} sub={`${path} · ${ON_SUB}`} onClose={close}
        action={<IncludedSwitch on label={node.label} disabled={disabled} onChange={v => { if (!v) onOps(includeOps(tree, node.id, false)); }} />}>
        <GroupDetails node={node} onOps={onOps} onOpen={open} disabled={disabled} />
      </Shell>
    );
  }
  if (node.pointsTo) {
    const lt: ComponentTab = tab === 'applicability' ? 'applicability' : 'overview';
    return (
      <Shell kind="Link" title={node.label} sub={path} onClose={close}
        tabs={(['overview', 'applicability'] as const).map(t => (
          <button key={t} role="tab" aria-selected={lt === t} onClick={() => setTab(t)}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${lt === t ? 'border-accent text-ink' : 'border-transparent text-body hover:text-ink'}`}>{TAB_LABEL[t]}</button>
        ))}>
        {lt === 'overview' && <LinkOverview tree={tree} node={node} onOpen={(s, n) => onSelect({ systemId: s, nodeId: n })} onOps={onOps} disabled={disabled} />}
        {lt === 'applicability' && <Applicability tree={tree} system={system} node={node} onOps={onOps} disabled={disabled} onOpenBuildingTypes={onOpenBuildingTypes} />}
      </Shell>
    );
  }
  const reqs = requirementsOf(node).length;
  const unseen = notShownToInspectors(system, node, loc.parent?.id ?? system.id);
  const o = opened[node.id] ?? {};
  const detailsOn = !!(node.attributes?.length || node.method?.length) || !!o.details;
  const reqsOn = reqs > 0 || !!o.reqs;
  const mark = (k: 'details' | 'reqs', v: boolean) => setOpened(cur => ({ ...cur, [node.id]: { ...cur[node.id], [k]: v } }));
  const onDetails = (on: boolean) => { const x = ops.switchDetails(node, on); if (x.length && !onOps(x)) return; mark('details', on); if (on) setTab('details'); };
  const onReqs = (on: boolean) => { const x = ops.switchRequirements(node, on); if (x.length && !onOps(x)) return; mark('reqs', on); if (on) setTab('requirements'); };
  const visible: ComponentTab[] = ['overview', ...(assessesCondition(node) ? ['condition' as const] : []), ...(detailsOn ? ['details' as const] : []), ...(reqsOn ? ['requirements' as const] : []), 'applicability'];
  const cur: ComponentTab = visible.includes(tab) ? tab : 'overview';
  return (
    <Shell kind="Component" title={node.label} sub={`${path} · ${ON_SUB}`} onClose={close}
      action={<IncludedSwitch on label={node.label} disabled={disabled} onChange={v => { if (!v) onOps(includeOps(tree, node.id, false)); }} />} badge={unseen ? <UnseenPill /> : recordsNothingHere(node) ? <Pill tone="warn">Hidden — nothing to record</Pill> : null}
      tabs={visible.map(t => (
        <button key={t} role="tab" aria-selected={cur === t} onClick={() => setTab(t)}
          className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${cur === t ? 'border-accent text-ink' : 'border-transparent text-body hover:text-ink'}`}>
          {TAB_LABEL[t]}{t === 'requirements' && reqs > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{reqs}</span>}
        </button>
      ))}>
      {cur === 'overview' && <ComponentOverview tree={tree} systemId={system.id} node={node} reqCount={reqs} detailsOn={detailsOn} reqsOn={reqsOn} onDetails={onDetails} onReqs={onReqs} onOps={onOps} disabled={disabled} />}
      {cur === 'condition' && <ComponentCondition node={node} onOps={onOps} disabled={disabled} />}
      {cur === 'details' && <ComponentFields node={node} onOps={onOps} disabled={disabled} />}
      {cur === 'requirements' && <RequirementsEditor tree={tree} node={node} onOps={onOps} disabled={disabled} />}
      {cur === 'applicability' && <Applicability tree={tree} system={system} node={node} onOps={onOps} disabled={disabled} onOpenBuildingTypes={onOpenBuildingTypes} />}
    </Shell>
  );
}

function pathOf(tree: InspectionTemplate, id: string): string {
  const parts: string[] = []; let cur = locate(tree, id);
  while (cur && cur.parent) { parts.unshift(cur.parent.label); cur = locate(tree, cur.parent.id); }
  return parts.join(' › ');
}

const ON_SUB = 'Included in new inspections';
const OFF_SUB = 'Not included — inspectors can still add it during an inspection';

/** What a switched-off system or group holds — read-only until it is switched back on. */
function OffContents({ node }: { node: TemplateNode }) {
  const kids = node.children ?? [];
  return (
    <div className="space-y-3 px-4 py-4">
      <p className="rounded-lg bg-ground px-3 py-2 text-xs text-body">Off: new inspections leave it out, and inspectors can add it on site. Switch it on to edit it.</p>
      {node.kind === 'component'
        ? <p className="text-sm text-body">{itemSummary(node)}</p>
        : <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            {kids.map(c => <li key={c.id} className="px-3 py-2"><span className="block truncate text-sm font-medium text-muted">{c.label}</span>
              {c.kind === 'component' && <span className="block truncate text-xs text-muted">{itemSummary(c)}</span>}</li>)}
            {!kids.length && <li className="px-3 py-3 text-xs text-muted">Nothing inside.</li>}
          </ul>}
    </div>
  );
}

/** Whether new inspections include a system, group or item — ONE switch on the title line (owner 2026-10-27 for systems;
 *  2026-11-05 for groups and items). Off still lets inspectors add it during an inspection (editorModel.includeOps). */
function IncludedSwitch({ on, label: name, disabled, onChange }: { on: boolean; label: string; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 pt-1">
      <span className={`text-xs font-semibold ${on ? 'text-ink' : 'text-muted'}`}>{on ? 'Included' : 'Not included'}</span>
      <Toggle on={on} disabled={disabled} label={`${name} included in new inspections`} onChange={onChange} />
    </div>
  );
}

function Shell({ kind, title, sub, onClose, badge, tabs, action, children }: {
  kind: string; title: string; sub: string; onClose?: () => void; badge?: React.ReactNode; tabs?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 px-4 pt-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline text-muted">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{kind === 'Component' ? <rect x="5" y="5" width="14" height="14" rx="3" /> : <path d="M3 10.5L12 4l9 6.5V20H3z" />}</svg>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold tracking-tight text-ink">{title}</h2>
          <p className="truncate text-xs text-muted">{kind}{sub ? ` · ${sub}` : ''}</p>
          {badge && <div className="mt-1">{badge}</div>}
        </div>
        {action}
        {onClose && <button aria-label="Close item" className={btn.icon} onClick={onClose} title="Back to the system">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
      </header>
      {tabs && <div role="tablist" aria-label="Component" className="mt-2 flex overflow-x-auto border-b border-hairline px-2">{tabs}</div>}
      {!tabs && <div className="mt-3 border-b border-hairline" />}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// ── Applicability ───────────────────────────────────────────────────────────────────────────────────────────

function Applicability({ tree, system, node, onOps, disabled, onOpenBuildingTypes }: {
  tree: InspectionTemplate; system: TemplateNode; node: TemplateNode; onOps: OnOps; disabled: boolean; onOpenBuildingTypes: () => void;
}) {
  const x = node as TemplateNode & { appliesWhen?: unknown; whenUnknown?: 'show' | 'hide'; appliesToTypes?: string[] };
  const types = useMemo(() => structureTypesOf(tree), [tree]);
  const withSystem = types.types.filter(t => t.systems.includes(system.id));
  const [wu, setWu] = useState<'show' | 'hide'>(x.whenUnknown ?? 'show');
  useEffect(() => { setWu(x.whenUnknown ?? 'show'); }, [x.whenUnknown]);
  return (
    <div className="space-y-6 px-4 py-4">
      <section>
        <p className={label}>Building types</p>
        <div className="rounded-xl border border-hairline px-3 py-3 text-sm text-body">
          <p>This item is part of <span className="font-semibold text-ink">{system.label}</span>. {isCovered(tree, system) ? 'The main building covers it when an inspection starts.' : 'The main building doesn’t cover it by default.'}</p>
          <p className="mt-1">{withSystem.length
            ? <>Other buildings that start with {system.label}: {withSystem.map(t => t.name).join(', ')}.</>
            : <>No other building type starts with {system.label}.</>}
            {types.source === 'ledrix-default' && ' (Ledrix’s default building types.)'}</p>
          <button className={`${btn.ghost} mt-2 px-0`} onClick={onOpenBuildingTypes}>Edit building types →</button>
        </div>
      </section>

      <section>
        <p className={label}>When this item is inspected</p>
        <RuleEditor tree={tree} forNodeId={node.id} rule={x.appliesWhen} idPrefix={`aw-${node.id}`} disabled={disabled}
          emptyText="Always, whenever its system is in the inspection."
          onSave={r => onOps(ops.applicability(node, r, r === null ? null : wu === 'hide' ? 'hide' : null))} />
        {x.appliesWhen !== undefined && (
          <fieldset className="mt-3">
            <legend className="text-xs font-semibold text-ink">Before that answer is recorded</legend>
            <div className="mt-1 space-y-1 text-sm text-body">
              {(['show', 'hide'] as const).map(v => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name={`wu-${node.id}`} checked={wu === v} disabled={disabled}
                    onChange={() => { if (onOps(ops.whenUnknown(node.id, v === 'hide'))) setWu(v); }} />
                  {v === 'show' ? 'Show the item — the inspector decides' : 'Hide the item until the answer says it applies'}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="mt-3 text-[11px] text-muted">Rules test answers recorded elsewhere in this inspection. Being hard to reach isn’t a rule: the inspector records a limitation, so the item is still reported.</p>
      </section>

      {!!x.appliesToTypes?.length && (
        <section>
          <p className={label}>Equipment types (Ledrix)</p>
          <p className="text-sm text-body">Inspected for: {x.appliesToTypes.join(', ')}. Set by Ledrix; not editable here.</p>
        </section>
      )}
    </div>
  );
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────────────────────