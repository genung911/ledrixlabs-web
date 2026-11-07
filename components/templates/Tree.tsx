'use client';

// The left menu of the Template Builder: SYSTEMS ONLY (owner 2026-11-05: "I almost feel like the left menu should be
// systems only. Components are in the working area of the page"). One row per system with its item count, reorder on
// hover, and the systems that are switched off. Items, groups, type sections, special homes and what is switched off
// inside a system are all in the work area. No search (removed 2026-11-06, owner). It reads the draft and writes only
// through `onOps` (reorder, add a system).
import { useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { isCovered, ops } from '@/lib/templates/editorModel';
import { Arrow } from './EditorParts';
import { btn, field } from './ui';

type Sel = { systemId: string | null; nodeId: string | null };

const Dot = ({ kind }: { kind: 'system' | 'subsystem' | 'component' }) => kind === 'component'
  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="5" y="5" width="14" height="14" rx="3" /></svg>
  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 10.5L12 4l9 6.5V20H3z" /></svg>;

/** Items (not groups) under a system that new inspections include. */
export function itemCount(n: TemplateNode): number {
  return (n.children ?? []).reduce((c, k) => c + (k.kind === 'component' ? 1 : itemCount(k)), 0);
}


export function SystemTree({ tree, sel, onSelect, onOps, disabled }: {
  tree: InspectionTemplate; sel: Sel; onSelect: (s: Sel) => void; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  // No search box (owner 2026-11-06: "can you remove the search bar, I don't think it is needed") — the systems list is
  // short, and a system opens group first.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const shown = tree.systems;
  const offSystems = tree.trimmedSystems ?? [];
  const addSystem = () => {
    const v = newName.trim(); if (!v) return;
    const o = ops.addSystem(tree, v);
    if (onOps(o)) { setNewName(''); setAdding(false); onSelect({ systemId: (o[o.length - 1] as { node: { id: string } }).node.id, nodeId: null }); }
  };

  return (
    <section aria-label="Systems" className="flex min-h-0 flex-col rounded-xl border border-hairline bg-surface">
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {shown.map((s, i) => {
          const on = sel.systemId === s.id;
          const covered = isCovered(tree, s);
          return (
            <li key={s.id} className="group/sys">
              <div className={`flex items-center gap-1 rounded-lg pl-2 pr-1 ${on ? 'bg-accent/15' : 'hover:bg-ink/5'}`}>
                <button onClick={() => onSelect({ systemId: s.id, nodeId: null })} aria-current={on ? 'true' : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm ${on ? 'font-semibold text-accent-ink' : covered ? 'font-medium text-ink' : 'text-muted'}`}>
                  <span className="shrink-0 text-muted"><Dot kind="system" /></span><span className="truncate">{s.label}</span>
                </button>
                {!covered && <span title="Not covered when an inspection starts" className="text-[10px] font-semibold uppercase text-muted">off</span>}
                <span className="font-mono text-[10px] text-muted group-hover/sys:hidden" title="Items">{itemCount(s)}</span>
                <div className="hidden flex-col group-hover/sys:flex focus-within:flex">
                  <button aria-label={`Move ${s.label} up`} disabled={disabled || i === 0} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(s.id, null, i - 1))}><Arrow dir="up" /></button>
                  <button aria-label={`Move ${s.label} down`} disabled={disabled || i === shown.length - 1} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(s.id, null, i + 1))}><Arrow dir="down" /></button>
                </div>
              </div>
            </li>
          );
        })}
        {offSystems.map(s => {
          const on = sel.systemId === s.id && !sel.nodeId;
          return (
            <li key={`off-${s.id}`}>
              <div className={`flex items-center gap-1 rounded-lg pl-2 pr-1 ${on ? 'bg-accent/15' : 'hover:bg-ink/5'}`}>
                <button onClick={() => onSelect({ systemId: s.id, nodeId: null })} aria-current={on ? 'true' : undefined}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm text-muted">
                  <span className="shrink-0 opacity-60"><Dot kind="system" /></span><span className="truncate">{s.label}</span>
                </button>
                <span title="Not included in new inspections — inspectors can still add it on site" className="text-[10px] font-semibold uppercase text-muted">off</span>
              </div>
            </li>
          );
        })}
        {!shown.length && !offSystems.length && <li className="px-3 py-4 text-xs text-muted">No systems yet. Add the first one below.</li>}
      </ul>
      <div className="border-t border-hairline p-2">
        {adding
          ? <form aria-label="Add a system" className="flex gap-1.5" onSubmit={e => { e.preventDefault(); addSystem(); }}>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} disabled={disabled} aria-label="New system name" placeholder="System name" className={`${field} min-w-0 py-1.5`} />
              <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !newName.trim()}>Add</button>
              <button type="button" className={btn.ghost + ' px-2 py-1.5'} onClick={() => { setAdding(false); setNewName(''); }}>Cancel</button>
            </form>
          : <button className={`${btn.ghost} w-full justify-center`} disabled={disabled} onClick={() => setAdding(true)}>+ Add system</button>}
      </div>
    </section>
  );
}
