'use client';

// The template editor's hand-editing parts: a system's details and items, a component's Details and Fields tabs,
// and the "add a system, group or item" form the tree uses.
// Every change is a list of template operations (lib/templates/editorModel `ops`), applied through `onOps`, so a
// direct edit takes the same validated, undoable path as an accepted Ledrix proposal. Text commits on blur or
// Enter — one change per edit, not one per keystroke.
import { useEffect, useState } from 'react';
import type { InspectionTemplate, TemplateNode, ComponentAttribute } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp, FindingShortcut } from '@/lib/templateBuilder/core/templateOps';
import { assessesCondition, flatItems, includeOps, itemSummary, linksOf, locate, ops } from '@/lib/templates/editorModel';
import { displayLabel } from './systemLabel';
import { ChipList, Menu, Pill, Toggle, btn, field, label } from './ui';
import { LedrixSuggestions } from './CatalogPanel';
import { catalogTypesForSystem } from '@/lib/templates/catalogModel';
import { FULL_LIST, SECTION_ID, TypeBuilder, TypeChips } from './TypeBuilder';
import type { TypeLayout } from '@/lib/templates/typeLayout';
import { SpecialHomesPanel } from './SpecialHomesPanel';
import { GroupList } from './GroupList';
import { GroupItems } from './MaterialsBuilder';

type Sel = { systemId: string | null; nodeId: string | null };
type OnOps = (o: TemplateOp[]) => boolean;

/** A text input that commits on blur / Enter, and follows outside changes when not being edited. */
export function CommitInput({ value, onCommit, multiline, ariaLabel, placeholder, className = '', disabled, id }: {
  value: string; onCommit: (v: string) => void; multiline?: boolean; ariaLabel: string; placeholder?: string; className?: string; disabled?: boolean; id?: string;
}) {
  const [v, setV] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setV(value); }, [value, focused]);
  const commit = () => { setFocused(false); if (v !== value) onCommit(v); };
  const common = { id, value: v, disabled, 'aria-label': ariaLabel, placeholder, onFocus: () => setFocused(true), onBlur: commit,
    onChange: (e: { target: { value: string } }) => setV(e.target.value) };
  return multiline
    ? <textarea {...common} rows={3} className={`${field} resize-y ${className}`} />
    : <input {...common} className={`${field} ${className}`} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur(); } }} />;
}

export const Arrow = ({ dir }: { dir: 'up' | 'down' }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{dir === 'up' ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}</svg>
);

// ── where an item can live ───────────────────────────────────────────────────────────────────────────────────
// WHERE AN ITEM CAN LIVE (2026-10-25). The app gives a system with groups one card per GROUP (ledrix-app ScopeScreen
// `tileNodesOf`, mirrored by the preview's tilesOf): an item placed directly under such a system has no card, so no
// inspector ever sees it. So on a system with groups an ITEM is added inside a group (the first, by default); a
// GROUP can still be added at the top. A system without groups keeps "in <system>".

/** The places a new item of `kind` may be added in `system`. */
export function homesFor(system: TemplateNode, kind: 'component' | 'subsystem'): TemplateNode[] {
  const rows = flatItems(system);
  const groups = [system, ...rows.map(r => r.node).filter(n => n.kind !== 'component' && !n.pointsTo)];
  const hasGroups = (system.children ?? []).some(c => c.kind === 'subsystem');
  const homes = kind === 'component' && hasGroups ? groups.filter(g => g.id !== system.id) : groups;
  return homes;
}

/** An item directly under a system that has groups: the app gives it no card, so inspectors never see it. */
export function notShownToInspectors(system: TemplateNode, node: TemplateNode, parentId: string): boolean {
  const group = node.kind !== 'component';
  const hasGroups = (system.children ?? []).some(c => c.kind === 'subsystem');
  const unseen = !group && parentId === system.id && hasGroups;
  return unseen;
}

export const UnseenPill = () => (
  <span title="This system has groups, and inspectors only see items inside a group. Switch this item off and add it inside a group."><Pill tone="warn">Not shown to inspectors</Pill></span>
);

