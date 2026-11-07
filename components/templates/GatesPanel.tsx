'use client';

// LIMITATIONS BACK IN CONDITION (owner 2026-11-07, mockup https://claude.ai/artifact/D55cNLEk1gM9B4cHbTtD1q, "Approved on
// both. Build and push"): an item's limitations are its own reasons, inside Condition (ItemLimitations); a system keeps a
// Limitations row only for its ACCESS situations (PartLimitations); groups have none; utilities are set once
// (UtilitiesPanel). What follows is the history.
// LIMITATIONS AT EVERY LEVEL (owner 2026-11-07, mockup https://claude.ai/artifact/CgiHJ5LqFQb4hAFSrAr3ox, "approved"): the
// first row of every system, group and item is Limitations (LimitationsRow), and it opens that part's own screen
// (PartLimitations) — an item's own reasons with the situations that reach it. Before that, the same day:
// LIMITATIONS — inside each system (owner 2026-11-07: "should this be worked into the what inspect area? Below conditions
// section would be limitations?" → mockup https://claude.ai/artifact/FSTfPJUMmjGDVFqiqneD6o → "Approved" → "Build and
// push"). The Limitations step (once Gates; overview mockup W8UhcgEhYqmY2ZBQpgbKbx) left the builder: a system's screen
// lists, under its groups, every situation that changes ITS checklist — when the inspector records it, what happens on the
// checklist, what the report says — and a tap edits it in place. A utility (Water / Gas / Power off) shows in every system
// it reaches and is ONE gate, so a change there is a change everywhere. Review & Publish lists them all once.
//
// GATES (owner 2026-11-03, mockup https://claude.ai/artifact/86agi7ZeNTRjWiGuACkT4Y): a gate (an access or method row, or
// a utility being on), its reasons, and for each reason REMOVE (the listed items fall off the count; the report names
// them and why) or QUALIFY (the items stay; their ratings carry a phrase) or nothing. Ledrix ships Crawlspace, Attic, Roof
// method, the panel's dead front and the three utilities; a company changes them per template ("Reset to Ledrix" puts
// one back) and adds its own. Saved as the template's `gates` (templateOps TEMPLATE_FIELDS.gates); each new inspection
// keeps the gates it started with.
import { useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { gateNodes, type Gate, type GateEffect, type GateReason } from '@/lib/scope/core/taxonomy/gates';
import { LEDRIX_GATES, accessGatesOfPart, gateReachesPart, gatesOfPart, isRemoved, limitRows, ownGates, parentIndex, partLimitSummary, sayReason, systemIndex, systemsOfGate, templateGates, type GateEntry } from '@/lib/templates/limitationModel';
import { ops } from '@/lib/templates/editorModel';
import { ChipList, Pill, btn, field, label } from './ui';
import { displayLabel } from './systemLabel';

function walk(systems: readonly TemplateNode[], f: (n: TemplateNode, path: string[]) => void, path: string[] = []) {
  for (const n of systems) { f(n, path); walk(n.children ?? [], f, [...path, n.label]); }
}
function find(systems: readonly TemplateNode[], id: string): { node: TemplateNode; path: string[] } | null {
  let out: { node: TemplateNode; path: string[] } | null = null;
  walk(systems, (n, path) => { if (!out && n.id === id) out = { node: n, path }; });
  return out;
}
const pathOf = (systems: readonly TemplateNode[], id: string | undefined) => {
  if (!id) return '—';
  const f = find(systems, id);
  return f ? [...f.path, f.node.label].map(displayLabel).join(' › ') : id;
};
const plural = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

/** Every edit a gate takes, all written through `onOps` as the template's `gates` field. */
function useGates(tree: InspectionTemplate, onOps: (o: TemplateOp[]) => boolean) {
  const own = useMemo(() => ownGates(tree), [tree]);
  const gates = useMemo(() => templateGates(tree), [tree]);
  const systems = tree.systems ?? [];
  const ledrixOf = (id: string) => LEDRIX_GATES.find(g => g.id === id) ?? null;
  const overridden = (id: string) => own.some(e => e.id === id);
  const save = (next: GateEntry[]) => onOps([{ op: 'setTemplateField', field: 'gates', value: next.length ? next : null } as TemplateOp]);
  const put = (g: Gate) => { const rest = own.filter(e => e.id !== g.id); return save([...rest, g]); };
  const reset = (id: string) => save(own.filter(e => e.id !== id));
  const turnOff = (id: string) => { const rest = own.filter(e => e.id !== id); return save(ledrixOf(id) ? [...rest, { id, removed: true }] : rest); };
  const setReason = (g: Gate, i: number, patch: Partial<GateReason>) => {
    const reasons = g.reasons.map((r, k) => (k === i ? { ...r, ...patch } : r));
    if (patch.effect === 'qualify' && !reasons[i].phrase) reasons[i] = { ...reasons[i], phrase: `as ${reasons[i].value.toLowerCase()}` };
    put({ ...g, reasons });
  };
  // Tap an item to keep it in (struck through = stays on the checklist): the gate turns its area into an explicit list.
  const covered = (g: Gate) => [...gateNodes(g, systems as never)].map(id => find(systems, id)?.node).filter((n): n is TemplateNode => !!n && !(n.children ?? []).length);
  const areaLeaves = (g: Gate) => { const all = new Set<string>(); for (const a of g.area ?? []) { const f = find(systems, a); if (f) walk([f.node], n => { if (!(n.children ?? []).length && n.id !== g.row) all.add(n.id); }); } for (const i of g.items ?? []) all.add(i.node); return [...all]; };
  const toggleItem = (g: Gate, id: string) => {
    const now = new Set(covered(g).map(n => n.id));
    if (now.has(id)) now.delete(id); else now.add(id);
    const keepWhen = new Map((g.items ?? []).map(i => [i.node, i.when] as const));
    put({ ...g, area: g.area, items: [...now].map(node => (keepWhen.get(node) ? { node, when: keepWhen.get(node)! } : { node })) });
  };
  return { own, gates, systems, ledrixOf, overridden, save, put, reset, turnOff, setReason, covered, areaLeaves, toggleItem };
}

/** THE LIMITATIONS ROW (owner 2026-11-07, mockup CgiHJ5LqFQb4hAFSrAr3ox): the first row of every system, group and item —
 *  styled like the rows under it, with what can limit this part and a count. Tap = that part's Limitations screen. */
export function LimitationsRow({ tree, part, onOpen }: { tree: InspectionTemplate; part: TemplateNode; onOpen: () => void }) {
  const { count, line } = useMemo(() => partLimitSummary(templateGates(tree), tree.systems ?? [], part), [tree, part]);
  return (
    <button onClick={onOpen} aria-label={`Limitations for ${part.label}`}
      className="flex w-full items-center gap-2 bg-ground/60 py-2.5 pl-3 pr-3 text-left hover:bg-accent/10">
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">Limitations</span>
        <span className="block truncate text-xs text-muted">{line}</span></span>
      <span className={`rounded-full px-2 py-0.5 font-mono text-xs ${count ? 'bg-amber-600/15 text-amber-700 dark:text-amber-300' : 'bg-ground text-body'}`}>{count}</span>
      <span aria-hidden className="text-muted">›</span>
    </button>
  );
}

/** The situations listed on a screen, each edited in place under its rows. `inPart` limits the items shown. */
function GateList({ G, gates, inPart, where, count, disabled, empty }: {
  G: ReturnType<typeof useGates>; gates: Gate[]; inPart: (id: string) => boolean; where: (g: Gate) => string; count: (g: Gate) => number; disabled: boolean; empty: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!gates.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="space-y-2">
      {gates.map(g => {
        const isOpen = open === g.id;
        const n = count(g);
        const w = where(g);
        return (
          <div key={g.id} className="overflow-hidden rounded-xl border border-hairline">
            {limitRows(g).map(row => (
              <button key={row.reasons.map(r => r.value).join('|')} onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen}
                className="grid w-full gap-1 border-b border-hairline px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-ink/5 md:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1.6fr)] md:items-center md:gap-3">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{g.utility ? `${g.label} off` : row.reasons.map(r => sayReason(r.value)).join(' or ')}</span>
                  {w && <span className="block text-[11px] text-muted">{w}</span>}
                </span>
                <span>{row.effect === 'remove' ? <Pill tone="warn">Skipped</Pill> : row.effect === 'qualify' ? <Pill tone="accent">Still rated</Pill> : <Pill>Rated as seen</Pill>}</span>
                <span className="text-xs text-body">{row.effect === 'remove'
                  ? `${plural(n)} don’t count as missed. Report: ${g.utility ? `“Not tested — ${g.label.toLowerCase()} off” for each.` : `“${g.label} — not inspected:” and the reason.`}`
                  : row.effect === 'qualify' ? `Each rating ends “(${row.reasons[0].phrase ?? ''})”.` : 'Nothing extra.'}</span>
              </button>
            ))}
            {isOpen && <GateEditor G={G} gate={g} inPart={inPart} disabled={disabled} onGone={() => setOpen(null)} />}
          </div>
        );
      })}
    </div>
  );
}

