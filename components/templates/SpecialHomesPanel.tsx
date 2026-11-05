'use client';

// Checkpoints for manufactured, older and multi-unit homes, on a system's panel (owner rulings 2026-11-05; mockup
// NZmjwWXEdjvDRYs8ehFiun). Ledrix's 32 special checkpoints (lib/templateBuilder/core/specialHomes.ts, a byte copy of
// the app's) — nothing is added until the company ticks it. "Add" applies every pick as ONE change set through onOps:
// validated, all-or-nothing, one undo. An added checkpoint is an ordinary checkpoint carrying the pack id, shown on every
// job that uses this template; the inspector marks it Not present where a house does not have it (ruling 3).
import { useEffect, useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import {
  SPECIAL_KINDS, isCopiedSystem, kindForTemplate, specialHomeOps, specialRows, type SpecialKind,
} from '@/lib/templateBuilder/core/specialHomes';
import { Pill, btn, label } from './ui';

// The shipped template the checkpoints are copied from — loaded once, on first use (it is large).
let shipped: Promise<InspectionTemplate | null> | null = null;
const loadShipped = () => (shipped ??= import('@/lib/templates/baselines/ledrixDefault.json')
  .then(m => m.default as unknown as InspectionTemplate).catch(() => { shipped = null; return null; }));

export function SpecialHomesPanel({ tree, system, onOps, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const [source, setSource] = useState<InspectionTemplate | null>(null);
  useEffect(() => { let live = true; void loadShipped().then(s => { if (live) setSource(s); }); return () => { live = false; }; }, []);
  const forTemplate = kindForTemplate(tree);
  const rows = useMemo(() => (source ? specialRows(tree, system, source) : []), [tree, system, source]);
  const kinds = SPECIAL_KINDS.filter(k => rows.some(r => r.kind === k.id));
  const firstKind = (kinds.find(k => k.id === forTemplate) ?? kinds[0])?.id ?? 'manufactured';
  const [chosenKind, setKind] = useState<SpecialKind | null>(null);
  const kind = chosenKind && kinds.some(k => k.id === chosenKind) ? chosenKind : firstKind;
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { setPicks(new Set()); setProblem(null); setDone(null); setKind(null); }, [system.id]);

  if (isCopiedSystem(system) || !source || !rows.length) return null;
  const shown = rows.filter(r => r.kind === kind);
  const toggle = (id: string) => setPicks(cur => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = () => {
    const ids = [...picks];
    const r = specialHomeOps(tree, system.id, ids, source);
    if (!r.ok) { setProblem(r.error); return; }
    if (onOps(r.ops)) { setPicks(new Set()); setProblem(null); setDone(`Added ${ids.length} to ${system.label}. Undo is in the toolbar.`); }
  };

  return (
    <div className="space-y-3 rounded-xl border border-hairline px-3 py-3" aria-label="Checkpoints for special homes">
      <div>
        <p className="text-sm font-semibold text-ink">Add checkpoints for special homes</p>
        <p className="text-xs text-muted">Checkpoints only some homes have. Nothing is added until you tick it. Each is a normal checkpoint — Satisfactory, Limitation or Finding — shown on every job that uses this template; the inspector marks it Not present where the house does not have it.</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of home">
        {kinds.map(k => {
          const n = rows.filter(r => r.kind === k.id).length;
          return (
            <button key={k.id} type="button" aria-pressed={k.id === kind} onClick={() => setKind(k.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${k.id === kind ? 'bg-ink text-surface' : 'border border-hairline text-body hover:border-ink'}`}>
              {k.label} · {n}{k.id === forTemplate ? ' · ★ this template' : ''}
            </button>
          );
        })}
      </div>

      {shown.length ? (
        <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
          {shown.map(r => {
            const id = `special-${system.id}-${r.id}`;
            return (
              <li key={r.id} className="flex items-start gap-2 px-3 py-2">
                <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent,#217BE8)]"
                  checked={r.inTemplate || picks.has(r.id)} disabled={disabled || r.inTemplate} onChange={() => toggle(r.id)} />
                <label htmlFor={id} className="min-w-0 flex-1">
                  <span className={`block text-sm ${r.inTemplate ? 'text-muted' : 'text-ink'}`}>{r.label}</span>
                  <span className="block text-xs text-muted">{r.inTemplate ? 'In your template' : r.why}</span>
                </label>
                {r.inTemplate && <Pill tone="ok">Included</Pill>}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-xs text-muted">Nothing for this kind of home in {system.label}.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn.primary} disabled={disabled || !picks.size} onClick={add}>
          {picks.size ? `Add ${picks.size} to ${system.label}` : 'Add checkpoints'}
        </button>
        {!!picks.size && <button type="button" className={btn.ghost + ' text-xs'} onClick={() => setPicks(new Set())}>Clear</button>}
        <p className={label + ' mb-0 normal-case tracking-normal font-normal'}>{picks.size} selected</p>
      </div>
      {problem && <p className="text-xs text-red-700" role="alert">{problem}</p>}
      {done && !problem && <p className="text-xs font-semibold text-ok" role="status">{done}</p>}
    </div>
  );
}
