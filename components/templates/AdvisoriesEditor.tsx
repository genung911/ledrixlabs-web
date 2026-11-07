'use client';

// Report advisories, picked and tuned (owner 2026-11-06, mockup https://claude.ai/artifact/NH8eoefNScGrsemCdofANd, "looks
// great"). Used on "Create a template" (before the draft exists) and in the Template Builder's Report section. Every
// change goes through `onChange` with the whole list; lib/templates/advisoryModel says what each control writes.
import { useState } from 'react';
import type { Advisory } from '@/lib/templates/reportAdvisories';
import { RULE_LABEL, editorRows, newAdvisory, pick, replace, ruleOf, ruleSentence, withRule, type Rule, type RuleKind } from '@/lib/templates/advisoryModel';
import { Toggle, btn, field } from './ui';

const SHOWN = 9;
/** The shared field look without its full width — the rule's select and years sit in a row (the stretched boxes in the
 *  owner's 2026-11-06 screenshot pushed Suggest / Always add off the edge). */
const inline = field.replace(/\bw-full\b\s*/, '');
const KINDS: RuleKind[] = ['every', 'before', 'between', 'from', 'water', 'sewer', 'gas', 'never'];

export function AdvisoriesEditor({ value, onChange, suggest, onSuggest, disabled = false }: {
  value: Advisory[]; onChange: (list: Advisory[]) => void; suggest: boolean; onSuggest: (on: boolean) => void; disabled?: boolean;
}) {
  const rows = editorRows(value);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<{ id: string; what: 'rule' | 'wording' } | null>(null);
  const shown = all ? rows : rows.filter((r, i) => i < SHOWN || r.picked);
  const isOpen = (id: string, what: 'rule' | 'wording') => open?.id === id && open.what === what;
  const flip = (id: string, what: 'rule' | 'wording') => setOpen(isOpen(id, what) ? null : { id, what });
  return (
    <div className="overflow-hidden rounded-xl border border-hairline" aria-label="Report advisories">
      {/* ONE QUESTION FIRST (owner 2026-11-06, mockup A5vbGSBfvHNfPL4F2Fm5fu, "Thats way better"): Ledrix's rules do the
          rest, so a company never has to work out edge cases before they happen. */}
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Should Ledrix suggest advisories to your inspector from the home’s details?</span>
          <span className="block text-xs text-muted">Year built, water source, sewer and gas, read from the inspection. The inspector still decides; nothing prints unless it’s ticked.</span>
        </span>
        <Toggle on={suggest} label="Suggest advisories from the home’s details" disabled={disabled} onChange={onSuggest} />
      </div>
      <p className="border-y border-hairline bg-ground px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Which ones · {value.length} of {rows.length}</p>
      <ul className="divide-y divide-hairline">
        {shown.map(({ a, picked, ledrix }) => {
          const r = ruleOf(a);
          return (
            <li key={a.id} className={`px-3 py-2 ${picked ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <input type="checkbox" className="h-4 w-4 flex-none" checked={picked} disabled={disabled} aria-label={`Use ${a.label}`}
                  onChange={e => onChange(pick(value, a, e.target.checked))} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{a.label}
                    <span className={`ml-2 rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${a.kind === 'limitation' ? 'bg-warn/10 text-warn' : 'bg-accent/10 text-accent'}`}>{a.kind === 'limitation' ? 'Limitation' : 'Recommendation'}</span>
                    {!ledrix && <span className="ml-1 text-[11px] font-normal text-muted">yours</span>}</span>
                  <span className="block text-xs text-muted">
                    {suggest && <>{ruleSentence(r)} · <button type="button" disabled={disabled || !picked} className="text-accent hover:underline disabled:text-muted disabled:no-underline" onClick={() => flip(a.id, 'rule')}>{isOpen(a.id, 'rule') ? 'Done' : 'Change'}</button> · </>}
                    <button type="button" className="text-accent hover:underline" onClick={() => flip(a.id, 'wording')}>{isOpen(a.id, 'wording') ? 'Hide wording' : 'Wording'}</button>
                  </span>
                </span>
                {suggest && picked && r.kind !== 'never' && (
                  <ModeToggle mode={a.mode ?? 'suggest'} disabled={disabled} label={a.label} onMode={m => onChange(replace(value, { ...a, mode: m }))} />
                )}
              </div>
              {suggest && isOpen(a.id, 'rule') && (
                <div className="mt-2 pl-7"><RulePicker rule={r} disabled={disabled || !picked} label={a.label} onRule={x => onChange(replace(value, withRule(a, x)))} /></div>
              )}
              {isOpen(a.id, 'wording') && (
                <div className="pl-7"><Wording text={a.text} disabled={disabled || !picked} label={a.label} onText={t => onChange(replace(value, { ...a, text: t }))} /></div>
              )}
            </li>
          );
        })}
      </ul>
      {!all && rows.length > shown.length && (
        <button type="button" className="w-full border-t border-hairline px-3 py-2 text-left text-xs font-semibold text-accent" onClick={() => setAll(true)}>Show {rows.length - shown.length} more</button>
      )}
      <AddOwn value={value} onChange={onChange} disabled={disabled} suggest={suggest} />
      <p className="border-t border-hairline px-3 py-2 text-[11px] text-muted">
        {suggest ? <><b className="text-body">Suggest</b>: matching homes show it marked Suggested and the inspector ticks it. <b className="text-body">Always add</b>: matching homes
          start with it ticked; the inspector can untick it (phone build 723 or later). A home with no year built is never matched by a year.</>
          : 'Ledrix won’t suggest or add any of these: the inspector picks from the ticked ones by hand.'}
        {value.length === 0 && ' None ticked: inspectors are offered all of Ledrix’s advisories.'}
      </p>
    </div>
  );
}

function RulePicker({ rule, onRule, disabled, label }: { rule: Rule; onRule: (r: Rule) => void; disabled: boolean; label: string }) {
  const [a, setA] = useState(rule.a ? String(rule.a) : '');
  const [b, setB] = useState(rule.b ? String(rule.b) : '');
  const [seen, setSeen] = useState(JSON.stringify(rule));
  if (JSON.stringify(rule) !== seen) { setSeen(JSON.stringify(rule)); setA(rule.a ? String(rule.a) : ''); setB(rule.b ? String(rule.b) : ''); }
  const years = (kind: RuleKind, x = a, y = b) => onRule({ kind, a: Number(x), b: Number(y) });
  const yr = (v: string, set: (s: string) => void, which: 'a' | 'b') => (
    <input inputMode="numeric" value={v} disabled={disabled} aria-label={`${label} ${which === 'a' ? 'year' : 'end year'}`} placeholder="year"
      onChange={e => set(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onBlur={() => { if ((which === 'a' ? v : b).length === 4) years(rule.kind, which === 'a' ? v : a, which === 'b' ? v : b); }}
      className={`${inline} w-[4.5rem] px-2 py-1 text-center text-xs`} />
  );
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <select value={rule.kind} disabled={disabled} aria-label={`When ${label} applies`} className={`${inline} px-2 py-1 text-xs`}
        onChange={e => {
          const k = e.target.value as RuleKind;
          if (k === 'before' || k === 'from') { const y = a.length === 4 ? a : '1980'; setA(y); onRule({ kind: k, a: Number(y) }); }
          else if (k === 'between') { const x = a.length === 4 ? a : '1965', y = b.length === 4 ? b : String(Math.max(Number(x), 1973)); setA(x); setB(y); onRule({ kind: k, a: Number(x), b: Number(y) }); }
          else onRule({ kind: k });
        }}>
        {KINDS.map(k => <option key={k} value={k}>{RULE_LABEL[k]}</option>)}
      </select>
      {(rule.kind === 'before' || rule.kind === 'from' || rule.kind === 'between') && yr(a, setA, 'a')}
      {rule.kind === 'between' && <>and {yr(b, setB, 'b')}</>}
    </span>
  );
}

function ModeToggle({ mode, onMode, disabled, label }: { mode: 'suggest' | 'always'; onMode: (m: 'suggest' | 'always') => void; disabled: boolean; label: string }) {
  return (
    <span role="radiogroup" aria-label={`${label}: suggest or always add`} className="inline-flex overflow-hidden rounded-lg border border-hairline text-xs">
      {(['suggest', 'always'] as const).map(m => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={disabled} onClick={() => { if (mode !== m) onMode(m); }}
          className={`px-2.5 py-1 ${mode === m ? 'bg-accent/15 font-semibold text-accent' : 'text-body'} disabled:opacity-50`}>{m === 'suggest' ? 'Suggest' : 'Always add'}</button>
      ))}
    </span>
  );
}

function Wording({ text, onText, disabled, label }: { text: string; onText: (t: string) => void; disabled: boolean; label: string }) {
  const [v, setV] = useState(text);
  return (
    <textarea value={v} disabled={disabled} rows={3} maxLength={2000} aria-label={`${label} report wording`} onChange={e => setV(e.target.value)}
      onBlur={() => { if (!v.trim()) { setV(text); return; } if (v.trim() !== text) onText(v.trim()); }}
      className={`${field} mt-2 w-full py-1.5 text-sm`} />
  );
}

function AddOwn({ value, onChange, disabled, suggest }: { value: Advisory[]; onChange: (l: Advisory[]) => void; disabled: boolean; suggest: boolean }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Advisory['kind']>('recommendation');
  const [text, setText] = useState('');
  const [rule, setRule] = useState<Rule>({ kind: 'before', a: 1980 });
  const [mode, setMode] = useState<'suggest' | 'always'>('suggest');
  const [opened, setOpened] = useState(false);
  const add = () => { const a = newAdvisory(value, name, kind, text, rule, mode); if (!a) return; onChange([...value, a]); setName(''); setText(''); setOpened(false); };
  if (!opened) return (
    <button type="button" disabled={disabled} className="w-full border-t border-dashed border-hairline px-3 py-2 text-left text-sm text-muted hover:text-ink" onClick={() => setOpened(true)}>+ Add your own advisory</button>
  );
  return (
    <div className="space-y-2 border-t border-dashed border-hairline px-3 py-3" aria-label="Add your own advisory">
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={e => setName(e.target.value)} disabled={disabled} placeholder="Name (e.g. Aluminum branch wiring)" aria-label="Advisory name" className={`${field} min-w-[12rem] flex-1 py-1.5 text-sm`} />
        <select value={kind} onChange={e => setKind(e.target.value as Advisory['kind'])} disabled={disabled} aria-label="Advisory kind" className={`${inline} py-1.5 text-sm`}>
          <option value="recommendation">Recommendation</option><option value="limitation">Limitation</option>
        </select>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} disabled={disabled} rows={2} maxLength={2000} placeholder="The sentence the report prints"
        aria-label="Advisory report sentence" className={`${field} w-full py-1.5 text-sm`} />
      <div className="flex flex-wrap items-center gap-2">
        {suggest && <RulePicker rule={rule} onRule={setRule} disabled={disabled} label="New advisory" />}
        {suggest && <ModeToggle mode={mode} onMode={setMode} disabled={disabled || rule.kind === 'never'} label="New advisory" />}
        <span className="flex-1" />
        <button type="button" className={btn.ghost + ' px-3 py-1.5 text-xs'} onClick={() => setOpened(false)}>Cancel</button>
        <button type="button" className={btn.secondary + ' px-3 py-1.5 text-xs'} disabled={disabled || !name.trim() || !text.trim()} onClick={add}>Add</button>
      </div>
    </div>
  );
}
