'use client';

// A TYPED system, one equipment type at a time (owner 2026-11-05, approved mockup
// https://claude.ai/artifact/RUWz7xuKn2qPkq22eFEMS9). Cooling covers six kinds of AC but an inspector only ever sees one
// kind's items; this shows the builder the same thing: type chips, the chosen type's items — the ones every type shares
// listed in each type, no separate "Every" section (owner 2026-11-05) — (shared
// ones carry no "Also: …" text — owner 2026-11-05: "It adds confusion"), Ledrix's suggested parts at the end of each
// type's list (CatalogPanel.LedrixSuggestions; matching items tagged Typical), a grid of items × types whose ticks write the item's rule, count copies as one row,
// and items that follow another system's answer in their own section. The layout itself is lib/templates/typeLayout
// (pure); every edit is template ops through `onOps`, one change set each.
import { useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { assessesCondition, canStartLimited, itemSummary, ops, startsLimitedList, startsLimitedReason } from '@/lib/templates/editorModel';
import { addForTypeOps, copiesOps, copyGroupOf, itemsForType, rowsForType, typeLayoutOf, typeRuleOps, type CopyGroup, type TypeLayout } from '@/lib/templates/typeLayout';
import { catalogMatches, catalogTypesForAnswer, catalogTypesOffField } from '@/lib/templates/catalogModel';
import { LedrixSuggestions } from './CatalogPanel';
import { ItemRow } from './ItemRow';
import { useBuildingLens } from './BuildingLens';
import { MaterialQuestionRows } from './MaterialsBuilder';
import { materialLayoutOf } from '@/lib/templates/materialLayout';
import { rulesFor } from './phonePreviewModel';
import { SPECIAL_HOMES, SPECIAL_KINDS } from '@/lib/templateBuilder/core/specialHomes';

/** A special-home checkpoint says which kind of home it is for ("Manufactured"), not just "Special home" (owner 2026-11-05). */
const kindLabel = (id: string) => { const k = SPECIAL_HOMES.find(s => s.id === id)?.kind; return SPECIAL_KINDS.find(x => x.id === k)?.label ?? 'Special home'; };
import { ChipList, Pill, Toggle, btn, field, label } from './ui';

type OnOps = (o: TemplateOp[]) => boolean;
export const GRID = '__grid';
export const FULL_LIST = '__list';
/** The panel's section anchors — the tree's section rows reveal these (owner 2026-11-05: the tree shows only sections). */
export const SECTION_ID = {
  type: 'tb-sec-type', special: 'tb-sec-special', other: 'tb-sec-other', off: 'tb-sec-off',
  gated: (i: number) => `tb-sec-gated-${i}`,
} as const;

/** The chip row: one chip per type (with how many items it shows), the grid, and the plain list. */
export function TypeChips({ layout, pick, onPick, systemLabel }: { layout: TypeLayout; pick: string; onPick: (v: string) => void; systemLabel: string }) {
  const chip = (v: string, text: React.ReactNode) => (
    <button key={v} type="button" aria-pressed={pick === v} onClick={() => onPick(v)}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${pick === v ? 'border-ink bg-ink text-surface' : 'border-hairline bg-surface text-body hover:text-ink'}`}>{text}</button>
  );
  return (
    <div className="space-y-2 rounded-xl border border-hairline bg-ground px-3 py-3" aria-label="Built by type">
      <p className={label + ' mb-0'}>Built by type · the inspector picks “{layout.question.label}” on site</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${systemLabel} types`}>
        {layout.question.values.map(v => chip(v, <>{v} <span className="font-normal opacity-70">{rowsForType(layout, v).length}</span></>))}
        {chip(GRID, <>All types <span className="font-normal opacity-70">· grid</span></>)}
        {chip(FULL_LIST, 'Full list')}
      </div>
      <p className="text-xs text-muted">{pick === GRID
        ? 'Each row is one item; a tick means it shows for that type. Untick to stop it showing for a type.'
        : pick === FULL_LIST ? 'Every item in its group, as stored. Reorder and rename groups here.'
        : `What an inspector sees when ${layout.question.label} is “${pick}”. Editing an item changes it everywhere it is shared.`}</p>
    </div>
  );
}

