'use client';

// USUALLY LIMITED (owner 2026-11-12: "I think we need a way to add a fixed limitation on these. This example, most evap
// coils are enclosed and not visible for inspection"; mockup https://claude.ai/artifact/Es1PBNZxrzsdJbxhonA9Ct
// "approved"). On an item's Condition screen: every new job starts the item as this Limitation, with the company's
// reason and report sentence; the inspector rates it instead when it can be seen.
//
// Stored as the item's `startsLimited` (the same field "We operate it" writes, templates/startsLimited.ts):
//   · a system with a type question (Cooling's AC System Type): one entry per type picked, so a type the item does not
//     show for (a window unit has no evaporator coil) never starts it — the phone starts it when that type is picked
//   · otherwise one entry `{ field: '', value: '*' }`: from the start of every new job (seeded at creation)
import { useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { assessesCondition, ops, startsLimitedList, type StartsLimitedEntry } from '@/lib/templates/editorModel';
import { typeLayoutOf } from '@/lib/templates/typeLayout';
import { rulesFor } from './phonePreviewModel';
import { Toggle, field } from './ui';

const setStarts = (nodeId: string, value: StartsLimitedEntry[] | null): TemplateOp =>
  ({ op: 'setNodeField', nodeId, field: 'startsLimited', value } as TemplateOp);
export const usualSentence = (label: string, reason: string) =>
  `The ${label.toLowerCase()} could not be inspected: ${reason.replace(/\.+$/, '').toLowerCase()}.`;

export function UsuallyLimited({ tree, system, node, onOps, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; node: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const layout = useMemo(() => typeLayoutOf(tree, system, rulesFor(tree)), [tree, system]);
  const typed = !!layout && layout.shows[node.id] !== undefined && layout.questionNode.id !== node.id;
  const types = typed ? (layout!.shows[node.id] ?? []) : [];
  const qField = typed ? layout!.question.field : '';
  // Only this card's entries: "We operate it" entries (a type answer the company does not operate) are left alone.
  const all = startsLimitedList(node);
  const operated = (e: StartsLimitedEntry) => /^not operated$/i.test(e.reason.trim());
  const mine = all.filter(e => (typed ? e.field === qField && !operated(e) : e.field === ''));
  const others = all.filter(e => !mine.includes(e));
  const on = mine.length > 0;
  const reasons = node.limitations ?? [];
  const reason = mine[0]?.reason ?? reasons[0] ?? '';
  const sentence = mine[0]?.sentence ?? (reason ? usualSentence(node.label, reason) : '');
  const [adding, setAdding] = useState('');
  const [text, setText] = useState(sentence);
  const [seen, setSeen] = useState(sentence);
  if (sentence !== seen) { setSeen(sentence); setText(sentence); }

  const write = (r: string, s: string, values: string[]): TemplateOp[] => {
    const next = typed ? values.map(v => ({ field: qField, value: v, reason: r, sentence: s })) : (values.length ? [{ field: '', value: '*', reason: r, sentence: s }] : []);
    const merged = [...others, ...next];
    return [setStarts(node.id, merged.length ? merged : null)];
  };
  const picked = typed ? mine.map(e => e.value) : (on ? ['*'] : []);
  const turn = (v: boolean) => {
    if (!v) { onOps(write(reason, sentence, [])); return; }
    if (!reason) return;
    onOps([...(assessesCondition(node) ? [] : ops.assessed(node.id, true)), ...write(reason, sentence || usualSentence(node.label, reason), typed ? types : ['*'])]);
  };
  const addReason = () => {
    const r = adding.trim(); if (!r) return;
    const o = [...ops.limitations(node.id, [...reasons, r])];
    if (on) o.push(...write(r, usualSentence(node.label, r), picked));
    if (onOps(o)) setAdding('');
  };

  return (
    <div className="mx-4 mt-3 overflow-hidden rounded-xl border border-hairline">
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Usually limited</p>
          <p className="text-xs text-muted">Every job starts with this item as a Limitation. The inspector rates it instead when it can be seen.</p>
        </div>
        <Toggle on={on} disabled={disabled || (!on && !reason)} label="Usually limited" onChange={turn} />
      </div>
      {!on && !reasons.length && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2.5">
          <span className="text-xs text-muted">Add the reason first:</span>
          <input className={`${field} w-72`} value={adding} disabled={disabled} placeholder="e.g. Not visible — enclosed in the air handler" aria-label="Limitation reason"
            onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addReason(); }} />
          <button className="text-xs font-semibold text-accent-ink disabled:opacity-40" disabled={disabled || !adding.trim()} onClick={addReason}>Add</button>
        </div>
      )}
      {on && (
        <div className="space-y-3 border-t border-hairline px-3 py-3">
          <label className="flex flex-wrap items-center gap-3"><span className="w-32 text-xs font-semibold text-ink">Reason</span>
            <select className={`${field} w-auto min-w-72`} value={reason} disabled={disabled}
              onChange={e => { const r = e.target.value; onOps(write(r, usualSentence(node.label, r), picked)); }}>
              {reasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2"><span className="w-32 text-xs font-semibold text-ink">Another reason</span>
            <input className={`${field} w-64`} value={adding} disabled={disabled} placeholder="Add a reason" aria-label="Add a limitation reason"
              onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addReason(); }} />
            <button className="text-xs font-semibold text-accent-ink disabled:opacity-40" disabled={disabled || !adding.trim()} onClick={addReason}>Add</button>
          </div>
          <label className="flex flex-wrap items-start gap-3"><span className="w-32 pt-2 text-xs font-semibold text-ink">Report sentence</span>
            <textarea className={`${field} min-w-0 flex-1`} rows={2} value={text} disabled={disabled} onChange={e => setText(e.target.value)}
              onBlur={() => { const t = text.trim(); if (!t) { setText(sentence); return; } if (t !== sentence) onOps(write(reason, t, picked)); }} />
          </label>
          {typed && (
            <div className="flex flex-wrap items-center gap-2"><span className="w-32 text-xs font-semibold text-ink">When</span>
              <button aria-pressed={picked.length === types.length} disabled={disabled} onClick={() => onOps(write(reason, sentence, types))}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${picked.length === types.length ? 'bg-accent text-white' : 'border border-hairline text-body'}`}>Every type</button>
              {types.map(v => {
                const sel = picked.includes(v);
                return <button key={v} aria-pressed={sel} disabled={disabled || (sel && picked.length === 1)}
                  onClick={() => onOps(write(reason, sentence, sel ? picked.filter(x => x !== v) : [...picked, v]))}
                  className={`rounded-full px-3 py-1 text-xs ${sel ? 'bg-accent/15 font-semibold text-accent-ink' : 'border border-hairline text-body'}`}>{v}</button>;
              })}
            </div>
          )}
          <div className="rounded-lg border border-hairline bg-ground px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">In the report</p>
            <p className="text-sm text-ink"><b>{node.label}</b> — Not inspected. {text || sentence}</p>
          </div>
        </div>
      )}
    </div>
  );
}
