'use client';

// "HOW MANY …?" (owner 2026-11-03: mockup panel (e) approved — https://claude.ai/artifact/XU9cYn2ufZgGxxG7LPzaW4;
// "Yes finish the leftovers"). For each equipment system and each counted field, a company sets whether it asks how many,
// the question, what one unit is called, what each unit asks for (a location), the range, and whether a data plate may
// suggest the count (only ever offered — the inspector taps to accept). Ledrix ships the default; "Reset to Ledrix"
// removes the company's change. Saved as the template's `counts` (templateOps TEMPLATE_FIELDS.counts); each new
// inspection keeps the rules it started with and is shaped by them then.
import { useMemo, useState } from 'react';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { effectiveCounts, type CountRule } from '@/lib/scope/core/taxonomy/countRules';
import ledrixPack from '@/lib/scope/core/taxonomy/ledrix.core.json';
import { Pill, Toggle, btn, field, label } from './ui';

const LEDRIX: CountRule[] = ((ledrixPack as { counts?: CountRule[] }).counts ?? []);
type Entry = Partial<CountRule> & { id: string };
const EDITABLE = ['label', 'asks', 'question', 'unitName', 'noun', 'lead', 'askLocation', 'min', 'max', 'plateSuggest'] as const;

export function CountsPanel({ tree, onOps, disabled }: { tree: InspectionTemplate; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const own: Entry[] = useMemo(() => (Array.isArray((tree as { counts?: unknown }).counts) ? (tree as unknown as { counts: Entry[] }).counts : []), [tree]);
  const rules = useMemo(() => effectiveCounts(LEDRIX, own), [own]);
  const [sel, setSel] = useState<string | null>(null);
  const current = rules.find(r => r.id === sel) ?? rules[0] ?? null;
  const ledrixOf = (id: string) => LEDRIX.find(r => r.id === id) ?? null;
  const overridden = (id: string) => own.some(e => e.id === id);

  const save = (next: Entry[]) => onOps([{ op: 'setTemplateField', field: 'counts', value: next.length ? next : null } as TemplateOp]);
  // Only what differs from Ledrix is kept, so a later Ledrix change still reaches every field the company left alone.
  const put = (r: CountRule) => {
    const l = ledrixOf(r.id);
    if (!l) return;
    const diff: Entry = { id: r.id };
    for (const k of EDITABLE) if (r[k] !== undefined && r[k] !== l[k]) (diff as Record<string, unknown>)[k] = r[k];
    const rest = own.filter(e => e.id !== r.id);
    save(Object.keys(diff).length > 1 ? [...rest, diff] : rest);
  };
  const reset = (id: string) => save(own.filter(e => e.id !== id));
  const text = (r: CountRule, k: 'question' | 'unitName' | 'noun' | 'lead' | 'label', aria: string) => (
    <input className={field} defaultValue={String(r[k] ?? '')} disabled={disabled} aria-label={aria} key={`${r.id}-${k}-${String(r[k] ?? '')}`}
      onBlur={e => { const v = e.target.value.trim(); if (v && v !== r[k]) put({ ...r, [k]: v }); }} />
  );
  const cap = (r: CountRule) => (r.kind === 'slots' ? (ledrixOf(r.id)?.slots?.length ?? r.max) : 99);
  const num = (r: CountRule, k: 'min' | 'max', aria: string) => (
    <input type="number" min={1} max={cap(r)} className={`${field} w-24`} defaultValue={r[k]} disabled={disabled} aria-label={aria} key={`${r.id}-${k}-${r[k]}`}
      onBlur={e => {
        const v = Math.round(Number(e.target.value));
        if (!Number.isFinite(v) || v === r[k]) return;
        const next = { ...r, [k]: Math.max(1, Math.min(cap(r), v)) };
        if (next.min > next.max) { if (k === 'min') next.max = next.min; else next.min = next.max; }
        put(next);
      }} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">How many?</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-body">An equipment system can ask how many units there are, and a counted item (mini-split indoor heads) shows that many rows, each with its own condition. A data plate may <b>suggest</b> a count; the inspector&apos;s tap sets it. Each inspection keeps the rules it started with.</p>
      </div>
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-hairline bg-surface lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Count rules" className="overflow-y-auto border-b border-hairline p-2 lg:border-b-0 lg:border-r">
          {rules.map(r => (
            <button key={r.id} onClick={() => setSel(r.id)} aria-current={current?.id === r.id ? 'true' : undefined}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${current?.id === r.id ? 'bg-accent/15 font-semibold text-accent-ink' : 'text-body hover:bg-ink/5'}`}>
              <span className="truncate">{r.label}</span>
              <span className="font-mono text-[10.5px] text-muted">{r.asks ? `${r.min}–${r.max}` : 'off'}</span>
            </button>
          ))}
        </nav>
        {current ? (
          <section aria-label={`Count rule: ${current.label}`} className="min-w-0 overflow-y-auto p-4 lg:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">{current.label}</h3>
              {overridden(current.id) ? <Pill tone="warn">Changed from Ledrix</Pill> : <Pill>Ledrix</Pill>}
              <span className="flex-1" />
              {overridden(current.id) && <button className={btn.secondary} disabled={disabled} onClick={() => reset(current.id)}>Reset to Ledrix</button>}
            </div>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
              <dt className={label}>Asks how many</dt>
              <dd><Toggle on={current.asks} disabled={disabled} label="Asks how many" onChange={v => put({ ...current, asks: v })} /></dd>
              {current.asks && <>
                <dt className={label}>The question</dt><dd>{text(current, 'question', 'The question')}</dd>
                <dt className={label}>One unit is called</dt><dd>{text(current, 'unitName', 'One unit is called')}</dd>
                <dt className={label}>Several are called</dt><dd>{text(current, 'noun', 'Several are called')}</dd>
                {current.kind === 'slots' && <><dt className={label}>Report line starts</dt><dd>{text(current, 'lead', 'Report line starts')}</dd></>}
                <dt className={label}>Range</dt>
                <dd className="flex items-center gap-2">{num(current, 'min', 'Lowest')}<span className="text-muted">to</span>{num(current, 'max', 'Highest')}{current.kind === 'slots' && <span className="text-xs text-muted">up to {cap(current)}</span>}</dd>
                {current.kind === 'slots' && <>
                  <dt className={label}>Each unit asks its location</dt>
                  <dd className="flex items-center gap-2"><Toggle on={current.askLocation !== false} disabled={disabled} label="Each unit asks its location" onChange={v => put({ ...current, askLocation: v })} /><span className="text-xs text-muted">Optional for the inspector; &ldquo;Unknown&rdquo; when empty, never blocks Seal &amp; Send.</span></dd>
                  <dt className={label}>A data plate may suggest it</dt>
                  <dd className="flex items-center gap-2"><Toggle on={current.plateSuggest} disabled={disabled} label="A data plate may suggest the count" onChange={v => put({ ...current, plateSuggest: v })} /><span className="text-xs text-muted">Shown as &ldquo;Ledrix suggests N&rdquo;; only the inspector sets the count.</span></dd>
                </>}
              </>}
            </dl>
            <div className="mt-4 rounded-xl border border-hairline bg-ground p-3 text-sm">
              <p className={label}>On the phone</p>
              <p className="text-ink">{current.asks ? current.question : 'No question — units are added with “+ Add another”.'}</p>
              {current.kind === 'slots' && current.asks && (
                <>
                  <p className={`${label} mt-3`}>In the report</p>
                  <p className="text-ink">{current.lead ?? current.label}, 3 {current.noun}{current.askLocation !== false ? ': Primary Bedroom, Living Room, Unknown' : ''}</p>
                </>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
