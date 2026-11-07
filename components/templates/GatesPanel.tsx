'use client';

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
import { LEDRIX_GATES, gatesOfSystem, isRemoved, limitRows, ownGates, sayReason, systemIndex, systemsOfGate, templateGates, type GateEntry } from '@/lib/templates/limitationModel';
import { Pill, btn, field, label } from './ui';
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

/** A system's Limitations section, under its groups. */
export function SystemLimitations({ tree, system, onOps, disabled }: { tree: InspectionTemplate; system: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const G = useGates(tree, onOps);
  const { systems, gates } = G;
  const idx = useMemo(() => systemIndex(systems), [systems]);
  const mine = useMemo(() => gatesOfSystem(gates, systems, system.id), [gates, systems, system.id]);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const here = (g: Gate) => G.covered(g).filter(n => idx.get(n.id) === system.id).length;
  const count = mine.reduce((a, g) => a + limitRows(g).filter(r => r.limits).length, 0);
  const sysName = (id: string) => displayLabel(systems.find(s => s.id === id)?.label ?? id);
  // Ledrix's gates this template turned off, that would reach this system.
  const offHere = G.own.filter(isRemoved).filter(e => { const l = G.ledrixOf(e.id); return !!l && systemsOfGate(l, systems, idx).includes(system.id); });
  // "+ Add a limitation": a row in THIS system with limitation reasons or a method, not already a gate's row.
  const candidates = useMemo(() => {
    const out: { node: TemplateNode; parent: TemplateNode | null; path: string }[] = [];
    const visit = (ns: readonly TemplateNode[], parent: TemplateNode | null) => ns.forEach(n => {
      if ((n.limitations?.length || n.method?.length) && !gates.some(g => g.row === n.id)) out.push({ node: n, parent, path: pathOf(systems, n.id) });
      visit(n.children ?? [], n);
    });
    visit([system], null);
    return out;
  }, [system, systems, gates]);
  const addGate = (c: { node: TemplateNode; parent: TemplateNode | null }) => {
    const g: Gate = { id: `company_${c.node.id}`, label: displayLabel(c.parent?.label ?? c.node.label), row: c.node.id, origin: 'company',
      ...(c.parent ? { area: [c.parent.id] } : {}),
      reasons: [...(c.node.limitations ?? []).map(v => ({ value: v, effect: 'remove' as GateEffect })),
        ...(c.node.method ?? []).map(v => ({ value: v, effect: 'none' as GateEffect }))] };
    if (G.put(g)) { setOpen(g.id); setAdding(false); }
  };

  return (
    <section aria-label={`Limitations for ${system.label}`} id="limitations" className="scroll-mt-2 border-t-2 border-hairline px-4 pb-5 pt-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Limitations · {count}</h3>
        <p className="text-xs text-muted">When the inspector can’t fully inspect something here: what the checklist and the report do. Ledrix’s are set already.</p>
      </div>
      {!mine.length && <p className="mt-2 text-sm text-muted">Nothing limits {displayLabel(system.label)} — every item is rated as seen.</p>}
      <div className="mt-2 space-y-2">
        {mine.map(g => {
          const others = systemsOfGate(g, systems, idx).filter(s => s !== system.id);
          const isOpen = open === g.id;
          const n = here(g);
          return (
            <div key={g.id} className="overflow-hidden rounded-xl border border-hairline">
              {limitRows(g).map(row => (
                <button key={row.reasons.map(r => r.value).join('|')} onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen}
                  className="grid w-full gap-1 border-b border-hairline px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-ink/5 md:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1.6fr)] md:items-center md:gap-3">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{g.label}: {row.reasons.map(r => sayReason(r.value)).join(' or ')}</span>
                    {g.utility && others.length > 0 && <span className="block text-[11px] text-muted">Utility · also {others.map(sysName).join(', ')}</span>}
                  </span>
                  <span>{row.effect === 'remove' ? <Pill tone="warn">Skipped</Pill> : row.effect === 'qualify' ? <Pill tone="accent">Still rated</Pill> : <Pill>Rated as seen</Pill>}</span>
                  <span className="text-xs text-body">{row.effect === 'remove'
                    ? `${plural(n)} here don’t count as missed. Report: ${g.utility ? `“Not tested — ${g.label.toLowerCase()} off” for each.` : `“${g.label} — not inspected:” and the reason.`}`
                    : row.effect === 'qualify' ? `Each rating ends “(${row.reasons[0].phrase ?? ''})”.` : 'Nothing extra.'}</span>
                </button>
              ))}
              {isOpen && <GateEditor G={G} gate={g} systemId={system.id} idx={idx} disabled={disabled} onGone={() => setOpen(null)} />}
            </div>
          );
        })}
      </div>
      {offHere.length > 0 && <p className="mt-2 text-xs text-muted">Turned off for this template: {offHere.map(e => G.ledrixOf(e.id)?.label ?? e.id).join(', ')}{' '}
        <button className={btn.ghost} disabled={disabled} onClick={() => G.save(G.own.filter(e => !offHere.some(o => o.id === e.id && isRemoved(e))))}>Turn back on</button></p>}
      <button className={`${btn.ghost} mt-2`} disabled={disabled} onClick={() => setAdding(a => !a)}>+ Add a limitation</button>
      {adding && (
        <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-hairline">
          {candidates.map(c => <li key={c.node.id}><button className="w-full px-3 py-1.5 text-left text-xs text-body hover:bg-ink/5" onClick={() => addGate(c)}>{c.path}</button></li>)}
          {!candidates.length && <li className="px-3 py-1.5 text-xs text-muted">No other row in {displayLabel(system.label)} has limitation reasons or a method.</li>}
        </ul>
      )}
    </section>
  );
}

/** One gate, edited in place under its rows. Items are shown for THIS system (a utility reaches others too). */
function GateEditor({ G, gate: current, systemId, idx, disabled, onGone }: {
  G: ReturnType<typeof useGates>; gate: Gate; systemId: string; idx: Map<string, string>; disabled: boolean; onGone: () => void;
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
              return [...new Set(all)].filter(id => idx.get(id) === systemId).map(id => {
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
export function LimitationsList({ tree, onOpen }: { tree: InspectionTemplate; onOpen: (systemId: string) => void }) {
  const gates = templateGates(tree);
  const systems = tree.systems ?? [];
  const idx = systemIndex(systems);
  const sysName = (id: string) => displayLabel(systems.find(s => s.id === id)?.label ?? id);
  const rows = gates.flatMap(g => limitRows(g).filter(r => r.limits).map(r => ({ g, r, in: systemsOfGate(g, systems, idx) })));
  return (
    <section aria-label="All limitations" className="rounded-xl border border-hairline bg-surface">
      <div className="border-b border-hairline px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Limitations</h3>
        <p className="text-xs text-muted">Each one is set on its system’s screen, under the groups.</p>
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
                  <td className="py-2.5 pr-4">{ins[0] && <button className={btn.ghost + ' text-xs'} onClick={() => onOpen(ins[0])}>Open</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
