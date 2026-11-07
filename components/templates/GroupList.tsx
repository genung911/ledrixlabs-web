'use client';

// A system without type chips, GROUP FIRST (owner 2026-11-06, mockup https://claude.ai/artifact/CjKszYz3e9KT39kvF43mkD,
// "Approved"): no "Materials first / Full list" switch — the system lists its groups (Supply, Drain · Waste · Vent,
// Fixtures, Fuel · Gas), each opening its own screen with everything set in it (MaterialsBuilder, one group). Items
// placed straight under the system list as items. Each group's ⋯: Rename (in the row), Move up / down, Move to…,
// Switch off — every change one op set through `onOps` (editorModel / MoveTo), never written here.
import { useMemo, useRef, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { includeOps, ops } from '@/lib/templates/editorModel';
import { materialLayoutOf } from '@/lib/templates/materialLayout';
import { ItemRow } from './ItemRow';
import { MoveToDialog, moveBlockFor } from './MoveTo';
import { rulesFor } from './phonePreviewModel';
import { Menu, btn, field } from './ui';
import { useBuildingLens } from './BuildingLens';

const LOCKED = 'The draft can’t change right now.';

export function GroupList({ tree, system, onOpenGroup, onOpen, onOps, selected, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; onOpenGroup: (id: string) => void; onOpen: (id: string) => void;
  onOps: (o: TemplateOp[]) => boolean; selected: string | null; disabled: boolean;
}) {
  const lens = useBuildingLens();
  // With a building selected, only what's in it is listed; the rest is in its Off list (ItemsPanel).
  const kids = (system.children ?? []).filter(c => !lens || lens.isIn(c.id));
  const layout = useMemo(() => materialLayoutOf(tree, system, rulesFor(tree)), [tree, system]);
  const [name, setName] = useState('');
  const groups = kids.filter(c => c.kind !== 'component');
  const items = kids.filter(c => c.kind === 'component');
  /** One line under a group's name: its materials question and how many it offers, else its first items. */
  const summary = (g: TemplateNode): string => {
    const lg = layout.find(x => x.node.id === g.id);
    const q = lg?.questions[0];
    const n = (g.children ?? []).length;
    if (q) { const others = n - q.rows.filter(r => r.card).length - 1 - (q.typed ? 1 : 0); return `${q.attr.label || q.node.label} · ${q.rows.length} material${q.rows.length === 1 ? '' : 's'}${others > 0 ? ` · ${others} other item${others === 1 ? '' : 's'}` : ''}`; }
    const labels = (g.children ?? []).map(c => c.label);
    return labels.length ? labels.slice(0, 4).join(', ') + (labels.length > 4 ? '…' : '') : 'No items yet';
  };
  return (
    <div className="space-y-3">
      {lens && !lens.isIn(system.id) && <p className="rounded-xl border border-dashed border-hairline px-4 py-5 text-center text-sm text-muted">{system.label} isn’t in this building. Switch it on at the top to add it.</p>}
      {groups.length > 0 && (
        <ul aria-label={`${system.label} groups`} className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
          {groups.map(g => <GroupRow key={g.id} tree={tree} system={system} g={g} sub={summary(g)} onOpen={() => onOpenGroup(g.id)} onOps={onOps} selected={selected === g.id} disabled={disabled} />)}
        </ul>
      )}
      {items.length > 0 && (
        <ul aria-label={`${system.label} items`} className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
          {items.map(n => <ItemRow key={n.id} tree={tree} node={n} onOps={onOps} onOpen={onOpen} selected={selected} disabled={disabled} />)}
        </ul>
      )}
      {/* A system with groups adds groups here (items are added inside a group); one without adds items. */}
      <form className="flex flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); if (name.trim() && onOps(ops.addItem(tree, system.id, system.id, name, groups.length ? 'subsystem' : 'component'))) setName(''); }}>
        <input value={name} onChange={e => setName(e.target.value)} disabled={disabled} aria-label={groups.length ? 'New group name' : 'New item name'}
          placeholder={groups.length ? '+ New group' : '+ Add item'} className={`${field} min-w-[10rem] flex-1 py-1.5`} />
        <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !name.trim()}>Add</button>
      </form>
    </div>
  );
}

function GroupRow({ tree, system, g, sub, onOpen, onOps, selected, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; g: TemplateNode; sub: string; onOpen: () => void; onOps: (o: TemplateOp[]) => boolean; selected: boolean; disabled: boolean;
}) {
  const lens = useBuildingLens();
  const [renaming, setRenaming] = useState(false);
  const [v, setV] = useState(g.label);
  const [moving, setMoving] = useState(false);
  const cancelled = useRef(false);
  const sibs = system.children ?? [];
  const idx = sibs.findIndex(c => c.id === g.id);
  const done = () => { setRenaming(false); if (cancelled.current) { cancelled.current = false; return; } const t = v.trim(); if (t && t !== g.label) onOps(ops.rename(g.id, t)); };
  return (
    <li className={`flex items-center gap-2 py-1 pl-3 pr-1 ${selected ? 'bg-accent/10' : ''}`}>
      {renaming ? (
        <div className="min-w-0 flex-1 py-1">
          <input autoFocus value={v} aria-label="Group name" onChange={e => setV(e.target.value)} onBlur={done}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur(); } }}
            className="w-full rounded-md border border-accent bg-surface px-1.5 py-0.5 text-sm font-semibold text-ink outline-none" />
        </div>
      ) : (
        <button className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={onOpen}>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{g.label}</span>
            <span className="block truncate text-xs text-muted">{sub}</span></span>
          <span className="rounded-full bg-ground px-2 py-0.5 font-mono text-xs text-body">{(g.children ?? []).length}</span>
          <span aria-hidden className="text-muted">›</span>
        </button>
      )}
      <Menu label={`More for ${g.label}`} items={[
        { label: 'Rename', disabled: disabled && LOCKED, onSelect: () => { setV(g.label); cancelled.current = false; setRenaming(true); } },
        { label: 'Move up', disabled: (disabled && LOCKED) || (idx <= 0 && 'Already first.'), onSelect: () => { onOps(ops.move(g.id, system.id, idx - 1)); } },
        { label: 'Move down', disabled: (disabled && LOCKED) || (idx >= sibs.length - 1 && 'Already last.'), onSelect: () => { onOps(ops.move(g.id, system.id, idx + 1)); } },
        { label: 'Move to…', disabled: (disabled && LOCKED) || moveBlockFor(tree, g.id) || false, onSelect: () => setMoving(true) },
        { label: 'Switch off', disabled: disabled && LOCKED, onSelect: () => { onOps(lens ? lens.set(g.id, false) : includeOps(tree, g.id, false)); } },
      ]} />
      {moving && <MoveToDialog tree={tree} nodeId={g.id} onOps={onOps} onClose={() => setMoving(false)} onMoved={() => {}} />}
    </li>
  );
}