/** Add a system, or a group or item inside a system — the one structured way to add to the template. */
export function AddToTemplate({ tree, systemId, onOps, disabled, onAdded }: {
  tree: InspectionTemplate; systemId: string | null; onOps: OnOps; disabled: boolean; onAdded?: (sel: Sel) => void;
}) {
  const [what, setWhat] = useState<'system' | 'component' | 'subsystem'>(systemId ? 'component' : 'system');
  const [sys, setSys] = useState<string>(systemId ?? tree.systems[0]?.id ?? '');
  const [name, setName] = useState('');
  useEffect(() => { if (systemId) setSys(systemId); }, [systemId]);
  const system = tree.systems.find(s => s.id === sys) ?? null;
  const homes = what !== 'system' && system ? homesFor(system, what) : [];
  const [parent, setParent] = useState('');
  useEffect(() => { if (!homes.some(g => g.id === parent)) setParent(homes[0]?.id ?? ''); }, [sys, what, homes.map(g => g.id).join('|')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => {
    const v = name.trim(); if (!v) return;
    if (what === 'system') {
      const o = ops.addSystem(tree, v);
      if (onOps(o)) { setName(''); onAdded?.({ systemId: (o[o.length - 1] as { node: { id: string } }).node.id, nodeId: null }); }
      return;
    }
    if (!system || !parent) return;
    const o = ops.addItem(tree, system.id, parent, v, what);
    if (onOps(o)) { setName(''); const id = (o[0] as { node: { id: string } }).node.id; onAdded?.({ systemId: system.id, nodeId: id }); }
  };
  return (
    <form aria-label="Add to the template" className="space-y-1.5" onSubmit={e => { e.preventDefault(); submit(); }}>
      <div className="flex gap-1.5">
        <select aria-label="What to add" value={what} onChange={e => setWhat(e.target.value as typeof what)} disabled={disabled} className={`${field} w-auto py-1.5`}>
          <option value="system">System</option><option value="component" disabled={!tree.systems.length}>Item</option><option value="subsystem" disabled={!tree.systems.length}>Group</option>
        </select>
        <input value={name} onChange={e => setName(e.target.value)} disabled={disabled} aria-label="Name of what to add"
          placeholder={what === 'system' ? 'System name' : what === 'component' ? 'Item name' : 'Group name'} className={`${field} min-w-0 py-1.5`} />
      </div>
      {what !== 'system' && (
        <div className="flex gap-1.5">
          <select aria-label="In system" value={sys} onChange={e => setSys(e.target.value)} disabled={disabled} className={`${field} min-w-0 py-1.5`}>
            {tree.systems.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select aria-label="Inside" value={parent} onChange={e => setParent(e.target.value)} disabled={disabled} className={`${field} min-w-0 py-1.5`}>
            {homes.map(g => <option key={g.id} value={g.id}>{`in ${g.label}`}</option>)}
          </select>
        </div>
      )}
      <button className={`${btn.secondary} w-full py-1.5`} disabled={disabled || !name.trim() || (what !== 'system' && !parent)}>Add {what === 'system' ? 'system' : what === 'component' ? 'item' : 'group'}</button>
    </form>
  );
}

// ── a system: details and its items ─────────────────────────────────────────────────────────────────────────

/** A typed system's layout and the type the builder is looking at (owner 2026-11-05, "build a system one type at a
 *  time"). Absent for a system whose items don't change with one type answer — it keeps the plain list. */
export type TypeView = { layout: TypeLayout; pick: string; onPick: (v: string) => void };

export function ItemsPanel({ tree, system, sel, onSelect, onOps, onOpen, disabled, typeView }: {
  tree: InspectionTemplate; system: TemplateNode; sel: Sel; onSelect: (s: Sel) => void; onOps: OnOps; onOpen: (id: string) => void; disabled: boolean;
  typeView?: TypeView | null;
}) {
  const rows = flatItems(system);
  const hasGroups = (system.children ?? []).some(c => c.kind === 'subsystem');
  const [kind, setKind] = useState<'component' | 'subsystem'>('component');
  const homes = homesFor(system, kind);
  const [parent, setParent] = useState(homes[0]?.id ?? system.id);
  const [name, setName] = useState('');
  useEffect(() => { if (!homes.some(g => g.id === parent)) setParent(homes[0]?.id ?? system.id); }, [system.id, kind, homes.map(g => g.id).join('|')]);   // eslint-disable-line react-hooks/exhaustive-deps
  // A system the type chips don't lay out is GROUP FIRST (owner 2026-11-06, mockup CjKszYz3e9KT39kvF43mkD, "Approved"):
  // its groups, each opening its own screen; no "Materials first / Full list" switch. The stored list below stays only
  // for a typed system's "Full list" chip.
  const byGroups = !typeView;
  const laidOut = (typeView && typeView.pick !== FULL_LIST) || byGroups;
  const offRows = (system.trimmed ?? []).map(t => ({ t, under: system.label })).concat(rows.flatMap(r => (r.node.trimmed ?? []).map(t => ({ t, under: r.node.label }))));

  return (
    <div className="space-y-5 px-4 py-4">


      {typeView && <TypeChips layout={typeView.layout} pick={typeView.pick} onPick={typeView.onPick} systemLabel={system.label} />}
      {typeView && typeView.pick !== FULL_LIST && (
        <TypeBuilder tree={tree} system={system} layout={typeView.layout} pick={typeView.pick} onOps={onOps} selected={sel.nodeId} disabled={disabled}
          onOpen={id => { onSelect({ systemId: system.id, nodeId: id }); onOpen(id); }} />
      )}
      {byGroups && <GroupList tree={tree} system={system} onOps={onOps} selected={sel.nodeId} disabled={disabled}
        onOpenGroup={id => onSelect({ systemId: system.id, nodeId: id })} onOpen={id => { onSelect({ systemId: system.id, nodeId: id }); onOpen(id); }} />}
      {laidOut && offRows.length > 0 && (
        <ul id={SECTION_ID.off} aria-label="Switched off" className="scroll-mt-2 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
          {offRows.map(({ t, under }) => (
            <li key={t.id} className="flex items-center gap-1 pr-1"><button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left" onClick={() => onSelect({ systemId: system.id, nodeId: t.id })}>
              <span className="min-w-0 flex-1"><span className={`block truncate text-muted ${t.kind !== 'component' ? 'text-xs font-semibold uppercase tracking-wide' : 'text-sm font-medium'}`}>{t.label}</span>
                <span className="block truncate text-xs text-muted">Not included · in {under}</span></span>
              <span className="text-[10px] font-semibold uppercase text-muted">off</span></button>
              <Menu label={`More for ${t.label}`} items={[{ label: 'Switch on', disabled: disabled && 'The draft can’t change right now.', onSelect: () => { onOps(includeOps(tree, t.id, true)); } }]} /></li>
          ))}
        </ul>
      )}

      <div className={laidOut ? 'hidden' : ''}>
        <div className="mb-2 flex items-center justify-between">
          <p className={label + ' mb-0'}>Items</p><span className="rounded-full bg-ground px-2 py-0.5 font-mono text-xs text-body">{rows.filter(r => r.node.kind === 'component').length}</span>
        </div>
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
          {rows.map(({ node, depth, parentId }) => {
            const on = sel.nodeId === node.id;
            const siblings = (locate(tree, parentId)?.node ?? system).children ?? [];
            const idx = siblings.findIndex(c => c.id === node.id);
            const group = node.kind !== 'component';
            const unseen = !group && parentId === system.id && hasGroups;   // no card in the app — see homesFor above
            return (
              <li key={node.id} className={`group flex items-center gap-2 py-2 pr-2 ${on ? 'bg-accent/10' : group ? 'bg-ground' : ''}`} style={{ paddingLeft: 12 + depth * 18 }}>
                <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button aria-label={`Move ${node.label} up`} disabled={disabled || idx <= 0} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(node.id, parentId, idx - 1))}><Arrow dir="up" /></button>
                  <button aria-label={`Move ${node.label} down`} disabled={disabled || idx >= siblings.length - 1} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(node.id, parentId, idx + 1))}><Arrow dir="down" /></button>
                </div>
                <button className="min-w-0 flex-1 text-left" onClick={() => { onSelect({ systemId: system.id, nodeId: node.id }); if (!group) onOpen(node.id); }}>
                  <p className={`truncate text-sm ${group ? 'font-semibold uppercase tracking-wide text-muted text-xs' : 'font-medium text-ink'}`}>{node.label}</p>
                  {!group && <p className="truncate text-xs text-muted">{itemSummary(node)}</p>}
                  {unseen && <UnseenPill />}
                </button>
                {!group && <button aria-label={`Edit ${node.label}`} className={btn.icon} onClick={() => { onSelect({ systemId: system.id, nodeId: node.id }); onOpen(node.id); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg></button>}
                {group && <Menu label={`More for ${node.label}`} items={[
                  { label: 'Rename', disabled: disabled && 'The draft can’t change right now.', onSelect: () => { const v = window.prompt('Group name', node.label); if (v) onOps(ops.rename(node.id, v)); } },
                ]} />}
              </li>
            );
          })}
          {/* OFF (owner 2026-11-05): switched-off groups and items stay in the list, greyed — open one to switch it on. */}
          {offRows.map(({ t, under }) => (
            <li key={t.id} className={`flex items-center gap-2 py-2 pl-3 pr-2 ${sel.nodeId === t.id ? 'bg-accent/10' : ''}`}>
              <button className="min-w-0 flex-1 text-left" onClick={() => onSelect({ systemId: system.id, nodeId: t.id })}>
                <p className={`truncate text-muted ${t.kind !== 'component' ? 'text-xs font-semibold uppercase tracking-wide' : 'text-sm font-medium'}`}>{t.label}</p>
                <p className="truncate text-xs text-muted">Not included · in {under}</p>
              </button>
              <span className="text-[10px] font-semibold uppercase text-muted">off</span>
            </li>
          ))}
          {!rows.length && !offRows.length && <li className="px-4 py-4 text-xs text-muted">No items yet.</li>}
        </ul>
        <form className="mt-2 flex flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); if (name.trim() && onOps(ops.addItem(tree, system.id, parent, name, kind))) setName(''); }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'component' ? 'Add item, e.g. Kick-out flashing' : 'Add group'} aria-label="New item name" disabled={disabled} className={`${field} min-w-[10rem] flex-1 py-1.5`} />
          <select aria-label="Add under" value={parent} onChange={e => setParent(e.target.value)} disabled={disabled} className={`${field} w-auto py-1.5`}>
            {homes.map(g => <option key={g.id} value={g.id}>{g.id === system.id ? `in ${system.label}` : `in ${g.label}`}</option>)}
          </select>
          <select aria-label="Kind" value={kind} onChange={e => setKind(e.target.value as 'component' | 'subsystem')} disabled={disabled} className={`${field} w-auto py-1.5`}>
            <option value="component">Item</option><option value="subsystem">Group</option>
          </select>
          <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !name.trim()}>Add</button>
        </form>
      </div>

      {/* A system the type chips don't lay out gets Ledrix's suggestions at the end of its list (owner 2026-11-05). */}
      {!typeView && catalogTypesForSystem(system).length > 0 && <LedrixSuggestions tree={tree} system={system} types={catalogTypesForSystem(system)} onOps={onOps} disabled={disabled} when />}
      <SpecialHomesPanel tree={tree} system={system} onOps={onOps} disabled={disabled} />

    </div>
  );
}

