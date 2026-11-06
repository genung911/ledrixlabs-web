'use client';

// Ledrix's suggestions, INSIDE a system's list (owner 2026-11-05, mockup https://claude.ai/artifact/DbUgEVKPbCeigN6G8YTaAL:
// "why do we have this list as well? … merged with the present and not present items so its one list"). The separate
// catalog box with its tick boxes is gone. Each type's list ends with the parts Ledrix suggests for that equipment that
// the template does not have yet: "+ Add" for a Typical part (added switched on), "+ Add as optional" for an If-present
// part (added switched off — offered on site), and "Add all typical". Every add is one change set through
// catalogModel.suggestOps → onOps: validated, all-or-nothing, one undo. Readings stay hidden until the phone can collect
// them. No suggestion count on the type chips (owner 2026-11-05: "no count on the chip").
import { useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import type { CatalogEquipmentType } from '@/lib/templateBuilder/core/equipmentCatalog';
import { ruleFor, suggestOps, suggestionsFor } from '@/lib/templates/catalogModel';
import { Pill, btn } from './ui';

const article = (s: string) => (/^[aeiou]/i.test(s) ? 'an' : 'a');

export function LedrixSuggestions({ tree, system, types, onOps, disabled, when }: {
  tree: InspectionTemplate; system: TemplateNode; types: CatalogEquipmentType[]; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
  /** Says when the added parts show, where that is not the chip the builder is on (a mini-split follows Distribution). */
  when?: boolean;
}) {
  const [typeId, setTypeId] = useState<string | null>(null);
  const type = types.find(t => t.id === typeId) ?? types[0] ?? null;
  if (!type) return null;
  const list = suggestionsFor(system, [type]);
  const typical = list.filter(s => s.component.presence === 'typical');
  const rule = when ? ruleFor(tree, type) : null;
  const add = (ids: string[]) => onOps(suggestOps(tree, system, type.id, ids));

  return (
    <div className="rounded-lg border border-accent/40 bg-accent/5" aria-label={`Ledrix suggests for ${article(type.label)} ${type.label.toLowerCase()}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-accent/20 px-3 py-1.5">
        <p className="flex-1 text-xs font-semibold text-accent">Ledrix suggests for {article(type.label)} {type.label.toLowerCase()} · {list.length}</p>
        {typical.length > 1 && <button type="button" className={btn.ghost + ' px-2 py-0.5 text-xs'} disabled={disabled} onClick={() => add(typical.map(s => s.component.id))}>Add all typical</button>}
      </div>
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2" role="group" aria-label="Which equipment">
          {types.map(t => (
            <button key={t.id} type="button" aria-pressed={t.id === type.id} onClick={() => setTypeId(t.id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${t.id === type.id ? 'bg-accent text-white' : 'border border-accent/40 text-body hover:border-accent'}`}>{t.label}</button>
          ))}
        </div>
      )}
      {rule && <p className="px-3 pt-2 text-[11px] text-muted">Shows when {rule.field.split('::')[0] === 'hvac_distribution' ? 'Distribution' : 'Heating System'} is {rule.anyOf.join(' or ')}.</p>}
      <ul className="divide-y divide-accent/10">
        {list.map(({ component: c }) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
            <span className="text-sm text-ink">{c.label}</span>
            {c.presence === 'typical' ? <Pill tone="ok">Typical</Pill> : <Pill tone="warn">If present</Pill>}
            {c.note && <span className="min-w-0 flex-1 truncate text-xs text-muted" title={c.note}>{c.note}</span>}
            <span className={c.note ? '' : 'flex-1'} />
            <button type="button" className={btn.ghost + ' px-2 py-0.5 text-xs'} disabled={disabled} onClick={() => add([c.id])}
              title={c.presence === 'typical' ? 'Adds it switched on' : 'Adds it switched off; inspectors add it on site when the unit has one'}>
              {c.presence === 'typical' ? '+ Add' : '+ Add as optional'}</button>
          </li>
        ))}
        {!list.length && <li className="px-3 py-2 text-xs text-muted">Your template has every part Ledrix suggests here.</li>}
      </ul>
    </div>
  );
}
