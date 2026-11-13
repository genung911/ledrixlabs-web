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
import { gateLine, gateNodes, type Gate, type GateEffect, type GateReason } from '@/lib/scope/core/taxonomy/gates';
import { LEDRIX_GATES, accessGatesOfPart, gateReachesPart, gatesOfPart, isRemoved, limitRows, ownGates, parentIndex, partLimitSummary, sayReason, systemIndex, systemsOfGate, templateGates, type GateEntry } from '@/lib/templates/limitationModel';
import { ops } from '@/lib/templates/editorModel';
import { ChipList, Menu, Pill, btn, field, label } from './ui';
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
      <p className="text-sm text-body">When the inspector can’t get to or onto {displayLabel(part.label)}, Ledrix skips the items it can’t reach and the report says why.</p>
      <div>
        <p className={label}>Access{mine.length ? ` · ${mine.length}` : ''}</p>
        {mine.length ? <div className="space-y-2">{mine.map(g => <GateCard key={g.id} G={G} gate={g} inPart={inPart} disabled={disabled} reaches={g.row ? [`Recorded on ${pathOf(systems, g.row)}`] : []} />)}</div>
          : <p className="text-sm text-muted">Nothing limits access to {displayLabel(part.label)} — every item is rated as seen.</p>}
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
      <p className="text-sm text-body">When the inspector records a utility as off, Ledrix skips the items that need it and the report says why.</p>
      {utils.length ? utils.map(g => <GateCard key={g.id} G={G} gate={g} disabled={disabled} reaches={systemsOfGate(g, systems, idx).map(sysName)} />)
        : <p className="text-sm text-muted">No utilities — Ledrix’s are turned off for this template.</p>}
      {offHere.length > 0 && <p className="text-xs text-muted">Turned off for this template: {offHere.map(e => G.ledrixOf(e.id)?.label ?? e.id).join(', ')}{' '}
        <button className={btn.ghost} disabled={disabled} onClick={() => G.save(G.own.filter(e => !offHere.some(o => o.id === e.id && isRemoved(e))))}>Turn back on</button></p>}
    </div>
  );
}

