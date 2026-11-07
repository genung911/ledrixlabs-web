'use client';

// A group's screen and a materials question's answers (owner 2026-11-06, group first → "This should not show the list
// of options till we tap into siding"). The group lists its items, one kind of row for all; a materials question's
// answers — each with the condition card it brings and an On/Off switch (mockup LZNLt31XvGjAnMrhhmWL2t) — open inside
// that question's own item screen. The layout is lib/templates/materialLayout (pure); every edit is template ops through
// `onOps`, one change set each.
import { useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { itemSummary, locate, ops } from '@/lib/templates/editorModel';
import { addMaterialOps, materialLayoutOf, removeMaterialOps, switchMaterialOnOps, type MaterialQuestion } from '@/lib/templates/materialLayout';
import { ItemRow } from './ItemRow';
import { rulesFor } from './phonePreviewModel';
import { Pill, Toggle, btn, field } from './ui';

type OnOps = (o: TemplateOp[]) => boolean;

/** A GROUP'S SCREEN (owner 2026-11-06: "This should not show the list of options till we tap into siding. Then it's all
 *  the same whether it's siding, trim, or any other component"): the group's items as rows, one kind of row for all —
 *  Siding Material, Trim / Fascia / Soffit, Gutters… A materials question's cards (Brick → Brick Veneer…) are not rows
 *  here: they open with that question's item, in its Details (MaterialAnswers). Then "+ Add item". */
export function GroupItems({ tree, system, groupId, onOps, onOpen, selected, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; groupId: string; onOps: OnOps; onOpen: (id: string) => void; selected: string | null; disabled: boolean;
}) {
  const layout = useMemo(() => materialLayoutOf(tree, system, rulesFor(tree)), [tree, system]);
  const group = locate(tree, groupId)?.node ?? null;
  const cards = new Set((layout.find(g => g.node.id === groupId)?.questions ?? []).flatMap(q => [...q.rows.map(r => r.card?.id), q.typed?.id]).filter((x): x is string => !!x));
  const rows = (group?.children ?? []).filter(c => !cards.has(c.id));
  return (
    <section aria-label={group?.label ?? 'Group'} className="overflow-hidden rounded-xl border border-hairline">
      {rows.length > 0 && <ul className="divide-y divide-hairline">{rows.map(n => <ItemRow key={n.id} tree={tree} node={n} onOps={onOps} onOpen={onOpen} selected={selected} disabled={disabled} />)}</ul>}
      <div className="border-t border-hairline first:border-t-0">
        <AddItem label={group?.label ?? ''} disabled={disabled} onAdd={name => onOps(ops.addItem(tree, system.id, groupId, name))} />
      </div>
    </section>
  );
}

/** Inside a materials question's own item screen (Siding Material, Supply Material…), under Details: each answer with the
 *  card it brings and its On/Off switch, the Off ones, "+ Add material" — what the group screen used to list. Nothing
 *  for any other item. */
export function MaterialAnswers({ tree, system, node, onOps, onOpen, selected, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; node: TemplateNode; onOps: OnOps; onOpen: (id: string) => void; selected: string | null; disabled: boolean;
}) {
  const qs = useMemo(() => materialLayoutOf(tree, system, rulesFor(tree)).flatMap(g => g.questions).filter(q => q.node.id === node.id), [tree, system, node.id]);
  if (!qs.length) return null;
  return (
    <div className="space-y-3 px-4 pt-4">
      {qs.map(q => (
        <div key={q.field} className="overflow-hidden rounded-xl border border-hairline" aria-label={`${q.attr.label || q.node.label} answers`}>
          <p className="border-b border-hairline bg-ground px-3 py-1.5 text-xs font-semibold text-ink">{q.attr.label || q.node.label} <span className="font-normal text-muted">· each answer and the card it brings · the inspector ticks every one seen</span></p>
          <MaterialQuestionRows q={q} tree={tree} system={system} onOps={onOps} onOpen={onOpen} selected={selected} disabled={disabled} />
        </div>
      ))}
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
