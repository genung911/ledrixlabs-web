'use client';

// A system laid out materials first (owner 2026-11-05, mockup https://claude.ai/artifact/VPAuQHWYGoQghmimznXpgf,
// "Approved use recommendations"): each group as (1) its materials — one row per answer with the condition card it
// brings, or, with no materials question, the items that record a choice — (2) what each answer of any other question
// brings ("Brought by", 2026-11-06), then (3) what every home gets. The layout is
// lib/templates/materialLayout (pure); every edit is template ops through `onOps`, one change set each.
import { useMemo, useRef, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { itemSummary, ops } from '@/lib/templates/editorModel';
import { addMaterialOps, materialLayoutOf, removeMaterialOps, switchMaterialOnOps, type BroughtBy, type MaterialQuestion } from '@/lib/templates/materialLayout';
import { ItemRow } from './ItemRow';
import { rulesFor } from './phonePreviewModel';
import { Pill, Toggle, btn, field } from './ui';

type OnOps = (o: TemplateOp[]) => boolean;

export function MaterialsBuilder({ tree, system, onOps, onOpen, selected, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; onOps: OnOps; onOpen: (id: string) => void; selected: string | null; disabled: boolean;
}) {
  const groups = useMemo(() => materialLayoutOf(tree, system, rulesFor(tree)), [tree, system]);
  const item = (n: TemplateNode) => <ItemRow key={n.id} tree={tree} node={n} onOps={onOps} onOpen={onOpen} selected={selected} disabled={disabled} />;
  const stage = (n: number | null, title: string, hint: string, body: React.ReactNode) => (
    <div className="border-t border-hairline first:border-t-0">
      <p className="flex items-baseline gap-2 px-3 pb-1 pt-2.5 text-xs font-semibold text-ink">
        {n !== null && <span className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-accent/15 text-[11px] text-accent">{n}</span>}
        {title}<span className="font-normal text-muted">{hint}</span></p>
      {body}
    </div>
  );

  return (
    <div className="space-y-3" aria-label="Materials first">
      {groups.map(g => {
        // Up to three parts, numbered as shown (owner 2026-11-06, mockup NC6nHJ1mUGuv2ikCUfU3Cc): what is recorded (or the
        // materials), what an answer brings, what every home gets. A part with nothing in it is not shown, and a group of
        // one part is not numbered; with nothing under "every home" only the Add box stays (owner 2026-11-06, Interior,
        // mockup SqNS9bXgLH8HwppCXtwBPY).
        let k = 0;
        const parts = (g.questions.length > 0 ? 1 : 0) + (!g.questions.length && g.materials.length > 0 ? 1 : 0) + g.brought.length;
        const shown = parts + (g.every.length > 0 ? 1 : 0);
        const num = () => (shown > 1 ? ++k : null);
        const add = <AddItem label={g.node.id === system.id ? system.label : g.node.label} disabled={disabled}
          onAdd={name => onOps(ops.addItem(tree, system.id, g.node.id, name))} />;
        return (
          <section key={g.node.id} aria-label={g.node.label} className="overflow-hidden rounded-xl border border-hairline">
            {g.node.id === system.id
              ? <p className="border-b border-hairline bg-ground px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{system.label}</p>
              : <GroupName label={g.node.label} disabled={disabled} onRename={v => onOps(ops.rename(g.node.id, v))} />}
            {g.questions.map(q => stage(num(), q.attr.label || q.node.label, ' · the inspector ticks every one seen',
              <MaterialQuestionRows key={q.field} q={q} tree={tree} system={system} onOps={onOps} onOpen={onOpen} selected={selected} disabled={disabled} />))}
            {!g.questions.length && g.materials.length > 0 && stage(num(), 'Recorded', ' · the inspector picks an answer', <ul className="divide-y divide-hairline">{g.materials.map(item)}</ul>)}
            {g.brought.map(b => <div key={b.field}>{stage(num(), `Brought by ${b.label}`, ' · shown only for these answers', <BroughtRows b={b} onOpen={onOpen} selected={selected} />)}</div>)}
            {g.every.length > 0
              ? stage(num(), 'Checked in every home', '', <><ul className="divide-y divide-hairline">{g.every.map(item)}</ul>{add}</>)
              : <div className="border-t border-hairline first:border-t-0">{add}</div>}
          </section>
        );
      })}
    </div>
  );
}

/** A group's heading, with a pencil that turns it into a box (owner 2026-11-06: rename a group where you work, not only
 *  in Full list). Enter or leaving it saves — one change, through the editor's rename — and Esc cancels. */
function GroupName({ label, onRename, disabled }: { label: string; onRename: (v: string) => boolean; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(label);
  const cancelled = useRef(false);
  if (editing) {
    const done = () => { setEditing(false); if (cancelled.current) { cancelled.current = false; return; } const t = v.trim(); if (t && t !== label) onRename(t); };
    return (
      <div className="border-b border-hairline bg-ground px-2 py-1">
        <input autoFocus value={v} aria-label="Group name" onChange={e => setV(e.target.value)} onBlur={done}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { cancelled.current = true; (e.target as HTMLInputElement).blur(); } }}
          className="w-full rounded-md border border-accent bg-surface px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink outline-none" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 border-b border-hairline bg-ground py-0.5 pl-3 pr-1">
      <p className="min-w-0 flex-1 truncate py-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <button type="button" aria-label={`Rename ${label}`} title="Rename group" disabled={disabled} className={`${btn.icon} shrink-0 disabled:opacity-40`}
        onClick={() => { setV(label); cancelled.current = false; setEditing(true); }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
      </button>
    </div>
  );
}

/** "Brought by": each answer → the items it brings (or "nothing extra"). No switches — answers can share items, so an
 *  answer is changed on its question and an item's rule on the item (owner 2026-11-06, decision 3). */
function BroughtRows({ b, onOpen, selected }: { b: BroughtBy; onOpen: (id: string) => void; selected: string | null }) {
  const cards = (list: TemplateNode[]) => list.length ? list.map((c, i) => (
    <span key={c.id}>{i ? ', ' : ''}<button className={`text-sm text-ink hover:underline ${selected === c.id ? 'font-semibold' : ''}`} onClick={() => onOpen(c.id)}>{c.label}</button></span>
  )) : <span className="italic">nothing extra</span>;
  return (
    <div>
      <ul className="divide-y divide-hairline">
        {b.rows.map(r => (
          <li key={r.value} className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-44 flex-none truncate text-sm font-semibold text-ink" title={r.value}>{r.value}</span>
            <span className="min-w-0 flex-1 text-xs text-muted">{r.cards.length ? '→ ' : ''}{cards(r.cards)}</span>
          </li>
        ))}
        {b.typed.length > 0 && (
          <li className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-44 flex-none truncate text-sm font-semibold text-ink">Other (typed)</span>
            <span className="min-w-0 flex-1 text-xs text-muted">→ {cards(b.typed)}</span>
          </li>
        )}
      </ul>
      <p className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-muted">
        <button type="button" className={btn.ghost + ' px-2 py-1 text-xs'} onClick={() => onOpen(b.node.id)}>Edit the question</button>
        · to change which answer brings an item, open the item
      </p>
    </div>
  );
}

function AddItem({ label, onAdd, disabled }: { label: string; onAdd: (name: string) => boolean; disabled: boolean }) {
  const [name, setName] = useState('');
  return (
    <form className="flex flex-wrap gap-1.5 px-3 py-2" onSubmit={e => { e.preventDefault(); if (name.trim() && onAdd(name.trim())) setName(''); }}>
      <input value={name} onChange={e => setName(e.target.value)} disabled={disabled} aria-label={`New item in ${label}`} placeholder="+ Add item" className={`${field} min-w-[10rem] flex-1 py-1.5`} />
      <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !name.trim()}>Add</button>
    </form>
  );
}

/** One materials question: a row per answer → the card it brings, each with an On/Off switch; the Off materials under the
 *  list, still shown and marked Off (owner 2026-11-06, mockup LZNLt31XvGjAnMrhhmWL2t); "+ Add material". */
export function MaterialQuestionRows({ q, tree, system, onOps, onOpen, selected, disabled }: {
  q: MaterialQuestion; tree: InspectionTemplate; system: TemplateNode; onOps: OnOps; onOpen: (id: string) => void; selected: string | null; disabled: boolean;
}) {
  const [name, setName] = useState('');
  const row = (value: string, card: TemplateNode | null, sw: React.ReactNode, off = false) => (
    <li key={`${off ? 'off:' : ''}${value}`} className={`flex items-center gap-2 px-3 py-1.5 ${card && selected === card.id ? 'bg-accent/10' : ''}`}>
      <span className={`w-36 flex-none truncate text-sm font-semibold ${off ? 'text-muted' : 'text-ink'}`} title={value}>{value}</span>
      {card ? (
        <button className="min-w-0 flex-1 truncate text-left text-xs text-muted hover:text-ink" onClick={() => onOpen(card.id)}>
          → <span className={`text-sm ${off ? 'text-muted' : 'text-ink'}`}>{card.label}</span> · {off ? 'not offered to the inspector' : itemSummary(card)}</button>
      ) : <span className="min-w-0 flex-1 text-xs text-muted">No condition card</span>}
      {off && <Pill tone="warn">Off</Pill>}
      {sw ?? <span className="w-9 flex-none" aria-hidden />}
    </li>
  );
  const label = q.attr.label || q.node.label;
  return (
    <div>
      <ul className="divide-y divide-hairline">
        {q.rows.map(r => row(r.value, r.card,
          <Toggle on label={`${r.value} in ${label}`} disabled={disabled} onChange={v => { if (!v) onOps(removeMaterialOps(q, r.value)); }} />))}
        {q.typed && row('Other (typed)', q.typed, null)}
      </ul>
      {q.off.length > 0 && (<>
        <p className="border-t border-hairline px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Off · {q.off.length}</p>
        <ul className="divide-y divide-hairline" aria-label={`${label} switched off`}>
          {q.off.map(o => row(o.value, o.card,
            <Toggle on={false} label={`${o.value} in ${label}`} disabled={disabled} onChange={v => { if (v) onOps(switchMaterialOnOps(q, o)); }} />, true))}
        </ul>
      </>)}
      <form className="flex flex-wrap items-center gap-1.5 border-t border-hairline px-3 py-2" onSubmit={e => { e.preventDefault(); const o = addMaterialOps(tree, system, q, name); if (o.length && onOps(o)) setName(''); }}>
        <input value={name} onChange={e => setName(e.target.value)} disabled={disabled} aria-label={`New material for ${label}`}
          placeholder="+ Add material" className={`${field} min-w-[10rem] flex-1 py-1.5`} />
        <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !name.trim()}>Add</button>
        <button type="button" className={btn.ghost + ' px-2 py-1 text-xs'} onClick={() => onOpen(q.node.id)}>Edit the question</button>
      </form>
    </div>
  );
}