// UTILITIES, CLEANED UP (owner 2026-11-12: "How can we clean this up to be easier to see what is happening without a wall
// of text"; mockup https://claude.ai/artifact/5ktKnZRzXM25jMS4wVXgQD, "approved"). One card per utility: a one-line summary
// (how many items it skips, which systems); opened, one drop-down per reason, ONE sample report line (gateLine — the
// report's own words), and the items as checkboxes grouped by system (ticked = skipped). Rename, Reset and Turn off live
// in the ⋯ menu. A system's access Limitations keep GateList / GateEditor.
const EFFECT_WORDS: Record<GateEffect, string> = { remove: 'Skip the items', qualify: 'Rate them, with a note', none: 'Rate them normally' };
// LIMITATIONS, THE SAME WAY (owner 2026-11-12: "clean up the Limitations screens the same way"): a system's access
// situations (attic, crawlspace, roof method, panel cover, the company's own) use this card too, showing only that
// system's items (`inPart`); a company's own situation is deleted, a Ledrix one turned off.
function GateCard({ G, gate: g, reaches, disabled, inPart = () => true }: { G: ReturnType<typeof useGates>; gate: Gate; reaches: string[]; disabled: boolean; inPart?: (id: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { systems } = G;
  const inNow = new Set(G.covered(g).map(n => n.id));
  const candidates = g.utility ? [...inNow, ...(G.ledrixOf(g.id)?.items ?? []).map(i => i.node)] : [...inNow, ...G.areaLeaves(g)];
  const all = [...new Set(candidates)].filter(id => inPart(id))
    .map(id => find(systems, id)).filter((f): f is { node: TemplateNode; path: string[] } => !!f && !(f.node.children ?? []).length);
  // Grouped by the system each item sits in, in the template's system order.
  const groups: { system: string; items: TemplateNode[] }[] = [];
  for (const f of all) {
    const sys = displayLabel(f.path[0] ?? f.node.label);
    const grp = groups.find(x => x.system === sys) ?? (groups.push({ system: sys, items: [] }), groups[groups.length - 1]);
    grp.items.push(f.node);
  }
  const skips = g.reasons.some(r => r.effect === 'remove');
  const skipped = all.filter(f => inNow.has(f.node.id)).length;
  const summary = !all.length ? 'Nothing to skip in this template yet' : skips ? `Skips ${skipped} of ${all.length} item${all.length === 1 ? '' : 's'}` : 'Items stay on the checklist';
  const sample = g.reasons.find(r => r.effect !== 'none');
  const sampleLabels = all.filter(f => inNow.has(f.node.id)).slice(0, 3).map(f => displayLabel(f.node.label));
  const changed = G.overridden(g.id);
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{g.utility ? `${g.label} off` : g.label}</span>
            <span className="block truncate text-xs text-muted">{summary}{reaches.length ? ` · ${reaches.join(', ')}` : ''}</span>
          </span>
          {g.origin === 'company' ? <Pill tone="accent">This company</Pill> : changed ? <Pill tone="warn">Changed</Pill> : <span className="text-[11px] text-muted">Ledrix</span>}
          <span aria-hidden className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        </button>
        <Menu label={`More for ${g.label}`} items={[
          { label: 'Rename in the report', onSelect: () => { setOpen(true); setRenaming(true); }, disabled: disabled && 'The draft can’t change right now.' },
          ...(g.origin === 'company' ? [] : [{ label: 'Reset to Ledrix', onSelect: () => { G.reset(g.id); }, disabled: (disabled && 'The draft can’t change right now.') || (!changed && 'It is Ledrix’s already.') }]),
          { label: g.origin === 'company' ? 'Delete' : 'Turn off for this template', onSelect: () => { G.turnOff(g.id); }, disabled: disabled && 'The draft can’t change right now.', danger: true },
        ]} />
      </div>
      {open && (
        <div className="space-y-4 border-t border-hairline px-3 py-3">
          {renaming && (
            <label className="block max-w-sm"><span className={label}>Called in the report</span>
              <input className={field} autoFocus defaultValue={g.label} disabled={disabled}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== g.label) G.put({ ...g, label: v }); setRenaming(false); }} /></label>
          )}
          <div className="space-y-2">
            <p className={label}>When the inspector records</p>
            {g.reasons.map((r, i) => (
              <div key={`${r.value}-${i}`} className="flex flex-wrap items-center gap-3">
                <span className="w-40 text-sm font-semibold text-ink">{r.value === '*limitation' ? 'Any limitation' : sayReason(r.value)}</span>
                <select className={`${field} w-auto`} value={r.effect} disabled={disabled} aria-label={`When ${r.value}`}
                  onChange={e => G.setReason(g, i, { effect: e.target.value as GateEffect })}>
                  {(['remove', 'qualify', 'none'] as GateEffect[]).map(eff => <option key={eff} value={eff}>{EFFECT_WORDS[eff]}</option>)}
                </select>
                {r.effect === 'qualify' && (
                  <input className={`${field} w-56`} defaultValue={r.phrase ?? ''} disabled={disabled} aria-label={`Note for ${r.value}`} key={`${r.value}-${r.phrase ?? ''}`}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.phrase) G.setReason(g, i, { phrase: v }); }} />
                )}
              </div>
            ))}
          </div>
          {sample && (
            <div className="flex flex-wrap items-baseline gap-2 rounded-lg border border-hairline bg-ground px-3 py-2">
              <span className={`${label} mb-0`}>In the report</span>
              <span className="text-sm text-ink">{gateLine({ gate: g, reason: sample, cause: sample.value }, sample.effect === 'remove' ? (sampleLabels.length < skipped ? [...sampleLabels, '…'] : sampleLabels) : [])}</span>
            </div>
          )}
          {skips && all.length > 0 && (
            <div>
              <p className={label}>Items it skips <span className="ml-1 font-normal normal-case tracking-normal">· untick one to keep it on the checklist</span></p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {groups.map(grp => (
                  <fieldset key={grp.system} className="min-w-0 space-y-1.5">
                    <legend className="mb-1 text-[13px] font-semibold text-ink">{grp.system} <span className="font-normal text-muted">{grp.items.filter(n => inNow.has(n.id)).length} of {grp.items.length}</span></legend>
                    {grp.items.map(n => (
                      <label key={n.id} className={`flex items-center gap-2 text-[13px] ${inNow.has(n.id) ? 'text-ink' : 'text-muted'}`}>
                        <input type="checkbox" checked={inNow.has(n.id)} disabled={disabled} onChange={() => G.toggleItem(g, n.id)} />
                        <span className="min-w-0">{displayLabel(n.label)}{inNow.has(n.id) ? '' : ' · kept'}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
              {g.utility && <p className="mt-2 text-xs text-muted">Only what the job has: gas off never skips an electric water heater.</p>}
            </div>
          )}
        </div>
      )}
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
