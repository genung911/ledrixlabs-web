'use client';

// The Systems & Components tree: the template's real structure (systems → groups → items), searchable, expandable,
// with the add form underneath. It reads the draft tree and writes nothing itself: selecting is navigation, and the
// only edits here (reordering systems, add, restore) go through `onOps` like every other hand edit.
import { useEffect, useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { isCovered, ops } from '@/lib/templates/editorModel';
import { requirementsOf } from '@/lib/templates/requirementModel';
import { AddToTemplate, Arrow, notShownToInspectors } from './EditorParts';
import { btn, field } from './ui';

type Sel = { systemId: string | null; nodeId: string | null };

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={`transition-transform ${open ? 'rotate-90' : ''}`}><path d="M9 6l6 6-6 6" /></svg>
);
const Dot = ({ kind }: { kind: 'system' | 'subsystem' | 'component' }) => kind === 'component'
  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="5" y="5" width="14" height="14" rx="3" /></svg>
  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 10.5L12 4l9 6.5V20H3z" /></svg>;

/** Does this node, or anything under it, match the search? */
function matches(n: TemplateNode, q: string): boolean {
  return n.label.toLowerCase().includes(q) || (n.children ?? []).some(c => matches(c, q));
}

export function SystemTree({ tree, sel, onSelect, onOps, disabled }: {
  tree: InspectionTemplate; sel: Sel; onSelect: (s: Sel) => void; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(sel.systemId ? [sel.systemId] : []));
  const [adding, setAdding] = useState(false);
  const query = q.trim().toLowerCase();
  // Selecting something (here, in the preview or elsewhere) opens the path to it.
  useEffect(() => {
    if (!sel.systemId) return;
    setOpen(prev => {
      const next = new Set(prev); next.add(sel.systemId!);
      const sys = tree.systems.find(s => s.id === sel.systemId);
      const path = (n: TemplateNode, trail: string[]): string[] | null => {
        if (n.id === sel.nodeId) return trail;
        for (const c of n.children ?? []) { const p = path(c, [...trail, n.id]); if (p) return p; }
        return null;
      };
      if (sys && sel.nodeId) (path(sys, []) ?? []).forEach(id => next.add(id));
      return next.size === prev.size ? prev : next;
    });
  }, [sel.systemId, sel.nodeId, tree]);
  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const shown = useMemo(() => tree.systems.filter(s => !query || matches(s, query)), [tree, query]);
  const isOpen = (id: string) => !!query || open.has(id);

  const row = (system: TemplateNode, n: TemplateNode, parentId: string, depth: number): React.ReactNode => {
    if (query && !matches(n, query)) return null;
    const kids = n.children ?? [];
    const group = n.kind !== 'component';
    const on = sel.nodeId === n.id;
    const reqs = requirementsOf(n).length;
    return (
      <li key={n.id}>
        <div className={`flex items-center gap-1 rounded-lg pr-1.5 ${on ? 'bg-accent/15' : 'hover:bg-ink/5'}`} style={{ paddingLeft: 6 + depth * 14 }}>
          {group && kids.length ? (
            <button aria-label={`${isOpen(n.id) ? 'Collapse' : 'Expand'} ${n.label}`} aria-expanded={isOpen(n.id)} onClick={() => toggle(n.id)} className="flex h-6 w-5 items-center justify-center text-muted hover:text-ink"><Chevron open={isOpen(n.id)} /></button>
          ) : <span className="w-5" />}
          <button onClick={() => onSelect({ systemId: system.id, nodeId: n.id })} aria-current={on ? 'true' : undefined}
            className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-[13px] ${on ? 'font-semibold text-accent-ink' : group ? 'text-body' : 'text-ink'}`}>
            <span className="shrink-0 text-muted"><Dot kind={n.kind === 'component' ? 'component' : 'subsystem'} /></span>
            <span className="truncate">{n.label}</span>
          </button>
          {reqs > 0 && <span title={`${reqs} requirement${reqs === 1 ? '' : 's'}`} className="rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold text-accent-ink">{reqs}</span>}
          {notShownToInspectors(system, n, parentId) && <span title="Not shown to inspectors: this system has groups, and inspectors only see items inside a group." className="rounded-full bg-warn/25 px-1.5 text-[10px] font-semibold text-ink">hidden</span>}
        </div>
        {group && kids.length > 0 && isOpen(n.id) && <ul>{kids.map(c => row(system, c, n.id, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <section aria-label="Systems and components" className="flex min-h-0 flex-col rounded-xl border border-hairline bg-surface">
      <div className="border-b border-hairline p-2">
        <label className="relative block">
          <span className="sr-only">Search systems and components</span>
          <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search system or component…" aria-label="Search systems and components" className={`${field} py-1.5 pl-8`} />
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {shown.map((s, i) => {
          const on = sel.systemId === s.id && !sel.nodeId;
          const covered = isCovered(tree, s);
          return (
            <li key={s.id} className="group/sys">
              <div className={`flex items-center gap-1 rounded-lg pr-1 ${on ? 'bg-accent/15' : 'hover:bg-ink/5'}`}>
                <button aria-label={`${isOpen(s.id) ? 'Collapse' : 'Expand'} ${s.label}`} aria-expanded={isOpen(s.id)} onClick={() => toggle(s.id)} className="flex h-7 w-6 items-center justify-center text-muted hover:text-ink"><Chevron open={isOpen(s.id)} /></button>
                <button onClick={() => { onSelect({ systemId: s.id, nodeId: null }); setOpen(p => new Set(p).add(s.id)); }} aria-current={on ? 'true' : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm ${on ? 'font-semibold text-accent-ink' : covered ? 'font-medium text-ink' : 'text-muted'}`}>
                  <span className="shrink-0 text-muted"><Dot kind="system" /></span><span className="truncate">{s.label}</span>
                </button>
                {!covered && <span title="Not covered when an inspection starts" className="text-[10px] font-semibold uppercase text-muted">off</span>}
                {!query && <div className="flex flex-col opacity-0 transition-opacity group-hover/sys:opacity-100 focus-within:opacity-100">
                  <button aria-label={`Move ${s.label} up`} disabled={disabled || i === 0} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(s.id, null, i - 1))}><Arrow dir="up" /></button>
                  <button aria-label={`Move ${s.label} down`} disabled={disabled || i === shown.length - 1} className="text-muted hover:text-ink disabled:opacity-20" onClick={() => onOps(ops.move(s.id, null, i + 1))}><Arrow dir="down" /></button>
                </div>}
              </div>
              {isOpen(s.id) && <ul>{(s.children ?? []).map(c => row(s, c, s.id, 1))}</ul>}
            </li>
          );
        })}
        {!shown.length && <li className="px-3 py-4 text-xs text-muted">{query ? `Nothing matches “${q.trim()}”.` : 'No systems yet. Add the first one below.'}</li>}
      </ul>
      {!!tree.trimmedSystems?.length && (
        <details className="border-t border-hairline px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted">Set-aside systems ({tree.trimmedSystems.length})</summary>
          <ul className="mt-1 space-y-1">{tree.trimmedSystems.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-2"><span className="truncate text-body">{s.label}</span>
              <button className={btn.ghost + ' text-xs'} disabled={disabled} onClick={() => onOps(ops.restore(s.id))}>Restore</button></li>))}</ul>
        </details>
      )}
      <div className="border-t border-hairline p-2">
        {adding
          ? <><AddToTemplate tree={tree} systemId={sel.systemId} onOps={onOps} disabled={disabled} onAdded={s => onSelect(s)} />
              <button className={`${btn.ghost} mt-1 w-full justify-center text-xs`} onClick={() => setAdding(false)}>Done adding</button></>
          : <button className={`${btn.ghost} w-full justify-center`} disabled={disabled} onClick={() => setAdding(true)}>+ Add system / component</button>}
      </div>
    </section>
  );
}