export function TypeBuilder({ tree, system, layout, pick, onOps, onOpen, selected, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; layout: TypeLayout; pick: string; onOps: OnOps; onOpen: (id: string) => void; selected: string | null; disabled: boolean;
}) {
  const lens = useBuildingLens();
  const [msg, setMsg] = useState<string | null>(null);
  // A materials question inside a typed system (Electrical's wiring type) is drawn materials first, one row per answer
  // with the card it brings (owner 2026-11-05, mockup VPAuQHWYGoQghmimznXpgf).
  const materialQs = useMemo(() => materialLayoutOf(tree, system, rulesFor(tree)).flatMap(g => g.questions), [tree, system]);
  const [openCopies, setOpenCopies] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const apply = (o: TemplateOp[]) => { if (!o.length) return true; const ok = onOps(o); if (ok) setMsg(null); return ok; };

  const row = (n: TemplateNode, tag?: React.ReactNode): React.ReactNode => {
    if (lens && !lens.isIn(n.id)) return null;   // a building selected: only what's in it (2026-11-06)
    const g = copyGroupOf(layout, n.id);
    if (g) return <CopiesRow key={g.id} g={g} open={openCopies === g.id} onToggle={() => setOpenCopies(openCopies === g.id ? null : g.id)} onOps={apply} onOpen={onOpen} disabled={disabled} />;
    return <ItemRow key={n.id} tree={tree} node={n} onOps={apply} onOpen={onOpen} selected={selected} disabled={disabled} tag={tag} />;
  };
  const section = (id: string, title: string, count: number, children: React.ReactNode, action?: React.ReactNode): React.ReactNode => (
    <div id={id} key={id} className="scroll-mt-2 overflow-hidden rounded-xl border border-hairline">
      <div className="flex items-center gap-2 border-b border-hairline bg-ground px-3 py-1.5">
        <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted">{title} · {count}</p>{action}
      </div>
      <ul className="divide-y divide-hairline">{children}</ul>
    </div>
  );
  // Ledrix's equipment for the chosen answer (Gas Furnace → gas furnace; Boiler → three boilers), and what of the
  // template it already covers: a matching Typical part says so.
  const catTypes = pick === GRID || pick === FULL_LIST ? [] : catalogTypesForAnswer(tree, system, layout.question.field, pick);
  const offTypes = catalogTypesOffField(tree, system, layout.question.field);
  const matches = catalogMatches(system, [...catTypes, ...offTypes]);
  const typical = (n: TemplateNode) => (matches[n.id] === 'typical' ? <Pill tone="ok">Typical</Pill> : null);
  const tagOf = (n: TemplateNode) => {
    const g = copyGroupOf(layout, n.id);
    return g ? <Pill tone="warn">×1–{g.items.length}</Pill> : typical(n);
  };

  const otherSection = layout.other.length > 0 && section(SECTION_ID.other, `When the ${layout.other[0].question.systemLabel.toLowerCase()} answer says so`, layout.other.length, <>
      {layout.other.map(({ node, question }) => row(node, <span className="text-[11px] text-muted">Follows {question.systemLabel} › {question.label}</span>))}
    </>);
  // Items another question in this system decides, and special-home checkpoints: their own sections.
  const gatedSections = layout.gated.map((g, i) => {
    const mq = materialQs.find(q => q.field === g.key);
    if (mq) return section(SECTION_ID.gated(i), `Materials · ${g.question.label}`, mq.cards.length, <li>
      <MaterialQuestionRows q={mq} tree={tree} system={system} onOps={apply} onOpen={onOpen} selected={selected} disabled={disabled} /></li>);
    return section(SECTION_ID.gated(i), `Shown by ${g.question.label}`, g.nodes.length, <>
      {g.nodes.map(n => row(n, <span className="text-[11px] text-muted">Follows {g.question.label}</span>))}
    </>);
  });
  const specialSection = layout.special.length > 0 && section(SECTION_ID.special, 'Special homes', layout.special.length, <>
      {layout.special.map(n => row(n, <Pill>{kindLabel(n.id)}</Pill>))}
    </>);

  if (pick === GRID) {
    const rows = [...layout.every, ...layout.special, ...layout.gated.flatMap(g => g.nodes), ...layout.typed];
    const toggle = (n: TemplateNode, v: string) => {
      const g = copyGroupOf(layout, n.id);
      const cur = layout.shows[n.id] ?? [];
      const want = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
      const r = typeRuleOps(tree, layout, g ? g.items.map(i => i.id) : [n.id], want);
      if (!r.ok) { setMsg(r.reason); return; }
      apply(r.ops);
    };
    return (
      <div className="space-y-3">
        {msg && <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-ink">{msg}</p>}
        <div className="overflow-x-auto rounded-xl border border-hairline">
          <table className="w-full min-w-[640px] border-collapse text-sm" aria-label={`${system.label} items by type`}>
            <thead><tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Item</th>
              {layout.question.values.map(v => <th key={v} className="px-2 py-2 text-center align-bottom text-[11px] font-semibold uppercase tracking-wide text-muted">{v}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(n => {
                const g = copyGroupOf(layout, n.id);
                return (
                  <tr key={n.id} className="border-t border-hairline">
                    <td className="px-3 py-1.5"><button className="text-left" onClick={() => onOpen(n.id)}>
                      <span className="block font-medium text-ink">{g ? g.label : n.label}</span>
                      {g && <span className="text-[11px] text-muted">{g.items.length} copies, edited together</span>}</button></td>
                    {layout.question.values.map(v => {
                      const on = (layout.shows[n.id] ?? []).includes(v);
                      const allowed = (layout.allowed[n.id] ?? layout.question.values).includes(v);
                      return (
                        <td key={v} className="px-2 py-1.5 text-center">
                          <button type="button" role="checkbox" aria-checked={on} aria-label={`${g ? g.label : n.label} for ${v}`}
                            disabled={disabled || !allowed}
                            title={allowed ? undefined : `Ledrix shows ${n.label} only for ${(layout.allowed[n.id] ?? []).join(', ')}. Add your own item for ${v} instead.`}
                            onClick={() => toggle(n, v)}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs ${on ? 'border-accent bg-accent text-white' : 'border-hairline bg-surface text-transparent'} ${allowed ? '' : 'opacity-30'}`}>✓</button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted">A tick you can’t change is Ledrix’s own rule. Your changes are saved as one change each and can be undone.</p>
        {otherSection}
      </div>
    );
  }

  const own = itemsForType(layout, pick);
  return (
    <div className="space-y-3">
      {/* A type's own item (Fireplace › Operation) has its switch on each chip. An item every type shows (Water Heater's TPR)
          has ONE switch for every type, inside that item's own screen (owner 2026-11-06: "should be inside the details of
          the TPR valve section not at the beginning of water heater") — EveryTypeOperates, from Workspace. */}
      {own.filter(canStartLimited).map(n => (
        <OperatesSwitch key={n.id} node={n} field={layout.question.field} value={pick} onOps={apply} disabled={disabled} />
      ))}
      {section(SECTION_ID.type, pick, rowsForType(layout, pick).length, <>
        {row(layout.questionNode, <Pill tone="accent">The type question</Pill>)}
        {/* No "All types" / "Also: …" text (owner 2026-11-05) — the only tag is Ledrix's Typical. */}
        {layout.every.map(n => row(n, tagOf(n)))}
        {own.map(n => row(n, tagOf(n)))}
        {!own.length && <li className="px-3 py-3 text-xs text-muted">No items only for {pick} yet.</li>}
        {catTypes.length > 0 && <li className="px-3 py-2"><LedrixSuggestions tree={tree} system={system} types={catTypes} onOps={apply} disabled={disabled} /></li>}
        <li className="px-3 py-2">
          <form className="flex flex-wrap gap-1.5" onSubmit={e => { e.preventDefault(); const o = addForTypeOps(tree, system, layout, pick, newName); if (o.length && apply(o)) setNewName(''); }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} disabled={disabled} aria-label={`New item for ${pick}`} placeholder={`+ Add item for ${pick}`} className={`${field} min-w-[10rem] flex-1 py-1.5`} />
            <button className={btn.secondary + ' px-3 py-1.5'} disabled={disabled || !newName.trim()}>Add</button>
          </form>
          <p className="mt-1 text-[11px] text-muted">Shows only when {layout.question.label} is “{pick}”.</p>
        </li>
      </>)}
      {gatedSections}
      {specialSection}
      {otherSection}
      {offTypes.map(t => <LedrixSuggestions key={t.id} tree={tree} system={system} types={[t]} onOps={apply} disabled={disabled} when />)}
    </div>
  );
}

/** Count copies (Indoor Head 1..8) as one row; open it to edit every copy at once. */
function CopiesRow({ g, open, onToggle, onOps, onOpen, disabled }: { g: CopyGroup; open: boolean; onToggle: () => void; onOps: OnOps; onOpen: (id: string) => void; disabled: boolean }) {
  const first = g.items[0];
  const allCond = g.items.every(assessesCondition);
  return (
    <li className="px-3 py-2">
      <button className="flex w-full items-center gap-2 text-left" aria-expanded={open} onClick={onToggle}>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{g.label}</span>
          <span className="block truncate text-xs text-muted">Shown by “{g.countLabel}” · {itemSummary(first)}</span></span>
        <Pill tone="warn">×1–{g.items.length}</Pill>
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-lg bg-ground px-3 py-3" aria-label={`Edit all ${g.items.length} copies`}>
          <p className="text-xs text-body">Edits here change all {g.items.length} copies at once.</p>
          <div>
            <label className={label}>Tips</label>
            <textarea defaultValue={first.description ?? ''} disabled={disabled} rows={2} aria-label="Tips for every copy" className={`${field} resize-y`}
              onBlur={e => { const v = e.target.value; if (v !== (first.description ?? '')) onOps(copiesOps(g, n => ops.describe(n.id, v))); }} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-ink">Condition (Satisfactory · Limitation · Finding)</span>
            <Toggle on={allCond} disabled={disabled} label="Condition on every copy" onChange={v => onOps(copiesOps(g, n => ops.assessed(n.id, v)))} />
          </div>
          <div>
            <p className={label}>Limitation reasons</p>
            <ChipList values={first.limitations ?? []} disabled={disabled} addLabel="Add limitation reason to every copy" placeholder="e.g. Head not reachable"
              onChange={v => onOps(copiesOps(g, n => ops.limitations(n.id, v)))} />
          </div>
          <div className="flex flex-wrap gap-1.5">{g.items.map(i => <button key={i.id} className={btn.ghost + ' px-2 py-0.5 text-xs'} onClick={() => onOpen(i.id)}>Open {i.label}</button>)}</div>
        </div>
      )}
    </li>
  );
}

/** "We operate it" (owner 2026-11-06, mockup https://claude.ai/artifact/AVMufpdYL6BrMPw2MXZsY2): per type answer, Off =
 *  the company does not operate that kind, so the item (Fireplace › Operation) starts on the phone as the limitation
 *  and the report prints the sentence below. On = rated normally. Each change is one op (editorModel.ops). */
export function OperatesSwitch({ node, field: f, value, typeLabel, onOps, disabled }: { node: TemplateNode; field: string; value: string; typeLabel?: string; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const every = value === '*';
  const forWhat = every ? `every ${typeLabel ?? 'type'}` : value;
  const entry = startsLimitedList(node).find(e => e.field === f && e.value === value) ?? null;
  const [text, setText] = useState(entry?.sentence ?? '');
  const [shown, setShown] = useState(entry?.sentence ?? '');
  if ((entry?.sentence ?? '') !== shown) { setShown(entry?.sentence ?? ''); setText(entry?.sentence ?? ''); }
  const on = !entry;
  return (
    <div className="overflow-hidden rounded-xl border border-hairline" aria-label={`${node.label} for ${forWhat}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{every ? `We operate the ${node.label}` : 'We operate it'}</span>
          <span className="block text-xs text-muted">{on ? `${node.label} is rated normally for ${forWhat}.` : <>{node.label} starts as <Pill tone="warn">Limitation · {entry!.reason}</Pill> {every ? ' for every type' : ''} — the inspector can change it on a job (phone build {every ? 721 : 720} or later).</>}</span>
        </span>
        <Toggle on={on} label={`We operate ${every ? node.label : value}`} disabled={disabled || !startsLimitedReason(node)} onChange={v => { onOps(ops.operates(node, f, value, v)); }} />
      </div>
      {entry && (
        <div className="border-t border-hairline px-3 py-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted" htmlFor={`sl-${node.id}-${value}`}>Report sentence</label>
          <textarea id={`sl-${node.id}-${value}`} value={text} disabled={disabled} rows={2} onChange={e => setText(e.target.value)}
            onBlur={() => { if (!text.trim()) { setText(entry.sentence); return; } onOps(ops.startsSentence(node, f, value, text)); }}
            className={`${field} mt-1 w-full py-1.5 text-sm`} />
          <p className="text-[11px] text-muted">Printed under {node.label}’s limitation in the report, in place of Ledrix’s wording.</p>
        </div>
      )}
    </div>
  );
}

/** The item-screen switch for an item every type of its system shows (Water Heater's TPR): one "We operate the …" for
 *  every type ('*'). Nothing for an item the type chips don't lay out, or one that can't start as a limitation. */
export function EveryTypeOperates({ tree, system, node, onOps, disabled }: { tree: InspectionTemplate; system: TemplateNode; node: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const layout = useMemo(() => typeLayoutOf(tree, system, rulesFor(tree)), [tree, system]);
  if (!layout || !canStartLimited(node) || !layout.every.some(n => n.id === node.id)) return null;
  return <div className="px-4 pt-4"><OperatesSwitch node={node} field={layout.question.field} value="*" typeLabel={layout.question.label} onOps={onOps} disabled={disabled} /></div>;
}

