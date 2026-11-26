'use client';

// GUIDED TEMPLATE SETUP (owner 2026-11-14, mockup CRnpRrr8VpZL4s9rzkj3ms → "Approved, start building it"): "What you
// inspect", walked like the inspection. The systems down the left with how far each is; one question at a time in the
// middle with Back · Skip · Next (Enter / ←); the inspector's phone on the right (the page's PhonePreview), opened on the
// item asked. A materials item asks which materials and which need a photo; any other item, whether to inspect it. One
// plain sentence where a rule applies. Every answer is an existing builder edit (lib/templates/guidedModel), so "All
// settings" shows exactly what the walk did. Which steps were looked at is this visit's only (never stored).
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { rulesFor } from './phonePreviewModel';
import { displayLabel } from './systemLabel';
import { isCovered, linksOf, ops } from '@/lib/templates/editorModel';
import {
  guidedStepsOf, sharedPartsOf, whenSentence, itemAnswerOf, itemAnswerOps, materialChoices, toggleMaterialOps, addMaterialOps,
  materialPhotoOf, materialPhotoOps, type GuidedStep, type ItemAnswer, type MaterialPhoto,
} from '@/lib/templates/guidedModel';
import { btn, field } from './ui';
import { RuleEditor } from './RuleEditor';
import { COLOR_ICONS, COLOR_SVGS } from './colorIcons';

/** A system's icon, in the app's own color drawing (colorIcons.ts) — none when it has no drawing. Our own constants, never user content. */
function SysIcon({ name }: { name?: string }) {
  const xml = COLOR_ICONS && name ? COLOR_SVGS[name] : undefined;
  return xml ? <span aria-hidden className="block h-9 w-9 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: xml }} /> : <span aria-hidden className="block h-9 w-9" />;
}

type Props = {
  tree: InspectionTemplate; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
  /** The step's item, so the preview beside the walk opens on it. */
  onFocus: (s: { systemId: string; nodeId: string | null }) => void;
  onAllSettings: () => void;
};

const ITEM_CHOICES: Array<{ a: ItemAnswer; label: string }> = [
  { a: 'yes', label: 'Yes, inspect it' }, { a: 'photo', label: 'Yes, and require a photo' }, { a: 'no', label: 'No, leave it out' },
];
const low = (s: string) => displayLabel(s).toLowerCase();

