'use client';

// An item's Requirements tab: the company requirements it carries, authored over the shared contract
// (lib/templates/requirementModel → core/requirementsContract). Every change rewrites the item's whole list through
// editorModel `ops.setRequirements`, so the contract's validator judges it like any other edit and refuses what it
// doesn't allow (an exception, another item's records, a broken rule).
//
// It never makes a requirement take effect. Inspections can't evaluate requirements yet, so a template that carries
// any is not published — the banner says so, and the Publish button and useDraft.publish both refuse.
import { useMemo, useState } from 'react';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { ops } from '@/lib/templates/editorModel';
import {
  LEVEL_LABEL, LEVEL_MEANING, PURPOSE_LABEL, REQUIREMENT_LEVELS, REQUIREMENT_PURPOSES, issuesFor, methodsFor, newRequirement,
  readSatisfy, requirementIssues, requirementsOf, writeSatisfy, type RequirementDef, type RequirementLevel,
} from '@/lib/templates/requirementModel';
import { RuleEditor } from './RuleEditor';
import { Banner, btn, field, label } from './ui';

export const levelTone: Record<RequirementLevel, string> = {
  required: 'bg-safety/15 text-safety',
  recommended: 'bg-accent/15 text-accent-ink',
  optional: 'bg-ground text-body',
};
export const LevelPill = ({ level }: { level: RequirementLevel }) =>
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${levelTone[level] ?? levelTone.optional}`}>{LEVEL_LABEL[level] ?? level}</span>;

export function RequirementsEditor({ tree, node, onOps, disabled }: {
  tree: InspectionTemplate; node: TemplateNode; onOps: (o: TemplateOp[]) => boolean; disabled: boolean;
}) {
  const defs = requirementsOf(node);
  const methods = useMemo(() => methodsFor(node), [node]);
  const issues = useMemo(() => issuesFor(requirementIssues(tree), node), [tree, node]);
  const [open, setOpen] = useState<string | null>(defs[0]?.id ?? null);
  const [adding, setAdding] = useState('');
  const unit = /~i\d+$/.test(node.id) || typeof (node as TemplateNode & { instanceOf?: unknown }).instanceOf === 'string';

  const write = (next: RequirementDef[]) => onOps(ops.setRequirements(node.id, next));
  const update = (id: string, patch: Partial<RequirementDef>) => write(defs.map(d => (d.id === id ? { ...d, ...patch } : d)));
  const add = () => {
    const v = adding.trim(); if (!v) return;
    const def = newRequirement(tree, node, v);
    if (write([...defs, def])) { setAdding(''); setOpen(def.id); }
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <Banner tone="warn" title="Can’t publish yet.">
        The phone can’t check requirements until the next update. Switch Requirements off to publish now — it’s kept for later.
      </Banner>
      {unit && <p className="rounded-lg bg-ground px-3 py-2 text-xs text-body">This is a repeated unit. It uses its definition’s requirements and can’t carry its own.</p>}

      <div className="flex items-end justify-between gap-3">
        <div><h3 className="text-base font-semibold text-ink">Requirements</h3>
          <p className="text-xs text-muted">What must be recorded for this item, and how it is satisfied.</p></div>
      </div>

      {issues.filter(i => !i.requirementId).map(i => <p key={i.code + i.message} role="alert" className="text-xs text-safety">{i.message}</p>)}

      <ul className="space-y-2">
        {defs.map(d => (
          <RequirementCard key={d.id} tree={tree} node={node} def={d} methods={methods} open={open === d.id} onToggle={() => setOpen(o => (o === d.id ? null : d.id))}
            issues={issues.filter(i => i.requirementId === d.id).map(i => i.message)} disabled={disabled}
            onChange={p => update(d.id, p)} onRemove={() => write(defs.filter(x => x.id !== d.id))} />
        ))}
        {!defs.length && <li className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-sm text-muted">No requirements on this item.</li>}
      </ul>

      {!unit && (
        <form className="flex gap-1.5" onSubmit={e => { e.preventDefault(); add(); }}>
          <input value={adding} onChange={e => setAdding(e.target.value)} disabled={disabled} aria-label="New requirement name" placeholder="Add requirement, e.g. Data plate photographed" className={`${field} py-1.5`} />
          <button className={btn.accent + ' shrink-0 py-1.5'} disabled={disabled || !adding.trim()}>+ Add requirement</button>
        </form>
      )}
    </div>
  );
}

function RequirementCard({ tree, node, def, methods, open, onToggle, issues, disabled, onChange, onRemove }: {
  tree: InspectionTemplate; node: TemplateNode; def: RequirementDef; methods: ReturnType<typeof methodsFor>; open: boolean; onToggle: () => void;
  issues: string[]; disabled: boolean; onChange: (p: Partial<RequirementDef>) => boolean; onRemove: () => void;
}) {
  const sat = readSatisfy(def, methods);
  const [labelText, setLabelText] = useState(def.label);
  const pick = (mode: 'any' | 'all', keys: string[]) => onChange({ satisfy: writeSatisfy(mode, keys.map(k => methods.find(m => m.key === k)!.clause)) });
  return (
    <li className="overflow-hidden rounded-xl border border-hairline">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-ink/5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{def.label}</p>
          <div className="mt-1 flex flex-wrap gap-1"><LevelPill level={def.level} />{def.purposes.map(p => <span key={p} className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-body">{PURPOSE_LABEL[p] ?? p}</span>)}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {issues.map(m => <p key={m} role="alert" className="px-3 pb-1 text-xs text-safety">{m}</p>)}
      {open && (
        <div className="grid gap-5 border-t border-hairline px-3 py-4 lg:grid-cols-2">
          {/* requirement */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Requirement</p>
            <div>
              <label className={label} htmlFor={`rq-label-${def.id}`}>Name</label>
              <input id={`rq-label-${def.id}`} value={labelText} disabled={disabled} onChange={e => setLabelText(e.target.value)}
                onBlur={() => { const v = labelText.trim(); if (v && v !== def.label) onChange({ label: v }); else setLabelText(def.label); }} className={`${field} py-1.5`} />
            </div>
            <div>
              <label className={label} htmlFor={`rq-level-${def.id}`}>Level</label>
              <select id={`rq-level-${def.id}`} value={def.level} disabled={disabled} onChange={e => onChange({ level: e.target.value as RequirementLevel })} className={`${field} py-1.5`}>
                {REQUIREMENT_LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-muted">{LEVEL_MEANING[def.level]}.</p>
            </div>
            <fieldset>
              <legend className={label}>Purpose (one or more)</legend>
              <div className="flex flex-wrap gap-1.5">
                {REQUIREMENT_PURPOSES.map(p => {
                  const on = def.purposes.includes(p);
                  return <button key={p} type="button" aria-pressed={on} disabled={disabled || (on && def.purposes.length === 1)}
                    title={on && def.purposes.length === 1 ? 'A requirement needs at least one purpose.' : undefined}
                    onClick={() => onChange({ purposes: on ? def.purposes.filter(x => x !== p) : [...def.purposes, p] })}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? 'border-accent bg-accent/15 text-accent-ink' : 'border-hairline text-body hover:bg-ink/5'}`}>{PURPOSE_LABEL[p]}</button>;
                })}
              </div>
              <p className="mt-1 text-[11px] text-muted">Why it is collected. Purpose never changes how strict it is — the level does.</p>
            </fieldset>
          </div>

          {/* when it applies */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">When it applies</p>
            <RuleEditor tree={tree} forNodeId={node.id} rule={def.appliesWhen} idPrefix={`rq-${def.id}`} disabled={disabled}
              emptyText="Whenever this item is in the inspection."
              onSave={r => onChange(r === null ? { appliesWhen: undefined } : { appliesWhen: r })} />
            <p className="text-[11px] text-muted">Accessibility isn’t a condition: when the item can’t be reached, the inspector records a limitation (below).</p>
          </div>

          {/* what satisfies it */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">What satisfies it</p>
            {sat.ok ? (<>
              <div role="radiogroup" aria-label="How the methods combine" className="space-y-1 text-sm">
                {(['any', 'all'] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-2 text-body">
                    <input type="radio" name={`mode-${def.id}`} checked={sat.mode === mode} disabled={disabled || sat.keys.length < 2} onChange={() => pick(mode, sat.keys)} />
                    {mode === 'any' ? 'Any of the following (OR)' : 'All of the following (AND)'}
                  </label>
                ))}
              </div>
              <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
                {methods.map(m => {
                  const on = sat.keys.includes(m.key);
                  return (
                    <li key={m.key}><label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-ink/5">
                      <input type="checkbox" className="mt-0.5" checked={on} disabled={disabled || (on && sat.keys.length === 1)}
                        title={on && sat.keys.length === 1 ? 'Something has to satisfy it.' : undefined}
                        onChange={() => pick(sat.mode, on ? sat.keys.filter(k => k !== m.key) : [...sat.keys, m.key])} />
                      <span className="min-w-0"><span className="block text-sm text-ink">{m.label}</span>{m.hint && <span className="block text-[11px] text-muted">{m.hint}</span>}</span>
                    </label></li>
                  );
                })}
              </ul>
              <p className="text-[11px] text-muted">Only this item’s own records count. A proposed (unconfirmed) finding never satisfies it.</p>
            </>) : (
              <p className="rounded-lg bg-ground px-3 py-2 text-xs text-body">This requirement’s methods can’t be shown here ({sat.reason}). They are kept exactly as they are.</p>
            )}
          </div>

          {/* if it can't be satisfied + report */}
          <div className="space-y-3">
            <div>
              <label className={label + ' text-sm normal-case tracking-normal text-ink'} htmlFor={`rq-unmet-${def.id}`}>If it can’t be satisfied</label>
              <select id={`rq-unmet-${def.id}`} value={def.unmet.limitation} disabled={disabled}
                onChange={e => onChange({ unmet: { ...def.unmet, limitation: e.target.value as 'resolves' | 'not_allowed', exception: 'not_allowed' } })} className={`${field} py-1.5`}>
                <option value="resolves">A limitation resolves it</option>
                <option value="not_allowed">It must be satisfied — a limitation doesn’t resolve it</option>
              </select>
              <p className="mt-1 text-[11px] text-muted">Exceptions (an approved waiver) aren’t available yet — they need an approval step in the app and server.</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Report inclusion</p>
              <p className="mt-1 text-[11px] text-muted">Not set on a requirement: two requirements can use the same record, so what prints belongs to the item’s data (Report tab). A requirement never changes what the report contains.</p>
            </div>
          </div>

          <div className="lg:col-span-2 flex justify-end border-t border-hairline pt-3">
            <button className={btn.secondary + ' text-safety'} disabled={disabled} onClick={onRemove}>Remove requirement</button>
          </div>
        </div>
      )}
    </li>
  );
}
