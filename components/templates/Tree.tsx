'use client';

// The left menu of the Template Builder: SYSTEMS ONLY (owner 2026-11-05: "I almost feel like the left menu should be
// systems only. Components are in the working area of the page"). One row per system with its item count, reorder on
// hover, and the systems that are switched off. Items, groups, type sections, special homes and what is switched off
// inside a system are all in the work area. The search still finds items: a match lists under its system and opens
// the item. It reads the draft and writes only through `onOps` (reorder, add a system).
import { useMemo, useState } from 'react';
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

/** Every item or group under `n` whose name matches, with the groups on its way (for the result line). Switched-off
 *  ones are found too and say so. */
function findIn(n: TemplateNode, q: string, trail: string[] = []): Array<{ node: TemplateNode; trail: string[]; off: boolean }> {
  const out: Array<{ node: TemplateNode; trail: string[]; off: boolean }> = [];
  for (const k of n.children ?? []) {
    if (k.label.toLowerCase().includes(q)) out.push({ node: k, trail, off: false });
    if (k.kind !== 'component') out.push(...findIn(k, q, [...trail, k.label]));
  }
  const walkOff = (m: TemplateNode, t: string[]) => {
    for (const o of m.trimmed ?? []) if (o.label.toLowerCase().includes(q)) out.push({ node: o, trail: t, off: true });
    for (const k of m.children ?? []) if (k.kind !== 'component') walkOff(k, [...t, k.label]);
  };
  walkOff(n, trail);
  return out;
}

export function SystemTree({ tree, sel, onSelect, onOps, disabled }: {
  tree: InspectionTemplate; sel: Sel; onSelect: (s: Sel) => void; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const query = q.trim().toLowerCase();
  const results = useMemo(() => new Map(query ? tree.systems.map(s => [s.id, findIn(s, query)] as const) : []), [tree, query]);
  const shown = tree.systems.filter(s => !query || s.label.toLowerCase().includes(query) || (results.get(s.id)?.length ?? 0) > 0);
  const offSystems = (tree.trimmedSystems ?? []).filter(s => !query || s.label.toLowerCase().includes(query));
  const addSystem = () => {
    const v = newName.trim(); if (!v) return;
    const o = ops.addSystem(tree, v);
    if (onOps(o)) { setNewName(''); setAdding(false); onSelect({ systemId: (o[o.length - 1] as { node: { id: string } }).node.id, nodeId: null }); }
  };

  return (
    <section aria-label="Systems" className="flex min-h-0 flex-col rounded-xl border border-hairline bg-surface">
      <div className="border-b border-hairline p-2">
        <label className="relative block">
          <span className="sr-only">Search systems and items</span>
          <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search systems and items…" aria-label="Search systems and items" className={`${field} py-1.5 pl-8`} />
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {shown.map((s, i) => {
          const on = sel.systemId === s.id;
          const covered = isCovered(tree, s);
          const found = results.get(s.id) ?? [];
          return (
            <li key={s.id} className="group/sys">
              <div className={`flex items-center gap-1 rounded-lg pl-2 pr-1 ${on ? 'bg-accent/15' : 'hover:bg-ink/5'}`}>
                <button onClick={() => onSelect({ systemId: s.id, nodeId: null })} aria-current={on ? 'true' : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm ${on ? 'font-semibold text-accent-ink' : covered ? 'font-medium text-ink' : 'text-muted'}`}>
                  <span className="shrink-0 text-muted"><Dot kind="system" /></span><span className="truncate">{s.label}</span>
                </button>
                {!covered && <span title="Not covered when an inspection starts" className="text-[10px] font-semibold uppercase text-muted">off</span>}
                <span className="font-mono text-[10px] text-muted group-hover/sys:hidden" title="Items">{itemCount(s)}</span>
                {!query && <div className="hidden flex-col group-hover/sys:flex focus-within:flex">
                  <button aria-label={`Move ${s.label} up`} disabled={disabled || i === 0} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(s.id, null, i - 1))}><Arrow dir="up" /></button>
                  <button aria-label={`Move ${s.label} down`} disabled={disabled || i === shown.length - 1} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(s.id, null, i + 1))}><Arrow dir="down" /></button>
                </div>}
              </div>
              {found.length > 0 && (
                <ul aria-label={`Matches in ${s.label}`}>
                  {found.map(({ node, trail, off }) => (
                    <li key={node.id}>
                      <button onClick={() => onSelect({ systemId: s.id, nodeId: node.id })} aria-current={sel.nodeId === node.id ? 'true' : undefined}
                        className={`flex w-full items-center gap-1.5 rounded-lg py-1 pl-7 pr-2 text-left text-[13px] ${sel.nodeId === node.id ? 'bg-accent/15 font-semibold text-accent-ink' : off ? 'text-muted hover:bg-ink/5' : 'text-body hover:bg-ink/5'}`}>
                        <span className="shrink-0 text-muted"><Dot kind={node.kind === 'component' ? 'component' : 'subsystem'} /></span>
                        <span className="min-w-0 flex-1 truncate">{[...trail, node.label].join(' › ')}</span>
                        {off && <span className="text-[10px] font-semibold uppercase">off</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
        {!shown.length && !offSystems.length && <li className="px-3 py-4 text-xs text-muted">{query ? `Nothing matches “${q.trim()}”.` : 'No systems yet. Add the first one below.'}</li>}
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