/** A SYSTEM's Limitations screen (2026-11-07, limitations back in Condition): only its ACCESS situations — the roof method,
 *  attic, crawlspace, the panel cover, or one the company added — each edited in place with this system's items. Utilities
 *  are in Utilities; an item's own reasons are in its Condition. "+ Add a limitation" offers rows inside this system. */
export function PartLimitations({ tree, part, onOps, disabled }: {
  tree: InspectionTemplate; part: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const G = useGates(tree, onOps);
  const { systems, gates } = G;
  const parents = useMemo(() => parentIndex(systems), [systems]);
  const inPart = (id: string) => { for (let p: string | undefined = id, n = 0; p && n < 50; p = parents.get(p), n++) if (p === part.id) return true; return false; };
  const mine = useMemo(() => accessGatesOfPart(gates, systems, part.id), [gates, systems, part.id]);
  const [adding, setAdding] = useState(false);
  // Ledrix's access situations this template turned off, that would reach this part.
  const offHere = G.own.filter(isRemoved).filter(e => { const l = G.ledrixOf(e.id); return !!l && !l.utility && gateReachesPart(l, part.id, parents); });
  // "+ Add a limitation": a row in THIS part with limitation reasons or a method, not already a gate's row.
  const candidates = useMemo(() => {
    const out: { node: TemplateNode; parent: TemplateNode | null; path: string }[] = [];
    const visit = (ns: readonly TemplateNode[], parent: TemplateNode | null) => ns.forEach(n => {
      if ((n.limitations?.length || n.method?.length) && !gates.some(g => g.row === n.id)) out.push({ node: n, parent, path: pathOf(systems, n.id) });
      visit(n.children ?? [], n);
    });
    const parentNode = (() => { const pid = parents.get(part.id); return pid ? find(systems, pid)?.node ?? null : null; })();
    visit([part], parentNode);
    return out;
  }, [part, systems, gates, parents]);
  const addGate = (c: { node: TemplateNode; parent: TemplateNode | null }) => {
    const g: Gate = { id: `company_${c.node.id}`, label: displayLabel(c.parent?.label ?? c.node.label), row: c.node.id, origin: 'company',
      ...(c.parent ? { area: [c.parent.id] } : {}),
      reasons: [...(c.node.limitations ?? []).map(v => ({ value: v, effect: 'remove' as GateEffect })),
        ...(c.node.method ?? []).map(v => ({ value: v, effect: 'none' as GateEffect }))] };
    if (G.put(g)) setAdding(false);
  };
  return (
    <div className="space-y-4 px-4 py-4">
      <p className="text-xs text-muted">When the inspector can’t get to or onto {displayLabel(part.label)}: what the checklist and the report do. Ledrix’s are set already; tap one to change it.</p>
      <div>
        <p className={label}>Access{mine.length ? ` · ${mine.length}` : ''}</p>
        <GateList G={G} gates={mine} inPart={inPart} disabled={disabled} count={g => G.covered(g).filter(n => inPart(n.id)).length}
          where={g => (g.row ? `Recorded on ${pathOf(systems, g.row)}` : '')} empty={`Nothing limits access to ${displayLabel(part.label)} — every item is rated as seen.`} />
      </div>
      {offHere.length > 0 && <p className="text-xs text-muted">Turned off for this template: {offHere.map(e => G.ledrixOf(e.id)?.label ?? e.id).join(', ')}{' '}
        <button className={btn.ghost} disabled={disabled} onClick={() => G.save(G.own.filter(e => !offHere.some(o => o.id === e.id && isRemoved(e))))}>Turn back on</button></p>}
      <div>
        <button className={btn.ghost} disabled={disabled} onClick={() => setAdding(a => !a)}>+ Add a limitation</button>
        {adding && (
          <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-hairline">
            {candidates.map(c => <li key={c.node.id}><button className="w-full px-3 py-1.5 text-left text-xs text-body hover:bg-ink/5" onClick={() => addGate(c)}>{c.path}</button></li>)}
            {!candidates.length && <li className="px-3 py-1.5 text-xs text-muted">No row in {displayLabel(part.label)} has limitation reasons or a method yet.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

/** UTILITIES (2026-11-07): Water, Gas and Power, set once for every system they reach — opened from the Utilities row at
 *  the top of the systems list. Each edits in place with all its items. */
export function UtilitiesPanel({ tree, onOps, disabled }: { tree: InspectionTemplate; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const G = useGates(tree, onOps);
  const { systems } = G;
  const idx = useMemo(() => systemIndex(systems), [systems]);
  const utils = G.gates.filter(g => g.utility);
  const offHere = G.own.filter(isRemoved).filter(e => !!G.ledrixOf(e.id)?.utility);
  const sysName = (id: string) => displayLabel(systems.find(s => s.id === id)?.label ?? id);
  return (
    <div className="space-y-4 px-4 py-4">
      <p className="text-xs text-muted">When the inspector records a utility as off, the items that need it are skipped and named in the report. One setting for every system it reaches.</p>
      <GateList G={G} gates={utils} inPart={() => true} disabled={disabled} count={g => G.covered(g).length}
        where={g => { const s = systemsOfGate(g, systems, idx); return s.length ? `Reaches ${s.map(sysName).join(', ')}` : ''; }}
        empty="No utilities — Ledrix’s are turned off for this template." />
      {offHere.length > 0 && <p className="text-xs text-muted">Turned off for this template: {offHere.map(e => G.ledrixOf(e.id)?.label ?? e.id).join(', ')}{' '}
        <button className={btn.ghost} disabled={disabled} onClick={() => G.save(G.own.filter(e => !offHere.some(o => o.id === e.id && isRemoved(e))))}>Turn back on</button></p>}
    </div>
  );
}

/** An ITEM's limitations, inside its Condition (2026-11-07): the reasons the inspector can pick when they rate it
 *  Limitation, its company switch (TPR) when it has one, and — read only — what skips or qualifies it automatically, each
 *  opening where it is set. */
export function ItemLimitations({ tree, part, onOps, disabled, policy, onOpenSystem, onOpenUtilities }: {
  tree: InspectionTemplate; part: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
  policy?: React.ReactNode; onOpenSystem: (systemId: string) => void; onOpenUtilities: () => void;
}) {
  const systems = tree.systems ?? [];
  const auto = useMemo(() => gatesOfPart(templateGates(tree), systems, part.id), [tree, systems, part.id]);
  const idx = useMemo(() => systemIndex(systems), [systems]);
  return (
    <div className="space-y-4 px-4 py-4">
      <div>
        <p className={label}>Reasons the inspector can pick</p>
        <ChipList values={part.limitations ?? []} disabled={disabled} addLabel="Add a reason" placeholder="e.g. Not visible — behind appliance"
          onChange={v => onOps(ops.limitations(part.id, v))} />
        <p className="mt-1 text-[11px] text-muted">Shown when the inspector rates {part.label} “Limitation”. It’s named as not inspected, with the reason, and doesn’t count as missed.</p>
      </div>
      {policy}
      {auto.length > 0 && (
        <div>
          <p className={label}>Also limited automatically</p>
          <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            {auto.map(g => {
              const sys = systemsOfGate(g, systems, idx)[0];
              const rows = limitRows(g).filter(r => r.limits);
              return (
                <li key={g.id}><button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink/5" onClick={() => (g.utility ? onOpenUtilities() : sys && onOpenSystem(sys))}>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{g.utility ? `${g.label} is off` : `${g.label}: ${rows.flatMap(r => r.reasons.map(x => sayReason(x.value))).join(', ')}`}</span>
                    <span className="block truncate text-xs text-muted">{g.utility ? 'Set once in Utilities' : `Set on ${pathOf(systems, sys)}`}</span></span>
                  <span aria-hidden className="text-muted">›</span></button></li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One gate, edited in place under its rows. Items are shown for THIS part (a gate may reach others too). */
function GateEditor({ G, gate: current, inPart, disabled, onGone }: {
  G: ReturnType<typeof useGates>; gate: Gate; inPart: (id: string) => boolean; disabled: boolean; onGone: () => void;
}) {
  const { systems } = G;
  return (
    <div aria-label={`Edit ${current.label}`} className="bg-ground px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {current.origin === 'company' ? <Pill tone="accent">This company</Pill> : G.overridden(current.id) ? <Pill tone="warn">Changed from Ledrix</Pill> : <Pill>Ledrix</Pill>}
        <span className="text-xs text-muted">Recorded on {current.row ? pathOf(systems, current.row) : `${current.label} — on at this visit`}</span>
        <span className="flex-1" />
        {current.origin !== 'company' && G.overridden(current.id) && <button className={btn.secondary} disabled={disabled} onClick={() => G.reset(current.id)}>Reset to Ledrix</button>}
        <button className={btn.ghost} disabled={disabled} onClick={() => { if (G.turnOff(current.id)) onGone(); }}>{current.origin === 'company' ? 'Delete' : 'Turn off for this template'}</button>
      </div>
      <label className="mt-3 block max-w-sm"><span className={label}>Report label</span>
        <input className={field} defaultValue={current.label} disabled={disabled} onBlur={e => { const v = e.target.value.trim(); if (v && v !== current.label) G.put({ ...current, label: v }); }} /></label>
      <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-surface">
        <div className="hidden grid-cols-[170px_220px_minmax(0,1fr)] gap-3 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted md:grid"><span>When the inspector records</span><span>On the checklist</span><span>In the report</span></div>
        {current.reasons.map((r, i) => (
          <div key={`${r.value}-${i}`} className="grid gap-2 border-t border-hairline px-3 py-2.5 text-sm md:grid-cols-[170px_220px_minmax(0,1fr)] md:items-center md:gap-3">
            <span className="text-ink">{r.value === '*limitation' ? <>Any limitation <span className="text-xs text-muted">(its reason is the cause)</span></> : r.value}</span>
            <span role="radiogroup" aria-label={`Effect of ${r.value}`} className="inline-flex w-max overflow-hidden rounded-lg border border-hairline text-xs">
              {(['remove', 'qualify', 'none'] as GateEffect[]).map(eff => (
                <button key={eff} role="radio" aria-checked={r.effect === eff} disabled={disabled} onClick={() => G.setReason(current, i, { effect: eff })}
                  className={`px-2.5 py-1 font-semibold ${r.effect === eff ? (eff === 'remove' ? 'bg-safety/15 text-safety' : eff === 'qualify' ? 'bg-amber-600/15 text-amber-700 dark:text-amber-300' : 'bg-ink/10 text-ink') : 'text-body hover:bg-ink/5'}`}>
                  {eff === 'remove' ? 'Skipped' : eff === 'qualify' ? 'Still rated' : 'Rated as seen'}
                </button>
              ))}
            </span>
            {r.effect === 'qualify'
              ? <input className={`${field} font-mono text-xs`} defaultValue={r.phrase ?? ''} disabled={disabled} aria-label={`Phrase for ${r.value}`}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.phrase) G.setReason(current, i, { phrase: v }); }} />
              : <span className="text-xs text-muted">{r.effect === 'remove' ? `Named as not ${current.utility ? 'tested' : 'inspected'}, with the reason. The items below don’t count as missed.` : 'Nothing extra.'}</span>}
          </div>
        ))}
      </div>
      {current.reasons.some(r => r.effect === 'remove') && (
        <div className="mt-3">
          <p className={label}>Items skipped here</p>
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              const inNow = new Set(G.covered(current).map(n => n.id));
              const all = current.utility ? [...inNow, ...(G.ledrixOf(current.id)?.items ?? []).map(i => i.node).filter(id => !inNow.has(id))] : G.areaLeaves(current);
              return [...new Set(all)].filter(id => inPart(id)).map(id => {
                const n = find(systems, id)?.node;
                if (!n) return null;
                const on = inNow.has(id);
                return <button key={id} disabled={disabled} onClick={() => G.toggleItem(current, id)} aria-pressed={on}
                  className={`rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-xs ${on ? 'text-ink' : 'text-muted line-through opacity-60'}`}>{displayLabel(n.label)}</button>;
              });
            })()}
          </div>
          <p className="mt-2 text-xs text-muted">Tap an item to keep it in (struck through = stays on the checklist).{current.utility ? ' This utility is one setting for every system it reaches. It only removes an item that is present for the job’s answers — gas off never removes an electric water heater’s operation.' : ''}</p>
        </div>
      )}
    </div>
  );
}

/** Review & Publish: every limitation once, with the systems it reaches; Open goes to the first one. */
export function LimitationsList({ tree, onOpen }: { tree: InspectionTemplate; onOpen: (systemId: string, utilities: boolean) => void }) {
  // Open = that system's Limitations screen, or Utilities for a utility (2026-11-07).
  const gates = templateGates(tree);
  const systems = tree.systems ?? [];
  const idx = systemIndex(systems);
  const sysName = (id: string) => displayLabel(systems.find(s => s.id === id)?.label ?? id);
  const rows = gates.flatMap(g => limitRows(g).filter(r => r.limits).map(r => ({ g, r, in: systemsOfGate(g, systems, idx) })));
  return (
    <section aria-label="All limitations" className="rounded-xl border border-hairline bg-surface">
      <div className="border-b border-hairline px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Limitations</h3>
        <p className="text-xs text-muted">Access limitations are set on their system’s Limitations row; utilities in Utilities, at the top of the systems list. An item’s own reasons are in its Condition.</p>
      </div>
      {!rows.length ? <p className="px-4 py-3 text-sm text-muted">No limitations — Ledrix’s are turned off for this template.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-4 py-2 font-semibold">When the inspector records…</th><th className="pr-3 font-semibold">On the checklist</th><th className="pr-3 font-semibold">Systems</th><th /></tr></thead>
            <tbody className="divide-y divide-hairline">
              {rows.map(({ g, r, in: ins }) => (
                <tr key={`${g.id}-${r.reasons.map(x => x.value).join('|')}`} className="align-top">
                  <td className="px-4 py-2.5 font-semibold text-ink">{g.label}: {r.reasons.map(x => sayReason(x.value)).join(' or ')}</td>
                  <td className="py-2.5 pr-3">{r.effect === 'remove' ? <Pill tone="warn">Skipped</Pill> : <Pill tone="accent">Still rated</Pill>}</td>
                  <td className="py-2.5 pr-3 text-body">{ins.map(sysName).join(' · ') || '—'}</td>
                  <td className="py-2.5 pr-4">{ins[0] && <button className={btn.ghost + ' text-xs'} onClick={() => onOpen(ins[0], !!g.utility)}>Open</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