export function GuidedSetup({ tree, onOps, disabled, onFocus, onAllSettings }: Props) {
  const defs = useMemo(() => rulesFor(tree), [tree]);
  const systems = tree.systems;
  const [sysId, setSysId] = useState<string | null>(null);
  const [at, setAt] = useState<number | 'end'>(0);
  const [seen, setSeen] = useState<Record<string, Set<string>>>({});
  const system = systems.find(s => s.id === sysId) ?? null;
  const steps = useMemo(() => (system ? guidedStepsOf(tree, system, defs) : []), [tree, system, defs]);
  const step: GuidedStep | null = typeof at === 'number' ? steps[at] ?? null : null;
  const stepsOf = useCallback((s: TemplateNode) => guidedStepsOf(tree, s, defs), [tree, defs]);
  const looked = (id: string) => seen[id] ?? new Set<string>();
  const mark = (id: string, key: string) => setSeen(p => ({ ...p, [id]: new Set([...(p[id] ?? []), key]) }));

  useEffect(() => { if (system && step) { mark(system.id, step.key); onFocus({ systemId: system.id, nodeId: step.node.id }); } }, [system?.id, step?.key]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (typeof at === 'number' && steps.length && at >= steps.length) setAt(steps.length - 1); }, [steps.length, at]);

  const open = (id: string, i: number | 'end' = 0) => { setSysId(id); setAt(i); };
  const next = () => { if (typeof at === 'number') setAt(at + 1 >= steps.length ? 'end' : at + 1); };
  const back = () => { if (at === 'end') setAt(Math.max(0, steps.length - 1)); else if (at > 0) setAt(at - 1); else setSysId(null); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!system || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'Enter' && at !== 'end') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const pct = (s: TemplateNode) => { const n = stepsOf(s).length; return n ? Math.round((looked(s.id).size / n) * 100) : 0; };
  const rail = (
    <nav aria-label="Systems" className="flex max-h-[40vh] min-h-0 flex-col gap-0.5 overflow-y-auto rounded-xl border border-hairline bg-surface p-2 lg:max-h-none">
      {systems.map(s => {
        const on = s.id === sysId, p = pct(s);
        return (
          <div key={s.id}>
            <button type="button" onClick={() => open(s.id)} aria-current={on ? 'true' : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${on ? 'bg-accent/10 font-semibold text-accent-ink' : 'text-body hover:bg-ink/5'} ${isCovered(tree, s) ? '' : 'opacity-60'}`}>
              <span className="min-w-0 flex-1 truncate">{displayLabel(s.label)}</span>
              <span className="h-1 w-10 shrink-0 overflow-hidden rounded bg-hairline" aria-label={`${p}% looked at`}><span className={`block h-1 ${p >= 100 ? 'bg-emerald-600' : 'bg-accent'}`} style={{ width: `${p}%` }} /></span>
            </button>
            {on ? (
              <ol className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-hairline pl-2">
                {steps.map((st, i) => (st.kind === 'materialPhoto' ? null : (
                  <li key={st.key}>
                    <button type="button" onClick={() => setAt(i)}
                      className={`w-full truncate rounded px-2 py-1 text-left text-xs ${at === i || (step?.node.id === st.node.id) ? 'bg-ground font-semibold text-ink' : 'text-muted hover:text-ink'}`}>
                      {looked(s.id).has(st.key) ? '✓ ' : ''}{displayLabel(st.node.label)}
                    </button>
                  </li>
                )))}
              </ol>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      {rail}
      <section aria-label="Guided setup" className="flex min-h-[520px] flex-col gap-4 rounded-xl border border-hairline bg-surface px-6 pt-6 lg:px-10">
        <div className="flex items-center justify-end"><button type="button" className={`${btn.ghost} px-0`} onClick={onAllSettings}>All settings</button></div>
        {!system ? <Start tree={tree} systems={systems} pct={pct} onOpen={open} /> : at === 'end' || !step ? (
          <>
            <Review system={system} steps={steps} tree={tree} onChange={i => setAt(i)} />
            {(() => {
              const i = systems.findIndex(s => s.id === system.id), after = systems[i + 1];
              return <StepBar where={`${i + 1} of ${systems.length} · ${displayLabel(system.label)}`}>
                <button type="button" className={btn.secondary} onClick={back}>‹ Back</button>
                <button type="button" className={`${btn.primary} min-w-[180px]`} onClick={() => { if (after) open(after.id); else setSysId(null); }}>
                  {after ? `Next: ${displayLabel(after.label)} ›` : 'Done ›'}</button>
              </StepBar>;
            })()}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="flex flex-1 gap-[3px]">{steps.map((st, i) => <i key={st.key} className={`h-1 flex-1 rounded ${i <= (at as number) ? 'bg-accent' : 'bg-hairline'}`} />)}</span>
              <span className="whitespace-nowrap text-xs text-muted">{displayLabel(system.label)} · {(at as number) + 1} of {steps.length}</span>
            </div>
            <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted">{step.group}</p>
            <StepBody step={step} tree={tree} defs={defs} onOps={onOps} disabled={disabled} />
            <StepBar where={`${displayLabel(system.label)} · ${(at as number) + 1} of ${steps.length}`} hint="Enter = Next · ← key = Back">
              <button type="button" className={btn.secondary} onClick={back}>‹ Back</button>
              <button type="button" className={btn.secondary} onClick={next}>Skip</button>
              <button type="button" className={`${btn.primary} min-w-[180px]`} onClick={next}>Next</button>
            </StepBar>
          </>
        )}
      </section>
    </div>
  );
}

function Start({ tree, systems, pct, onOpen }: { tree: InspectionTemplate; systems: TemplateNode[]; pct: (s: TemplateNode) => number; onOpen: (id: string) => void }) {
  const next = systems.find(s => isCovered(tree, s) && pct(s) < 100) ?? systems[0];
  return (
    <>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted">{tree.name ?? 'Your template'}</p>
      <h2 className="text-3xl font-extrabold leading-tight text-ink">Set up your checklist</h2>
      <p className="-mt-2 text-[15px] text-body">Pick a system. We'll walk it item by item.</p>
      <div className="grid max-w-3xl grid-cols-3 gap-3 sm:grid-cols-4">
        {systems.map(s => {
          const p = pct(s);
          return (
            <button key={s.id} type="button" onClick={() => onOpen(s.id)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border border-hairline bg-ground px-2 pb-3 pt-4 text-sm font-semibold text-ink hover:border-accent ${isCovered(tree, s) ? '' : 'opacity-60'}`}>
              <SysIcon name={(s as TemplateNode & { icon?: string }).icon} />
              <span className="min-h-[2.5em] text-center leading-tight">{displayLabel(s.label)}</span>
              <span className="h-1 w-3/4 overflow-hidden rounded bg-hairline"><span className={`block h-1 ${p >= 100 ? 'bg-emerald-600' : 'bg-accent'}`} style={{ width: `${p}%` }} /></span>
            </button>
          );
        })}
      </div>
      {next ? <StepBar where={`${systems.length} system${systems.length === 1 ? '' : 's'}`}><button type="button" className={`${btn.primary} min-w-[220px]`} onClick={() => onOpen(next.id)}>Continue {displayLabel(next.label)} ›</button></StepBar> : null}
    </>
  );
}

