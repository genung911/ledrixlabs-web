'use client';

// EXPECTED LIFE (owner 2026-11-12: "Add expected life ranges to template builder for companies to set and use those ages
// you gave as defaults"; mockup https://claude.ai/artifact/Gg6Wvs8yXeWorcNvbqWhd2, Builder board, "approved"). The typical
// years each kind of equipment lasts. A unit whose year made puts it past the END of its range gets a draft "past its
// typical service life" finding, which the inspector keeps or rejects. Ledrix ships the defaults; "Reset to Ledrix" removes
// the company's change. Saved as the template's `serviceLives` (templateOps TEMPLATE_FIELDS.serviceLives) — only what
// differs from Ledrix — and each new inspection keeps the years it started with (serviceLifeDefinitions).
import { useMemo } from 'react';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { LEDRIX_SERVICE_LIVES, serviceLivesOf, type ServiceLife } from '@/lib/scope/core/taxonomy/serviceLife';
import { btn, field } from './ui';

type Entry = Partial<ServiceLife> & { id: string };

export function ServiceLivesPanel({ tree, onOps, disabled }: { tree: InspectionTemplate; onOps: (o: TemplateOp[]) => boolean; disabled: boolean }) {
  const own: Entry[] = useMemo(() => (Array.isArray((tree as { serviceLives?: unknown }).serviceLives) ? (tree as unknown as { serviceLives: Entry[] }).serviceLives : []), [tree]);
  const lives = useMemo(() => serviceLivesOf({ serviceLives: own }), [own]);
  const ledrixOf = (id: string) => LEDRIX_SERVICE_LIVES.find(l => l.id === id)!;
  const changed = (id: string) => own.some(e => e.id === id);

  const save = (next: Entry[]) => onOps([{ op: 'setTemplateField', field: 'serviceLives', value: next.length ? next : null } as TemplateOp]);
  // Only what differs from Ledrix is kept, so a later Ledrix change still reaches every row the company left alone.
  const put = (id: string, low: number, high: number) => {
    const l = ledrixOf(id);
    const lo = Math.min(low, high), hi = Math.max(low, high);
    const diff: Entry = { id };
    if (lo !== l.low) diff.low = lo;
    if (hi !== l.high) diff.high = hi;
    const rest = own.filter(e => e.id !== id);
    save(Object.keys(diff).length > 1 ? [...rest, diff] : rest);
  };
  const reset = (id: string) => save(own.filter(e => e.id !== id));
  const num = (l: ServiceLife, k: 'low' | 'high', aria: string) => (
    <input type="number" min={1} max={100} inputMode="numeric" className={`${field} w-16 px-2 py-1.5`} defaultValue={l[k]} disabled={disabled}
      aria-label={aria} key={`${l.id}-${k}-${l[k]}`}
      onBlur={e => {
        const v = Math.round(Number(e.target.value));
        if (!Number.isFinite(v) || v < 1 || v > 100) { e.target.value = String(l[k]); return; }
        if (v === l[k]) return;
        put(l.id, k === 'low' ? v : l.low, k === 'high' ? v : l.high);
      }} />
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-3xl text-sm text-body">Typical years each kind of equipment lasts. When a unit&apos;s year made puts it past the end of its range, Ledrix drafts a &ldquo;past its typical service life&rdquo; finding for the inspector to keep or reject.</p>
      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-semibold">Equipment</th>
              <th className="px-4 py-2.5 font-semibold">Typical life (years)</th>
              <th className="px-4 py-2.5 font-semibold">Drafts a finding</th>
              <th className="px-4 py-2.5"><span className="sr-only">Source</span></th>
            </tr>
          </thead>
          <tbody>
            {lives.map(l => {
              const c = changed(l.id), d = ledrixOf(l.id);
              return (
                <tr key={l.id} className={`border-b border-hairline last:border-b-0 ${c ? 'bg-accent/5' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold text-ink">{l.label}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5">{num(l, 'low', `${l.label}: typical life from`)}<span className="text-muted">to</span>{num(l, 'high', `${l.label}: typical life to`)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-body">older than {l.high} years</td>
                  <td className="px-4 py-2.5">
                    {c ? (
                      <span className="flex flex-col items-start gap-0.5">
                        <span className="text-xs font-semibold text-accent-ink">Changed · Ledrix {d.low}–{d.high}</span>
                        <button className={`${btn.ghost} !px-0 !py-0 text-xs`} disabled={disabled} onClick={() => reset(l.id)}>Reset to Ledrix</button>
                      </span>
                    ) : <span className="text-xs text-muted">Ledrix</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Saved with the template. Each new inspection keeps the years it started with.</p>
    </div>
  );
}