// ── a group: its items (name and Tips live in the panel title) ──────────────────────────────────────────────────────────────────

export function GroupDetails({ tree, system, node, onOps, onOpen, selected, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; node: TemplateNode; onOps: OnOps; onOpen: (id: string) => void; selected: string | null; disabled: boolean;
}) {
  // A GROUP'S OWN SCREEN (owner 2026-11-06, mockup CjKszYz3e9KT39kvF43mkD): its items, one kind of row for all, and
  // "+ Add item". A materials question's answers open inside that question's item ("This should not show the list of
  // options till we tap into siding"). Its name, Tips, ⋯ and switch are the panel title's.
  return (
    <div className="px-4 py-4">
      <GroupItems tree={tree} system={system} groupId={node.id} onOps={onOps} onOpen={onOpen} selected={selected} disabled={disabled} />
    </div>
  );
}

// ── a component: Details tab ────────────────────────────────────────────────────────────────────────────────

export function ComponentOverview({ tree, systemId, node, reqCount, detailsOn, reqsOn, onDetails, onReqs, onOps, disabled, conditionBody, detailsBody }: {
  tree: InspectionTemplate; systemId: string; node: TemplateNode; reqCount: number; detailsOn: boolean; reqsOn: boolean;
  onDetails: (on: boolean) => void; onReqs: (on: boolean) => void; onOps: OnOps; disabled: boolean;
  /** ONE ITEM SCREEN (owner 2026-11-06, mockup CjKszYz3e9KT39kvF43mkD): Condition's and Details' settings open right under
   *  their switch, instead of on tabs of their own. */
  conditionBody?: React.ReactNode; detailsBody?: React.ReactNode;
}) {
  const nothing = !assessesCondition(node) && !detailsOn && !reqsOn;
  const Row = ({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 border-b border-hairline px-3 py-3 last:border-b-0">
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{title}</p><p className="text-xs text-muted">{hint}</p></div>
      {children}
    </div>
  );
  return (
    <div className="space-y-5 px-4 py-4">
      {node.pointsTo && <p className="rounded-lg bg-ground px-3 py-2 text-xs text-body">Recorded in another section. Edit it there.</p>}
      <div>
        <p className={label}>Inspectors record</p>
        <div className="overflow-hidden rounded-xl border border-hairline">
          <Row title="Condition" hint="Satisfactory · Limitation · Finding">
            <Toggle on={assessesCondition(node)} disabled={disabled} label="Condition" onChange={v => onOps(ops.assessed(node.id, v))} />
          </Row>
          {assessesCondition(node) && conditionBody && <div aria-label="Condition settings" className="border-b border-hairline bg-ground/40">{conditionBody}</div>}
          <Row title="Details" hint="Material, type or count">
            <Toggle on={detailsOn} disabled={disabled} label="Details" onChange={onDetails} />
          </Row>
          {detailsOn && detailsBody && <div aria-label="Details settings" className="border-b border-hairline bg-ground/40">{detailsBody}</div>}
          <Row title="Requirements" hint={reqCount ? `Proof photos and readings · ${reqCount}` : 'Proof photos and readings'}>
            <Toggle on={reqsOn} disabled={disabled} label="Requirements" onChange={onReqs} />
          </Row>
        </div>
        {nothing && <p className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-ink">Nothing to record — inspectors won’t see this item.</p>}
      </div>
      {!node.pointsTo && <AlsoShowIn tree={tree} systemId={systemId} node={node} onOps={onOps} disabled={disabled} />}
    </div>
  );
}

function AlsoShowIn({ tree, systemId, node, onOps, disabled }: { tree: InspectionTemplate; systemId: string; node: TemplateNode; onOps: OnOps; disabled: boolean }) {
  const links = linksOf(tree, node.id);
  return (
    <div>
      <p className={label}>Also show in</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Also show in">
        {tree.systems.filter(s => s.id !== systemId).map(s => {
          const link = links.find(l => l.systemId === s.id);
          return (
            <button key={s.id} type="button" aria-pressed={!!link} disabled={disabled}
              onClick={() => onOps(link ? ops.unlink(link.pointerId) : ops.showIn(tree, node, s.id))}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${link ? 'border-accent bg-accent/10 text-accent-ink' : 'border-hairline text-body hover:text-ink'}`}>
              {link ? '✓ ' : ''}{displayLabel(s.label)}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted">Recorded once, reported here.</p>
    </div>
  );
}

/** A LINK's panel: it shows an item that lives in another system. */
export function LinkOverview({ tree, node, onOpen, onOps, disabled }: { tree: InspectionTemplate; node: TemplateNode; onOpen: (systemId: string, nodeId: string) => void; onOps: OnOps; disabled: boolean }) {
  const home = node.pointsTo ? locate(tree, node.pointsTo.nodeId) : null;
  return (
    <div className="space-y-4 px-4 py-4">
      <p className="text-sm text-body">Shown from <span className="font-semibold text-ink">{home ? `${displayLabel(home.system.label)} › ${home.node.label}` : 'a missing item'}</span>. Recorded and reported there.</p>
      <div className="flex gap-2">
        {home && <button className={btn.secondary} onClick={() => onOpen(home.system.id, home.node.id)}>Open {home.node.label}</button>}
        <button className={btn.secondary} disabled={disabled} onClick={() => onOps(ops.unlink(node.id))}>Remove from here</button>
      </div>
    </div>
  );
}

// ── a component: Condition tab ──────────────────────────────────────────────────────────────────────────────

export function ComponentCondition({ node, onOps, disabled }: { node: TemplateNode; onOps: OnOps; disabled: boolean }) {
  const shortcuts = ((node as TemplateNode & { findingShortcuts?: FindingShortcut[] }).findingShortcuts ?? []).map(s => s.label);
  return (
    <div className="space-y-5 px-4 py-4">
      <div>
        <p className={label}>Quick findings <span className="ml-1 normal-case tracking-normal"><Pill>Phone support next</Pill></span></p>
        <ChipList values={shortcuts} disabled={disabled} addLabel="Add quick finding" placeholder="e.g. Disconnected joint"
          onChange={v => onOps(ops.findingShortcuts(node, v, Date.now()))} />
      </div>
      <div>
        <p className={label}>Limitation reasons</p>
        <ChipList values={node.limitations ?? []} disabled={disabled} addLabel="Add limitation reason" placeholder="e.g. Concealed by insulation"
          onChange={v => onOps(ops.limitations(node.id, v))} />
        <p className="mt-1 text-[11px] text-muted">Shown first when an inspector taps Limitation.</p>
      </div>
    </div>
  );
}

// ── a component: Details tab ─────────────────────────────────────────────────────────────────────────────────

export function ComponentFields({ node, onOps, disabled }: { node: TemplateNode; onOps: OnOps; disabled: boolean }) {
  const [newField, setNewField] = useState('');
  return (
    <div className="space-y-5 px-4 py-4">
      <div>
        <p className={label}>Details</p>
        <div className="space-y-3">
          {(node.attributes ?? []).map(a => <AttrEditor key={a.id} node={node} a={a} onOps={onOps} disabled={disabled} />)}
          {!node.attributes?.length && <p className="text-xs text-muted">No details yet — what it is (material, type, count), never a grade.</p>}
        </div>
        <form className="mt-2 flex gap-1.5" onSubmit={e => { e.preventDefault(); if (newField.trim() && onOps(ops.addField(node, newField, [], false))) setNewField(''); }}>
          <input value={newField} onChange={e => setNewField(e.target.value)} placeholder="Add a detail, e.g. Material" aria-label="New detail" disabled={disabled} className={`${field} py-1.5`} />
          <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !newField.trim()}>Add</button>
        </form>
      </div>
      {!!node.method?.length && (
        <div>
          <p className={label}>Method of inspection</p>
          <div className="flex flex-wrap gap-1.5">{node.method.map(m => <Pill key={m}>{m}</Pill>)}</div>
          <p className="mt-1 text-[11px] text-muted">The ways inspectors can say how this was inspected. They print as disclosures in the report. Set by Ledrix; not editable here.</p>
        </div>
      )}
    </div>
  );
}

function AttrEditor({ node, a, onOps, disabled }: { node: TemplateNode; a: ComponentAttribute; onOps: OnOps; disabled: boolean }) {
  const typed = (a as ComponentAttribute & { allowTyped?: boolean }).allowTyped === true;
  return (
    <div className="rounded-xl border border-hairline px-3 py-3">
      <div className="flex items-center gap-2">
        <CommitInput value={a.label} ariaLabel="Spec field name" disabled={disabled} onCommit={v => onOps(ops.fieldLabel(node.id, a, v))} className="py-1.5 font-semibold" />
        <div role="radiogroup" aria-label={`${a.label}: answers`} className="inline-flex shrink-0 rounded-lg border border-hairline bg-ground p-0.5">
          {([false, true] as const).map(m => (
            <button key={String(m)} role="radio" aria-checked={!!a.multi === m} disabled={disabled} onClick={() => !!a.multi !== m && onOps(ops.fieldMulti(node.id, a, m))}
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${!!a.multi === m ? 'bg-surface text-ink shadow-sm' : 'text-body'}`}>{m ? 'Multiple' : 'Single'}</button>
          ))}
        </div>
        <Menu label={`More for ${a.label}`} items={[{ label: 'Remove spec field', danger: true, disabled: disabled && 'The draft can’t change right now.', onSelect: () => onOps(ops.removeField(node.id, a)) }]} />
      </div>
      <div className="mt-2">
        <ChipList values={a.values} disabled={disabled} addLabel={`Add choice to ${a.label}`} placeholder="Add a choice" onChange={v => onOps(ops.fieldValues(node.id, a, v))} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{a.multi ? 'Inspectors pick any that apply.' : 'Inspectors pick one.'} {typed && <Pill>Other (typed) offered</Pill>}</p>
    </div>
  );
}
