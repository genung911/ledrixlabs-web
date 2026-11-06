'use client';

// What a template is for, on its Overview (owner 2026-11-05, mockup https://claude.ai/artifact/HANP7FdGGVT542cfPt4YaU,
// "yes to all 3"). Property types and the "Also" kinds (Older home, Log home, New construction) decide which special-home
// checkpoints the template holds and the builder offers (specialHomes.templateKinds). Changing them is never silent:
//   · ADDING a kind lists its checkpoints, ticked, and adds the ticked ones with the field change as ONE change set;
//   · REMOVING a kind asks: switch its checkpoints off (templates never delete an item — it moves to the Off list), or
//     keep them as ordinary items. Either way the field change and the checkpoints are one change set, one undo.
import { useEffect, useMemo, useState } from 'react';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { propertyTypesOf, type PropertyTypeId } from '@/lib/templateBuilder/core/propertyTypes';
import {
  SPECIAL_HOMES, SPECIAL_KINDS, activeKindCheckpoints, specialRows, starterOps, templateKinds, type SpecialKind,
} from '@/lib/templateBuilder/core/specialHomes';
import { ops } from '@/lib/templates/editorModel';
import { PropertyTypePicker } from './PropertyTypes';
import { loadShipped } from './SpecialHomesPanel';
import { btn } from './ui';

type Also = 'older' | 'log' | 'new_construction';
const ALSO: ReadonlyArray<{ id: Also; label: string }> = [
  { id: 'older', label: 'Older home' }, { id: 'log', label: 'Log home' }, { id: 'new_construction', label: 'New construction' },
];
const kindLabel = (k: SpecialKind) => SPECIAL_KINDS.find(x => x.id === k)?.label ?? k;
type Pending = { fields: TemplateOp[]; added: SpecialKind[]; removed: SpecialKind[] };

