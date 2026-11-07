'use client';

// LIMITATIONS — the step once called Gates (renamed 2026-11-06, owner; overview: mockup W8UhcgEhYqmY2ZBQpgbKbx). GATES (owner
// 2026-11-03: mockup "Gate rules" approved — https://claude.ai/artifact/86agi7ZeNTRjWiGuACkT4Y).
// One rule in the checklist itself: a gate (an access or method row, or a utility being on), its reasons, and for each
// reason REMOVE (the listed items fall off the count; the report names them and why) or QUALIFY (the items stay; their
// ratings carry a phrase) or nothing. Ledrix ships Crawlspace, Attic, Roof method, the panel's dead front and the three
// utilities; a company changes them per template ("Reset to Ledrix" puts one back) and adds its own. Saved as the
// template's `gates` (templateOps TEMPLATE_FIELDS.gates); each new inspection keeps the gates it started with.
import { useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { effectiveGates, gateNodes, type Gate, type GateEffect, type GateReason } from '@/lib/scope/core/taxonomy/gates';
import ledrixPack from '@/lib/scope/core/taxonomy/ledrix.core.json';
import { Banner, Pill, btn, field, label } from './ui';
import { displayLabel } from './systemLabel';

const LEDRIX: Gate[] = ((ledrixPack as { gates?: Gate[] }).gates ?? []);
type Entry = Gate | { id: string; removed: true };
const isRemoved = (e: Entry | undefined): e is { id: string; removed: true } => !!e && (e as { removed?: boolean }).removed === true;

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

export function GatesPanel({ tree, onOps, disabled }: { tree: InspectionTemplate; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const own: Entry[] = useMemo(() => (Array.isArray((tree as { gates?: unknown }).gates) ? (tree as unknown as { gates: Entry[] }).gates : []), [tree]);
  const gates = useMemo(() => effectiveGates(LEDRIX, own), [own]);
  const systems = tree.systems ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // No gate picked = the overview (owner 2026-11-06: "the what happens seems vague or confusing").
  const current = sel ? gates.find(g => g.id === sel) ?? null : null;
  const ledrixOf = (id: string) => LEDRIX.find(g => g.id === id) ?? null;
  const overridden = (id: string) => own.some(e => e.id === id);

  const save = (next: Entry[]) => onOps([{ op: 'setTemplateField', field: 'gates', value: next.length ? next : null } as TemplateOp]);
  const put = (g: Gate) => { const rest = own.filter(e => e.id !== g.id); save([...rest, g]); };
  const reset = (id: string) => save(own.filter(e => e.id !== id));
  const turnOff = (id: string) => { const rest = own.filter(e => e.id !== id); save(ledrixOf(id) ? [...rest, { id, removed: true }] : rest); };

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

  // "+ Add a gate": a row with limitation reasons or a method — its reasons start as REMOVE (limitations) / QUALIFY (methods).
  const candidates = useMemo(() => {
    const out: { node: TemplateNode; parent: TemplateNode | null; path: string }[] = [];
    const visit = (ns: readonly TemplateNode[], parent: TemplateNode | null) => ns.forEach(n => {
      if ((n.limitations?.length || n.method?.length) && !gates.some(g => g.row === n.id)) out.push({ node: n, parent, path: pathOf(systems, n.id) });
      visit(n.children ?? [], n);
    });
    visit(systems, null);
    return out;
  }, [systems, gates]);
  const addGate = (c: { node: TemplateNode; parent: TemplateNode | null }) => {
    const g: Gate = { id: `company_${c.node.id}`, label: displayLabel(c.parent?.label ?? c.node.label), row: c.node.id, origin: 'company',
      ...(c.parent ? { area: [c.parent.id] } : {}),
      reasons: [...(c.node.limitations ?? []).map(v => ({ value: v, effect: 'remove' as GateEffect })),
        ...(c.node.method ?? []).map(v => ({ value: v, effect: 'none' as GateEffect }))] };
    put(g); setSel(g.id); setAdding(false);
  };

  const group = (title: string, list: Gate[]) => list.length ? (
    <>
      <p className="px-2.5 pb-1 pt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</p>
      {list.map(g => (
        <button key={g.id} onClick={() => setSel(g.id)} aria-current={current?.id === g.id ? 'true' : undefined}
          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${current?.id === g.id ? 'bg-accent/15 font-semibold text-accent-ink' : 'text-body hover:bg-ink/5'}`}>
          <span className="truncate">{g.row ? pathOf(systems, g.row).split(' › ').slice(-1)[0] : g.label}</span>
          <span className="font-mono text-[10.5px] text-muted">{g.reasons.filter(r => r.effect !== 'none').length}</span>
        </button>
      ))}
    </>
  ) : null;
  const off = own.filter(isRemoved);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">Limitations</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-body">When the inspector can’t fully inspect something — no access, viewed from the ground, the water off — what happens to the checklist and what the report says. Ledrix’s are set already; change one only if your company works differently. Each inspection keeps the ones it started with.</p>
      </div>
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-hairline bg-surface lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Gates" className="overflow-y-auto border-b border-hairline p-2 lg:border-b-0 lg:border-r">
          <button onClick={() => setSel(null)} aria-current={!current ? 'true' : undefined}
            className={`flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[13px] ${!current ? 'bg-accent/15 font-semibold text-accent-ink' : 'text-body hover:bg-ink/5'}`}>All situations</button>
          {group('Areas', gates.filter(g => g.row && g.origin !== 'company'))}
          {group('Utilities', gates.filter(g => g.utility))}
          {group('This company', gates.filter(g => g.origin === 'company'))}
          {off.length > 0 && <p className="px-2.5 pt-3 text-xs text-muted">Off for this template: {off.map(e => ledrixOf(e.id)?.label ?? e.id).join(', ')} <button className={btn.ghost} disabled={disabled} onClick={() => save(own.filter(e => !isRemoved(e)))}>Turn back on</button></p>}
          <button className={`${btn.ghost} mt-2`} disabled={disabled} onClick={() => setAdding(a => !a)}>+ Add a situation</button>
          {adding && (
            <ul className="mt-1 max-h-64 overflow-y-auto">
              {candidates.map(c => <li key={c.node.id}><button className="w-full rounded px-2.5 py-1.5 text-left text-xs text-body hover:bg-ink/5" onClick={() => addGate(c)}>{c.path}</button></li>)}
              {!candidates.length && <li className="px-2.5 py-1.5 text-xs text-muted">No other row has limitation reasons or a method.</li>}
            </ul>
          )}
        </nav>
        {current ? (
          <section aria-label={`Gate: ${current.label}`} className="min-w-0 overflow-y-auto p-4 lg:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">{current.label}</h3>
              {current.origin === 'company' ? <Pill tone="accent">This company</Pill> : overridden(current.id) ? <Pill tone="warn">Changed from Ledrix</Pill> : <Pill>Ledrix</Pill>}
              <span className="flex-1" />
              {current.origin !== 'company' && overridden(current.id) && <button className={btn.secondary} disabled={disabled} onClick={() => reset(current.id)}>Reset to Ledrix</button>}
              <button className={btn.ghost} disabled={disabled} onClick={() => turnOff(current.id)}>{current.origin === 'company' ? 'Delete' : 'Turn off for this template'}</button>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
              <dt className={label}>Recorded on</dt><dd className="text-ink">{current.row ? pathOf(systems, current.row) : `${current.label} — on at this visit`}</dd>
              <dt className={label}>Area it controls</dt><dd className="text-ink">{current.area?.length ? current.area.map(a => pathOf(systems, a)).join(' · ') : 'The items listed below'}</dd>
              <dt className={label}>Report label</dt>
              <dd><input className={field} defaultValue={current.label} disabled={disabled} onBlur={e => { const v = e.target.value.trim(); if (v && v !== current.label) put({ ...current, label: v }); }} /></dd>
            </dl>
            <div className="mt-4 overflow-hidden rounded-xl border border-hairline">
              <div className="hidden grid-cols-[170px_200px_minmax(0,1fr)] gap-3 bg-ground px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted md:grid"><span>When the inspector records</span><span>On the checklist</span><span>In the report</span></div>
              {current.reasons.map((r, i) => (
                <div key={`${r.value}-${i}`} className="grid gap-2 border-t border-hairline px-3 py-2.5 text-sm md:grid-cols-[170px_200px_minmax(0,1fr)] md:items-center md:gap-3">
                  <span className="text-ink">{r.value === '*limitation' ? <>Any limitation <span className="text-xs text-muted">(its reason is the cause)</span></> : r.value}</span>
                  <span role="radiogroup" aria-label={`Effect of ${r.value}`} className="inline-flex w-max overflow-hidden rounded-lg border border-hairline text-xs">
                    {(['remove', 'qualify', 'none'] as GateEffect[]).map(eff => (
                      <button key={eff} role="radio" aria-checked={r.effect === eff} disabled={disabled} onClick={() => setReason(current, i, { effect: eff })}
                        className={`px-2.5 py-1 font-semibold ${r.effect === eff ? (eff === 'remove' ? 'bg-safety/15 text-safety' : eff === 'qualify' ? 'bg-amber-600/15 text-amber-700 dark:text-amber-300' : 'bg-ink/10 text-ink') : 'text-body hover:bg-ink/5'}`}>
                        {eff === 'remove' ? 'Skipped' : eff === 'qualify' ? 'Still rated' : 'Rated as seen'}
                      </button>
                    ))}
                  </span>
                  {r.effect === 'qualify'
                    ? <input className={`${field} font-mono text-xs`} defaultValue={r.phrase ?? ''} disabled={disabled} aria-label={`Phrase for ${r.value}`}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.phrase) setReason(current, i, { phrase: v }); }} />
                    : <span className="text-xs text-muted">{r.effect === 'remove' ? `Named as not ${current.utility ? 'tested' : 'inspected'}, with the reason. The items below don’t count as missed.` : 'Nothing extra.'}</span>}
                </div>
              ))}
            </div>
            {current.reasons.some(r => r.effect === 'remove') && (
              <div className="mt-4">
                <p className={label}>Items skipped</p>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const inNow = new Set(covered(current).map(n => n.id));
                    const all = current.utility ? [...inNow, ...(LEDRIX.find(l => l.id === current.id)?.items ?? []).map(i => i.node).filter(id => !inNow.has(id))] : areaLeaves(current);
                    return [...new Set(all)].map(id => {
                      const n = find(systems, id)?.node;
                      if (!n) return null;
                      const on = inNow.has(id);
                      return <button key={id} disabled={disabled} onClick={() => toggleItem(current, id)} aria-pressed={on}
                        className={`rounded-full border border-hairline px-2.5 py-0.5 text-xs ${on ? 'text-ink' : 'text-muted line-through opacity-60'}`}>{displayLabel(n.label)}</button>;
                    });
                  })()}
                </div>
                <p className="mt-2 text-xs text-muted">Tap an item to keep it in (struck through = stays on the checklist).{current.utility ? ' A utility only removes an item that is present for the job’s answers — gas off never removes an electric water heater’s operation.' : ''}</p>
              </div>
            )}
          </section>
        ) : <LimitationsOverview gates={gates} systems={systems} count={g => covered(g).length} onEdit={id => setSel(id)} />}
      </div>
    </div>
  );
}

/** The overview (owner 2026-11-06, mockup W8UhcgEhYqmY2ZBQpgbKbx): every situation in plain words — when the inspector
 *  records this, which items are skipped (or still rated), and what the report says. Edit opens it. */
function LimitationsOverview({ gates, systems, count, onEdit }: { gates: Gate[]; systems: readonly TemplateNode[]; count: (g: Gate) => number; onEdit: (id: string) => void }) {
  if (!gates.length) return <div className="p-6"><Banner title="No limitations">Ledrix’s limitations are turned off for this template.</Banner></div>;
  const name = (g: Gate) => (g.row ? pathOf(systems, g.row).split(' › ').slice(-1)[0] : g.label);
  const rows = gates.flatMap(g => {
    // Reasons with the same effect (and phrase) read as one line: "Viewed from Hatch or Partial Entry".
    const by = new Map<string, GateReason[]>();
    for (const r of g.reasons) { const k = `${r.effect}|${r.effect === 'qualify' ? r.phrase ?? '' : ''}`; by.set(k, [...(by.get(k) ?? []), r]); }
    return [...by.values()].map(rs => ({ g, rs }));
  });
  const say = (v: string) => (v === '*limitation' ? 'Not inspected (any reason)' : v);
  return (
    <section aria-label="All limitations" className="min-w-0 overflow-auto p-4 lg:p-5">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-muted"><tr><th className="py-2 pr-3 font-semibold">When the inspector records…</th><th className="pr-3 font-semibold">On the checklist</th><th className="pr-3 font-semibold">In the report</th><th /></tr></thead>
        <tbody className="divide-y divide-hairline">
          {rows.map(({ g, rs }) => {
            const eff = rs[0].effect, n = count(g);
            return (
              <tr key={`${g.id}-${rs.map(r => r.value).join('|')}`} className="align-top">
                <td className="py-2.5 pr-3 font-semibold text-ink">{g.label}: {rs.map(r => say(r.value)).join(' or ')}</td>
                <td className="py-2.5 pr-3 text-body">{eff === 'remove' ? <><Pill tone="warn">Skipped</Pill> {g.utility ? `Only what needs it (${n} item${n === 1 ? '' : 's'}).` : `${n} item${n === 1 ? '' : 's'}; they don’t count as missed.`}</>
                  : eff === 'qualify' ? <><Pill tone="accent">Still rated</Pill> As usual.</> : <><Pill>Rated as seen</Pill> As usual.</>}</td>
                <td className="py-2.5 pr-3 text-body">{eff === 'remove' ? (g.utility ? `“Not tested — ${g.label.toLowerCase()} off” for each.` : `“${g.label} — not inspected:” and the reason.`)
                  : eff === 'qualify' ? `Each rating ends “(${rs[0].phrase ?? ''})”.` : '—'}</td>
                <td className="py-2.5"><button className={btn.ghost + ' text-xs'} onClick={() => onEdit(g.id)}>Edit</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

