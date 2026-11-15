'use client';
// The template's era items (x2 phase 2, ledrix-app DECISIONS 2026-11-14; approved mockup V5QHLXYzFcCuFF4RduCqb7): each item
// that shows only for a house built in its years — when it shows, Change, and Add for Ledrix's era items this template
// does not have. The rows and every op are the app's own (lib/templateBuilder/core/eraItems.ts, a byte copy).
import { useMemo, useState } from 'react';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { addEraItemOps, eraRows, eraWords, setEraOps, type Era, type EraRow } from '@/lib/templateBuilder/core/eraItems';
import pack from '@/lib/scope/core/taxonomy/ledrix.core.json';
import ledrixDefault from '@/lib/templates/baselines/ledrixDefault.json';
import { btn } from './ui';

type PackSys = { id: string; label: string; nodes: { id: string; label?: string; requires?: unknown }[] };
const SYSTEMS = (pack as unknown as { systems: PackSys[] }).systems;
const PACK_NODES = SYSTEMS.flatMap(s => s.nodes);
const SYSTEM_OF = new Map(SYSTEMS.flatMap(s => s.nodes.map(n => [n.id, { id: s.id, label: s.label }] as const)));

export function EraItemsCard({ tree, onOps, disabled }: { tree: InspectionTemplate; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const rows = useMemo(() => eraRows(tree, PACK_NODES, id => SYSTEM_OF.get(id)), [tree]);
  const [editing, setEditing] = useState<string | null>(null);
  const inTpl = rows.filter(r => r.state === 'active'), offered = rows.filter(r => r.state !== 'active');
  return (
    <div>
      <p className="text-sm text-body">Each of these shows only for a house built in its years. The job&apos;s year built decides; with no year built, they all show.</p>
      {inTpl.length ? (
        <ul className="mt-2 divide-y divide-hairline" aria-label="Era items in this template">
          {inTpl.map(r => (
            <li key={r.id} className="py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 text-sm text-ink">{r.label} <span className="text-xs text-muted">· {r.systemLabel}</span></span>
                <span className="text-sm text-body">Shows when {eraWords(r.era)}</span>
                {r.own ? <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">Your years</span> : null}
                <button type="button" className={btn.ghost} disabled={disabled} onClick={() => setEditing(editing === r.id ? null : r.id)}
                  aria-expanded={editing === r.id} aria-label={`Change when ${r.label} shows`}>Change</button>
              </div>
              {editing === r.id ? <EraEditor row={r} disabled={disabled} onSave={era => { if (onOps(setEraOps(r.id, era))) setEditing(null); }} onCancel={() => setEditing(null)} /> : null}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-muted">No era items in this template yet.</p>}
      {offered.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-accent">Ledrix&apos;s era items not in this template · {offered.length}</summary>
          <ul className="mt-2 divide-y divide-hairline">
            {offered.map(r => {
              const add = addEraItemOps(tree, r.id, ledrixDefault as unknown as InspectionTemplate);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 text-sm text-ink">{r.label} <span className="text-xs text-muted">· {r.systemLabel}{r.state === 'set_aside' ? ' · set aside' : ''}</span></span>
                  <span className="text-sm text-body">Shows when {eraWords(r.era)}</span>
                  <button type="button" className={btn.ghost} disabled={disabled || !add} onClick={() => { if (add) onOps(add); }} aria-label={`Add ${r.label}`}>Add</button>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** Before a year, or between two (inclusive); "Use Ledrix's years" clears the company's own. */
function EraEditor({ row, disabled, onSave, onCancel }: { row: EraRow; disabled: boolean; onSave: (e: Era | null) => void; onCancel: () => void }) {
  const between = row.era.from !== undefined || row.era.through !== undefined;
  const [mode, setMode] = useState<'before' | 'between'>(between ? 'between' : 'before');
  const [a, setA] = useState(String(between ? row.era.from ?? '' : row.era.before ?? ''));
  const [b, setB] = useState(String(row.era.through ?? ''));
  const year = (s: string) => { const n = parseInt(s, 10); return Number.isInteger(n) && n >= 1600 && n <= 2200 ? n : null; };
  const era: Era | null = mode === 'before' ? (year(a) ? { before: year(a)! } : null) : (year(a) && year(b) && year(a)! <= year(b)! ? { from: year(a)!, through: year(b)! } : null);
  const field = 'w-24 rounded-lg border border-hairline bg-surface px-2 py-1 text-sm text-ink';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-surface p-3 text-sm">
      <select className={field + ' w-auto'} value={mode} onChange={e => setMode(e.target.value as 'before' | 'between')} aria-label="When it shows">
        <option value="before">Built before</option>
        <option value="between">Built between</option>
      </select>
      <input className={field} inputMode="numeric" value={a} onChange={e => setA(e.target.value)} aria-label={mode === 'before' ? 'Year' : 'From year'} placeholder="1950" />
      {mode === 'between' ? <><span className="text-muted">and</span><input className={field} inputMode="numeric" value={b} onChange={e => setB(e.target.value)} aria-label="Through year" placeholder="1995" /></> : null}
      <button type="button" className={btn.primary} disabled={disabled || !era} onClick={() => onSave(era)}>Save</button>
      {row.own && row.ledrix ? <button type="button" className={btn.ghost} disabled={disabled} onClick={() => onSave(null)}>Use Ledrix&apos;s years ({eraWords(row.ledrix)})</button> : null}
      <button type="button" className={btn.ghost} onClick={onCancel}>Cancel</button>
    </div>
  );
}