export function HomeKindsCard({ tree, onOps, disabled }: { tree: InspectionTemplate; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const [source, setSource] = useState<InspectionTemplate | null>(null);
  useEffect(() => { let live = true; void loadShipped().then(s => { if (live) setSource(s); }); return () => { live = false; }; }, []);
  const [pending, setPending] = useState<Pending | null>(null);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);

  const pts = propertyTypesOf(tree);
  const also: Also[] = Array.isArray(tree.alsoKinds) ? tree.alsoKinds : templateKinds(tree).filter((k): k is Also => k === 'older');
  const now = templateKinds(tree);

  const propose = (nextPts: PropertyTypeId[], nextAlso: Also[]) => {
    const fields: TemplateOp[] = [];
    if (nextPts.join() !== pts.join()) fields.push(...ops.propertyTypes(nextPts));
    if (nextAlso.join() !== also.join() || !Array.isArray(tree.alsoKinds)) fields.push({ op: 'setTemplateField', field: 'alsoKinds', value: nextAlso.length ? nextAlso : null });
    const next = templateKinds({ propertyTypes: nextPts, alsoKinds: nextAlso, olderCutoffYear: tree.olderCutoffYear });
    const added = next.filter(k => !now.includes(k)), removed = now.filter(k => !next.includes(k));
    setProblem(null); setUnticked(new Set());
    const removedActive = removed.flatMap(k => activeKindCheckpoints(tree, k));
    if (!added.length && !removedActive.length) { onOps(fields); setPending(null); return; }
    setPending({ fields, added, removed });
  };

  // The checkpoints an added kind brings: Ledrix's, in systems this template holds, not already in it.
  const held = useMemo(() => new Set(tree.systems.map(s => s.id)), [tree]);
  const offer = useMemo(() => {
    if (!pending?.added.length || !source) return [];
    return tree.systems.flatMap(s => specialRows(tree, s, source)).filter(r => pending.added.includes(r.kind) && !r.inTemplate && held.has(r.system));
  }, [pending, source, tree, held]);
  const switchOff = pending ? pending.removed.flatMap(k => activeKindCheckpoints(tree, k)) : [];

  const applyAdd = () => {
    if (!pending || !source) return;
    const ids = offer.map(r => r.id).filter(id => !unticked.has(id));
    const r = starterOps(tree, ids, source);
    if (!r.ok) { setProblem(r.error); return; }
    if (onOps([...pending.fields, ...r.ops])) setPending(null);
  };
  const applyRemove = (off: boolean) => {
    if (!pending) return;
    if (onOps([...pending.fields, ...(off ? switchOff.map(id => ({ op: 'trimNode', nodeId: id }) as TemplateOp) : [])])) setPending(null);
  };
  const systemsOf = (ids: string[]) => {
    const n = new Map<string, number>();
    for (const id of ids) { const s = SPECIAL_HOMES.find(x => x.id === id)?.system; const l = tree.systems.find(x => x.id === s)?.label ?? s ?? ''; n.set(l, (n.get(l) ?? 0) + 1); }
    return [...n].map(([l, c]) => `${l} ${c}`).join(', ');
  };

  return (
    <div className="space-y-3">
      <PropertyTypePicker value={pts} disabled={disabled || !!pending} onChange={v => propose(v, also)} />
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Also</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Also">
          {ALSO.map(a => {
            const on = also.includes(a.id);
            return (
              <button key={a.id} type="button" aria-pressed={on} disabled={disabled || !!pending}
                onClick={() => propose(pts, ALSO.map(x => x.id).filter(id => (id === a.id ? !on : also.includes(id))))}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-accent bg-accent/10 text-accent-ink' : 'border-hairline text-body hover:text-ink'}`}>
                {on ? '✓ ' : ''}{a.label}
              </button>
            );
          })}
        </div>
      </div>

      {pending && pending.added.length > 0 && (
        <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-3 text-sm" role="dialog" aria-label="Add checkpoints">
          {!source ? <p className="text-xs text-muted">Loading Ledrix’s checkpoints…</p> : offer.length ? (<>
            <p className="text-body">Adding <strong>{pending.added.map(kindLabel).join(' and ')}</strong> brings {offer.length} checkpoint{offer.length === 1 ? '' : 's'} ({systemsOf(offer.map(r => r.id))}). They start ticked.</p>
            <ul className="max-h-56 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline bg-surface">
              {offer.map(r => {
                const id = `hk-${r.id}`;
                return (
                  <li key={r.id} className="flex items-start gap-2 px-3 py-1.5">
                    <input id={id} type="checkbox" className="mt-0.5 h-4 w-4" checked={!unticked.has(r.id)}
                      onChange={() => setUnticked(cur => { const n = new Set(cur); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                    <label htmlFor={id} className="min-w-0 flex-1"><span className="block text-ink">{r.label}</span><span className="block text-xs text-muted">{tree.systems.find(s => s.id === r.system)?.label} · {r.why}</span></label>
                  </li>
                );
              })}
            </ul>
          </>) : <p className="text-body">Your template already has every {pending.added.map(kindLabel).join(' and ')} checkpoint.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} disabled={disabled || !source} onClick={applyAdd}>
              {offer.length - unticked.size > 0 ? `Add ${offer.length - unticked.size} checkpoint${offer.length - unticked.size === 1 ? '' : 's'}` : 'Save without checkpoints'}</button>
            <button type="button" className={btn.ghost} onClick={() => setPending(null)}>Cancel</button>
          </div>
          {problem && <p className="text-xs text-red-700" role="alert">{problem}</p>}
        </div>
      )}

      {pending && !pending.added.length && pending.removed.length > 0 && (
        <div className="space-y-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-3 text-sm" role="dialog" aria-label="Remove a kind of home">
          <p className="text-body">Removing <strong>{pending.removed.map(kindLabel).join(' and ')}</strong>: switch off its {switchOff.length} checkpoint{switchOff.length === 1 ? '' : 's'} ({systemsOf(switchOff)})? They move to the Off list. Your own items stay, and inspections already started keep theirs.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} disabled={disabled} onClick={() => applyRemove(true)}>Switch off {switchOff.length}</button>
            <button type="button" className={btn.secondary} disabled={disabled} onClick={() => applyRemove(false)}>Keep them</button>
            <button type="button" className={btn.ghost} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
