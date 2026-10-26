'use client';

// A "when does this apply" rule, edited as conditions that must ALL hold (lib/templates/ruleModel). It offers only
// what inspections can run: a spec field elsewhere in the template whose answer is one of some choices (or typed in).
// Edits are local until Save, because a condition with nothing picked isn't a rule yet; Save writes the whole rule as
// one change, which the template validator judges like any other edit.
import { useEffect, useMemo, useState } from 'react';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import { readRule, ruleFields, writeRule, describeCondition, type Condition } from '@/lib/templates/ruleModel';
import { btn, field } from './ui';

export function RuleEditor({ tree, forNodeId, rule, onSave, disabled, emptyText, idPrefix }: {
  tree: InspectionTemplate; forNodeId: string; rule: unknown; onSave: (rule: unknown | null) => boolean; disabled: boolean;
  emptyText: string; idPrefix: string;
}) {
  const fields = useMemo(() => ruleFields(tree, forNodeId), [tree, forNodeId]);
  const view = useMemo(() => readRule(rule), [rule]);
  const stored = JSON.stringify(rule ?? null);
  const [conds, setConds] = useState<Condition[]>(view.ok ? view.conditions : []);
  useEffect(() => { setConds(view.ok ? view.conditions : []); }, [stored]);   // eslint-disable-line react-hooks/exhaustive-deps
  const next = writeRule(conds);
  const dirty = JSON.stringify(next) !== stored;
  const incomplete = conds.some(c => !c.field || (!c.values.length && !c.typed));

  if (!view.ok) {
    return (
      <div className="rounded-xl border border-warn/50 bg-warn/10 px-3 py-3 text-sm text-body">
        <p>This rule was written in a form the editor can’t show as conditions ({view.reason}). It is kept exactly as it is.</p>
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-ground p-2 text-[11px]">{JSON.stringify(rule, null, 2)}</pre>
        <button className={`${btn.secondary} mt-2`} disabled={disabled} onClick={() => onSave(null)}>Remove this rule</button>
      </div>
    );
  }

  const set = (i: number, patch: Partial<Condition>) => setConds(cs => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {!conds.length && <p className="text-xs text-muted">{emptyText}</p>}
      {conds.map((c, i) => {
        const f = fields.find(x => x.field === c.field);
        return (
          <div key={i} className="rounded-xl border border-hairline p-3">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-muted">{i === 0 ? 'When' : 'and'}</span>
              <select id={`${idPrefix}-f${i}`} aria-label={`Condition ${i + 1}: spec field`} value={c.field} disabled={disabled}
                onChange={e => set(i, { field: e.target.value, values: [], typed: false })} className={`${field} min-w-0 py-1.5`}>
                <option value="">Pick a spec field…</option>
                {fields.map(x => <option key={x.field} value={x.field}>{x.path} — {x.label}</option>)}
                {c.field && !f && <option value={c.field}>{c.field} (not in the template)</option>}
              </select>
              <button aria-label={`Remove condition ${i + 1}`} className={btn.icon} disabled={disabled} onClick={() => setConds(cs => cs.filter((_, k) => k !== i))}>×</button>
            </div>
            {f && (
              <div className="mt-2 pl-14">
                <p className="mb-1 text-[11px] text-muted">is any of</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.values.map(v => {
                    const on = c.values.includes(v);
                    return <button key={v} type="button" aria-pressed={on} disabled={disabled} onClick={() => set(i, { values: on ? c.values.filter(x => x !== v) : [...c.values, v] })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-accent bg-accent/15 text-accent-ink' : 'border-hairline text-body hover:bg-ink/5'}`}>{v}</button>;
                  })}
                  {!f.values.length && <span className="text-xs text-muted">This field has no choices yet — add them in its Fields tab.</span>}
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-body">
                  <input type="checkbox" checked={c.typed} disabled={disabled} onChange={e => set(i, { typed: e.target.checked })} /> or an answer typed in (not one of the choices)
                </label>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn.ghost} disabled={disabled || !fields.length} onClick={() => setConds(cs => [...cs, { field: '', values: [], typed: false }])}>+ Add condition</button>
        {dirty && <>
          <button className={btn.primary + ' py-1.5'} disabled={disabled || incomplete} title={incomplete ? 'Pick a field and at least one answer for every condition.' : undefined}
            onClick={() => { onSave(next); }}>Save rule</button>
          <button className={btn.secondary + ' py-1.5'} onClick={() => setConds(view.conditions)}>Cancel</button>
        </>}
      </div>
      {!fields.length && <p className="text-[11px] text-muted">No other item in this template has spec fields to test.</p>}
      {!dirty && conds.length > 0 && <p className="text-[11px] text-muted">Applies when {conds.map(c => describeCondition(c, fields)).join(', and ')}.</p>}
    </div>
  );
}
