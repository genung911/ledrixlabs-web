'use client';

// The left menu of the Template Builder: SYSTEMS ONLY (owner 2026-11-05: "I almost feel like the left menu should be
// systems only. Components are in the working area of the page"). One row per system with its item count, reorder on
// hover, and the systems that are switched off. Items, groups, type sections, special homes and what is switched off
// inside a system are all in the work area. No search (removed 2026-11-06, owner). It reads the draft and writes only
// through `onOps` (reorder, add a system).
import { useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { isCovered, ops } from '@/lib/templates/editorModel';
import { Arrow } from './EditorParts';
import { btn, field } from './ui';
import { useBuildingLens } from './BuildingLens';
import { limitCounts, utilityCount } from '@/lib/templates/limitationModel';

type Sel = { systemId: string | null; nodeId: string | null };

const Dot = ({ kind }: { kind: 'system' | 'subsystem' | 'component' }) => kind === 'component'
  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="5" y="5" width="14" height="14" rx="3" /></svg>
  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 10.5L12 4l9 6.5V20H3z" /></svg>;

/** Items (not groups) under a system that new inspections include. */
export function itemCount(n: TemplateNode): number {
  return (n.children ?? []).reduce((c, k) => c + (k.kind === 'component' ? 1 : itemCount(k)), 0);
}


export function SystemTree({ tree, sel, onSelect, onOps, disabled, onOpenUtilities, utilitiesOn, onOpenExpectedLife, expectedLifeOn }: {
  tree: InspectionTemplate; sel: Sel; onSelect: (s: Sel) => void; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
  /** UTILITIES (owner 2026-11-07, mockup D55cNLEk1gM9B4cHbTtD1q): Water, Gas and Power, set once, from the top of the list. */
  onOpenUtilities: () => void; utilitiesOn: boolean;
  /** EXPECTED LIFE (owner 2026-11-12, mockup Gg6Wvs8yXeWorcNvbqWhd2): service lives, set once, beside Utilities. */
  onOpenExpectedLife: () => void; expectedLifeOn: boolean;
}) {
  // No search box (owner 2026-11-06: "can you remove the search bar, I don't think it is needed") — the systems list is
  // short, and a system opens group first.
  const lens = useBuildingLens();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const shown = tree.systems;
  // The limitations count beside each system (owner 2026-11-07: "have a count next to it").
  const limits = useMemo(() => limitCounts(tree), [tree]);
  const utilities = useMemo(() => utilityCount(tree), [tree]);
  const lifeChanges = Array.isArray((tree as { serviceLives?: unknown[] }).serviceLives) ? (tree as { serviceLives: unknown[] }).serviceLives.length : 0;
  const offSystems = tree.trimmedSystems ?? [];
  const addSystem = () => {
    const v = newName.trim(); if (!v) return;
    const o = ops.addSystem(tree, v);
    if (onOps(o)) { setNewName(''); setAdding(false); onSelect({ systemId: (o[o.length - 1] as { node: { id: string } }).node.id, nodeId: null }); }
  };

  return (
    <section aria-label="Systems" className="flex min-h-0 flex-col rounded-xl border border-hairline bg-surface">
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        <li className="mb-1 border-b border-hairline pb-1">
          <button onClick={onOpenUtilities} aria-current={utilitiesOn ? 'true' : undefined}
            className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pl-2 pr-2 text-left text-sm ${utilitiesOn ? 'bg-accent/15 font-semibold text-accent-ink' : 'font-medium text-ink hover:bg-ink/5'}`}>
            <span className="shrink-0 text-muted"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M13 3L5 14h6l-1 7 8-11h-6z" /></svg></span>
            <span className="min-w-0 flex-1 truncate">Utilities</span>
            <span className="whitespace-nowrap font-mono text-[10px] text-muted" title="Water, Gas and Power">{utilities ? <>{utilities} limit{utilities === 1 ? '' : 's'}</> : null}</span>
          </button>
          <button onClick={onOpenExpectedLife} aria-current={expectedLifeOn ? 'true' : undefined}
            className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pl-2 pr-2 text-left text-sm ${expectedLifeOn ? 'bg-accent/15 font-semibold text-accent-ink' : 'font-medium text-ink hover:bg-ink/5'}`}>
            <span className="shrink-0 text-muted"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg></span>
            <span className="min-w-0 flex-1 truncate">Expected life</span>
            <span className="whitespace-nowrap font-mono text-[10px] text-muted" title="Service lives changed from Ledrix">{lifeChanges ? <>{lifeChanges} changed</> : null}</span>
          </button>
        </li>
        {shown.map((s, i) => {
          const on = sel.systemId === s.id && !utilitiesOn && !expectedLifeOn;
          // A building selected in the strip (2026-11-06): its systems are the ones it has.
          const covered = lens ? lens.isIn(s.id) : isCovered(tree, s);
          return (
            <li key={s.id} className="group/sys">
              <div className={`flex items-center gap-1 rounded-lg pl-2 pr-1 ${on ? 'bg-accent/15' : 'hover:bg-ink/5'}`}>
                <button onClick={() => onSelect({ systemId: s.id, nodeId: null })} aria-current={on ? 'true' : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm ${on ? 'font-semibold text-accent-ink' : covered ? 'font-medium text-ink' : 'text-muted'}`}>
                  <span className="shrink-0 text-muted"><Dot kind="system" /></span><span className="truncate">{s.label}</span>
                </button>
                {!covered && <span title="Not covered when an inspection starts" className="text-[10px] font-semibold uppercase text-muted">off</span>}
                <span className="whitespace-nowrap font-mono text-[10px] text-muted group-hover/sys:hidden" title={limits.get(s.id) ? `${itemCount(s)} items · ${limits.get(s.id)} limitations` : 'Items'}>{itemCount(s)}{limits.get(s.id) ? <> · {limits.get(s.id)} limit{limits.get(s.id) === 1 ? '' : 's'}</> : null}</span>
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
