'use client';

// The equipment component catalog on a system's panel (owner rulings 2026-10-26; mockup reviewed the same day).
// The company picks an equipment type, ticks the components its inspectors check — nothing is ticked to start —
// and sets Condition and Details per component. "Add" applies every pick as ONE change set (catalogModel.catalogOps
// through onOps): validated, all-or-nothing, one undo. Evidence (readings, data plates) is listed but not addable
// until the phone can collect it.
import { useEffect, useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { detailsLabelOf, type CatalogComponent } from '@/lib/templateBuilder/core/equipmentCatalog';
import { catalogOps, catalogRows, catalogTypesForSystem, defaultPick, pickRecordsSomething, ruleFor, type Pick } from '@/lib/templates/catalogModel';
import { Pill, Toggle, btn, label } from './ui';

export function CatalogPanel({ tree, system, onOps, disabled }: {
  tree: InspectionTemplate; system: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const types = catalogTypesForSystem(system);
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  useEffect(() => { setPicks({}); }, [typeId, system.id]);
  const type = types.find(t => t.id === typeId) ?? null;
  const groups = useMemo(() => (type ? catalogRows(system, type.id) : []), [system, type]);
  if (!types.length || !type) return null;

  const rule = ruleFor(tree, type);
  const chosen = Object.values(picks);
  const comp = (id: string): CatalogComponent | undefined => groups.flatMap(g => g.rows).find(r => r.component.id === id)?.component;
  const addable = chosen.filter(p => { const c = comp(p.id); return !!c && pickRecordsSomething(c, p); });
  const toggle = (c: CatalogComponent) => setPicks(cur => { const n = { ...cur }; if (n[c.id]) delete n[c.id]; else n[c.id] = defaultPick(c); return n; });
  const patch = (id: string, p: Partial<Pick>) => setPicks(cur => (cur[id] ? { ...cur, [id]: { ...cur[id], ...p } } : cur));
  const add = () => { if (onOps(catalogOps(tree, system, type.id, addable))) setPicks({}); };
  const selectable = groups.flatMap(g => g.rows).filter(r => !r.present && !r.evidenceOnly);
  const selectAll = () => setPicks(cur => { const n = { ...cur }; for (const r of selectable) if (!n[r.component.id]) n[r.component.id] = defaultPick(r.component); return n; });

  return (
    <div className="space-y-3 rounded-xl border border-hairline px-3 py-3" aria-label="Component catalog">
      <div>
        <p className="text-sm font-semibold text-ink">Add from the component catalog</p>
        <p className="text-xs text-muted">Ledrix knows what each kind of equipment contains. Tick the components your inspectors check — nothing is included until you choose it.</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Equipment type">
        {types.map(t => (
          <button key={t.id} type="button" aria-pressed={t.id === typeId} onClick={() => setTypeId(t.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${t.id === typeId ? 'bg-ink text-surface' : 'border border-hairline text-body hover:border-ink'}`}>{t.label}</button>
        ))}
      </div>
      <p className="text-xs text-muted">{type.intro} {rule
        ? <>Added components show when <strong className="text-body">{rule.field.split('::')[0] === 'hvac_distribution' ? 'Distribution' : 'Heating System'}</strong> is {rule.anyOf.join(' or ')} (and while it is unanswered).</>
        : <>This template has no field that tells this equipment apart, so added components always show.</>}</p>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted">{chosen.length} selected</span>
        <span className="flex-1" />
        <button type="button" className={btn.ghost + ' text-xs'} disabled={disabled || !selectable.length} onClick={selectAll}>Select all</button>
        <button type="button" className={btn.ghost + ' text-xs'} disabled={!chosen.length} onClick={() => setPicks({})}>Clear</button>
      </div>

      <div className="space-y-3">
        {groups.map(g => (
          <div key={g.label} className="overflow-hidden rounded-lg border border-hairline">
            <p className="border-b border-hairline bg-ground px-3 py-1.5 text-xs"><span className="font-semibold text-ink">{g.label}</span> <span className="text-muted">· {g.why}</span></p>
            <ul className="divide-y divide-hairline">
              {g.rows.map(({ component: c, present, evidenceOnly }) => {
                const p = picks[c.id];
                const id = `cat-${type.id}-${c.id}`;
                return (
                  <li key={c.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input id={id} type="checkbox" className="h-4 w-4 accent-[var(--accent,#217BE8)]" checked={!!p} disabled={disabled || !!present || evidenceOnly} onChange={() => toggle(c)} />
                      <label htmlFor={id} className={`text-sm ${present || evidenceOnly ? 'text-muted' : 'text-ink'}`}>{c.label}</label>
                      {c.presence === 'typical' ? <Pill tone="ok">Typical</Pill> : <Pill tone="warn">If present</Pill>}
                      {c.note && <span className="text-xs text-muted">— {c.note}</span>}
                      <span className="flex-1" />
                      {present && <span className="text-xs text-muted">In your template{present !== c.label ? ` as “${present}”` : ''}</span>}
                      {!present && evidenceOnly && <span className="text-xs text-muted">Evidence — phone support next</span>}
                    </div>
                    {p && (
                      <div className="ml-6 mt-2 grid gap-2 rounded-lg bg-ground px-3 py-2 text-xs sm:grid-cols-3">
                        <div className="flex items-center justify-between gap-2"><span><span className="font-semibold text-ink">Condition</span><br /><span className="text-muted">Satisfactory / Limitation / Finding</span></span>
                          <Toggle on={p.condition} label={`Condition for ${c.label}`} onChange={v => patch(c.id, { condition: v })} /></div>
                        <div className="flex items-center justify-between gap-2"><span><span className="font-semibold text-ink">Details</span><br /><span className="text-muted">{c.details?.length ? `${detailsLabelOf(c)}: ${c.details.join(', ')}` : 'Not relevant here'}</span></span>
                          <Toggle on={p.details && !!c.details?.length} disabled={!c.details?.length} label={`Details for ${c.label}`} onChange={v => patch(c.id, { details: v })} /></div>
                        <div className="flex items-center justify-between gap-2"><span><span className="font-semibold text-muted">Evidence</span><br /><span className="text-muted">Phone support next</span></span>
                          <Toggle on={false} disabled label={`Evidence for ${c.label}`} onChange={() => undefined} /></div>
                        {!pickRecordsSomething(c, p) && <p className="text-amber-700 sm:col-span-3">Nothing is on — turn on Condition or Details, or untick it.</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className={btn.primary} disabled={disabled || !addable.length} onClick={add}>
          {addable.length ? `Add ${addable.length} component${addable.length === 1 ? '' : 's'}` : 'Add components'}
        </button>
        <p className={label + ' mb-0 normal-case tracking-normal font-normal'}>They join this template like any item — edit, move or set them aside afterwards.</p>
      </div>
    </div>
  );
}