function Opt({ on, children, onClick, disabled }: { on: boolean; children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} disabled={disabled} onClick={onClick}
      className={`flex min-h-[52px] items-center gap-3 rounded-xl border px-4 text-left text-[15px] font-semibold text-ink disabled:opacity-60 ${on ? 'border-2 border-accent bg-accent/10' : 'border-hairline bg-surface hover:bg-ink/5'}`}>
      <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] text-white ${on ? 'border-accent bg-accent' : 'border-muted'}`}>{on ? '✓' : ''}</span>
      {children}
    </button>
  );
}

function StepBody({ step, tree, defs, onOps, disabled }: { step: GuidedStep; tree: InspectionTemplate; defs: ReturnType<typeof rulesFor>; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const [adding, setAdding] = useState('');
  // "Only when it's…" opens its materials with none ticked; nothing is required until one is picked.
  const [some, setSome] = useState(false);
  useEffect(() => { setAdding(''); setSome(false); }, [step.key]);
  const when = whenSentence(tree, defs, step.node);
  const title = displayLabel(step.node.label);
  if (step.kind === 'materials') {
    const choices = materialChoices(step.q);
    const add = () => { const v = adding.trim(); if (v && onOps(addMaterialOps(tree, systemOf(tree, step.node), step.q, v))) setAdding(''); };
    return (
      <>
        <h2 className="max-w-[26ch] text-3xl font-extrabold leading-tight text-ink">Which {low(step.node.label)} options can inspectors choose?</h2>
        <p className="-mt-2 text-[15px] text-body">Each one chosen gets its own condition rating.</p>
        {when ? <p className="text-sm text-body">{when}</p> : null}
        <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          {choices.map(c => <Opt key={c.value} on={c.on} disabled={disabled} onClick={() => onOps(toggleMaterialOps(step.q, c.value, !c.on))}>{c.value}</Opt>)}
        </div>
        <div className="flex max-w-md items-center gap-2">
          <input className={field} placeholder="Add a material" value={adding} disabled={disabled} onChange={e => setAdding(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} aria-label={`Add a ${low(step.node.label)} option`} />
          <button type="button" className={btn.secondary} disabled={disabled || !adding.trim()} onClick={add}>Add</button>
        </div>
        {/* LEAVE IT OUT (owner 2026-11-14, test run x7: "how do i remove this?") — the item's own switch, as "No, leave it
            out" on an ordinary item; it keeps its place in the walk to bring back. */}
        {itemAnswerOf(tree, step.node) === 'no'
          ? <p className="text-sm text-body">{title} is left out. <button type="button" className="font-semibold text-accent" disabled={disabled} onClick={() => onOps(itemAnswerOps(tree, step.node, 'yes'))}>Bring it back</button></p>
          : <button type="button" className="self-start text-sm font-semibold text-muted hover:text-ink" disabled={disabled} onClick={() => onOps(itemAnswerOps(tree, step.node, 'no'))}>Leave {title} out</button>}
      </>
    );
  }
  if (step.kind === 'materialPhoto') {
    const saved = materialPhotoOf(step.q);
    const cur: MaterialPhoto = some && saved.mode !== 'some' ? { mode: 'some', values: [] } : saved;
    const set = (want: MaterialPhoto) => { setSome(want.mode === 'some'); onOps(materialPhotoOps(tree, step.q, want.mode === 'some' && !want.values.length ? { mode: 'no', values: [] } : want)); };
    return (
      <>
        <h2 className="max-w-[26ch] text-3xl font-extrabold leading-tight text-ink">Require a photo of the {low(step.node.label)}?</h2>
        <div className="flex max-w-md flex-col gap-3">
          <Opt on={cur.mode === 'no'} disabled={disabled} onClick={() => set({ mode: 'no', values: [] })}>No</Opt>
          <Opt on={cur.mode === 'every'} disabled={disabled} onClick={() => set({ mode: 'every', values: [] })}>Every time</Opt>
          <Opt on={cur.mode === 'some'} disabled={disabled} onClick={() => { if (cur.mode !== 'some') { setSome(true); if (saved.mode === 'every') onOps(materialPhotoOps(tree, step.q, { mode: 'no', values: [] })); } }}>Only when it's…</Opt>
        </div>
        {cur.mode === 'some' ? (
          <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
            {step.q.rows.filter(r => r.card).map(r => {
              const on = cur.values.includes(r.value);
              return <Opt key={r.value} on={on} disabled={disabled} onClick={() => {
                const values = on ? cur.values.filter(v => v !== r.value) : [...cur.values, r.value];
                set({ mode: 'some', values });
              }}>{r.value}</Opt>;
            })}
          </div>
        ) : null}
      </>
    );
  }
  const a = itemAnswerOf(tree, step.node);
  return (
    <>
      <h2 className="max-w-[26ch] text-3xl font-extrabold leading-tight text-ink">Inspect the {low(title)}?</h2>
      {when ? <p className="-mt-2 text-[15px] text-body">{when}</p> : null}
      <div className="flex max-w-md flex-col gap-3">
        {ITEM_CHOICES.map(c => <Opt key={c.a} on={a === c.a} disabled={disabled} onClick={() => { if (a !== c.a) onOps(itemAnswerOps(tree, step.node, c.a)); }}>{c.label}</Opt>)}
      </div>
      {a !== 'no' ? <GuidedAlsoShowIn tree={tree} node={step.node} onOps={onOps} disabled={disabled} /> : null}
      {a !== 'no' ? <GuidedOnlySometimes tree={tree} node={step.node} onOps={onOps} disabled={disabled} /> : null}
    </>
  );
}

/** "+ ONLY SOMETIMES…" (owner 2026-11-14, mockup T3Vyt8FwMq4tKCTck6Eao7 approved): the same "Shows when…" picker the full
 *  editor has (RuleEditor), for the item on screen — a house fact (Water is Well), another item's answer, "is not", or
 *  "any answer except None". Saved as one change, exactly as the full editor saves it (ops.applicability). */
function GuidedOnlySometimes({ tree, node, onOps, disabled }: { tree: InspectionTemplate; node: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const rule = (node as TemplateNode & { appliesWhen?: unknown }).appliesWhen;
  const [open, setOpen] = useState(rule !== undefined);
  if (!open) return <button type="button" className="self-start text-sm font-semibold text-accent" disabled={disabled} onClick={() => setOpen(true)}>+ Only sometimes…</button>;
  return (
    <div className="max-w-xl rounded-xl border border-hairline p-3">
      <p className="mb-2 text-sm font-semibold text-ink">Shows when…</p>
      <RuleEditor tree={tree} forNodeId={node.id} rule={rule} idPrefix={`gs-${node.id}`} disabled={disabled}
        emptyText="Always, whenever its system is in the inspection."
        onSave={r => onOps(ops.applicability(node, r, null))} />
    </div>
  );
}

/** "ALSO SHOW IN…" (owner 2026-11-14, test run x5, mockup V5QHLXYzFcCuFF4RduCqb7 approved): the systems this item also
 *  shows in, as chips; the button opens a list of the others to tick. The same edit as All settings' Also show in
 *  (ops.showIn / ops.unlink) — recorded once, reported where it lives. */
function GuidedAlsoShowIn({ tree, node, onOps, disabled }: { tree: InspectionTemplate; node: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [node.id]);
  const home = systemOf(tree, node);
  const links = linksOf(tree, node.id);
  const others = tree.systems.filter(s => s.id !== home.id && !(s as TemplateNode & { space?: boolean }).space);
  return (
    <div className="max-w-2xl space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {links.length ? <span className="text-xs text-muted">Also shows in</span> : null}
        {links.map(l => {
          const sys = tree.systems.find(s => s.id === l.systemId);
          return (
            <span key={l.pointerId} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-ink">
              {displayLabel(sys?.label ?? l.systemId)}
              <button type="button" aria-label={`Stop showing in ${displayLabel(sys?.label ?? l.systemId)}`} disabled={disabled} onClick={() => onOps(ops.unlink(l.pointerId))}>×</button>
            </span>
          );
        })}
        <button type="button" className="text-sm font-semibold text-accent" disabled={disabled} onClick={() => setOpen(o => !o)}>{open ? 'Done' : '+ Also show in…'}</button>
      </div>
      {open ? (
        <div className="grid grid-cols-1 gap-2 rounded-xl border border-hairline bg-ground p-3 sm:grid-cols-2" role="group" aria-label="Also show in">
          {others.map(s => {
            const link = links.find(l => l.systemId === s.id);
            return <Opt key={s.id} on={!!link} disabled={disabled} onClick={() => onOps(link ? ops.unlink(link.pointerId) : ops.showIn(tree, node, s.id))}>{displayLabel(s.label)}</Opt>;
          })}
        </div>
      ) : null}
    </div>
  );
}

function systemOf(tree: InspectionTemplate, node: TemplateNode): TemplateNode {
  const has = (n: TemplateNode): boolean => n.id === node.id || [...(n.children ?? []), ...((n as TemplateNode & { trimmed?: TemplateNode[] }).trimmed ?? [])].some(has);
  return tree.systems.find(has) ?? tree.systems[0];
}

// NEXT STAYS IN ONE PLACE (owner 2026-11-24: "The next button jumps around, can that be stationary?"; approval pack item 11,
// approved 2026-11-25). Back and Next sit in one bar pinned to the bottom of the walk — the same spot on every question
// and on a system's summary, however tall the question is — with where you are on the left.
function StepBar({ where, hint, children }: { where: string; hint?: string; children: React.ReactNode }) {
  return (
    <div aria-label="Steps" className="sticky bottom-0 z-10 -mx-6 mt-auto flex min-h-[60px] rounded-b-xl flex-wrap items-center gap-2.5 border-t border-hairline bg-surface/95 px-6 py-3 backdrop-blur lg:-mx-10 lg:px-10">
      <span className="mr-auto min-w-0 truncate text-sm text-muted">{where}{hint ? <span className="ml-3 hidden text-xs xl:inline">{hint}</span> : null}</span>
      {children}
    </div>
  );
}

function Review({ system, steps, tree, onChange }: { system: TemplateNode; steps: GuidedStep[]; tree: InspectionTemplate; onChange: (i: number) => void }) {
  const answer = (st: GuidedStep): string => {
    if (st.kind === 'materials') { const on = materialChoices(st.q).filter(c => c.on); return `${on.length} material${on.length === 1 ? '' : 's'}`; }
    if (st.kind === 'materialPhoto') { const p = materialPhotoOf(st.q); return p.mode === 'no' ? 'No photo' : p.mode === 'every' ? 'Photo every time' : `Photo for ${p.values.join(', ')}`; }
    const a = itemAnswerOf(tree, st.node); return a === 'no' ? 'Left out' : a === 'photo' ? 'Inspected · photo required' : 'Inspected';
  };
  return (
    <>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted">{displayLabel(system.label)}</p>
      <h2 className="text-3xl font-extrabold leading-tight text-ink">{displayLabel(system.label)} is set</h2>
      <div className="max-w-2xl overflow-hidden rounded-xl border border-hairline">
        {steps.map((st, i) => (
          <div key={st.key} className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-3 border-t border-hairline px-4 py-2.5 text-sm first:border-t-0">
            <span className="truncate text-body">{displayLabel(st.node.label)}{st.kind === 'materialPhoto' ? ' · photo' : ''}</span>
            <span className="min-w-0 text-ink">{answer(st)}</span>
            <button type="button" className="text-sm font-semibold text-accent-ink hover:underline" onClick={() => onChange(i)}>Change</button>
          </div>
        ))}
      </div>
      {/* ONE UNIT, AS ON THE PHONE (owner 2026-11-14, test run x3): the Heat Pump / Mini Split page also shows these, set
          under Heating and Cooling because other equipment shares them. */}
      {(system.id === 'heat_pump' || system.id === 'mini_split') && sharedPartsOf(tree, rulesFor(tree), system.id).map(g => (
        <p key={g.system} className="max-w-2xl text-sm text-body"><span className="font-semibold text-ink">Also on the {displayLabel(system.label)} page, from {g.system}:</span> {g.labels.join(' · ')} <span className="text-muted">(set under {g.system})</span></p>
      ))}
    </>
  );
}
