'use client';

// Before you start on the website (owner 2026-11-14, mockup 4NAix7t4exh6Lg9CymodEP → "Approved"). "This house has": the
// house facts the phone asks first, in its order and groups, each answer with Change. Change opens the phone's own choices
// inline — pick every one where the phone allows several, None where it offers it, "No gas service" / "No garage" alone —
// and Save writes the same record the phone and Inspection Details use (lib/houseFacts). A change that would take an item
// with recorded work off the checklist is refused and named, as on the phone. Backup heat shows only while What heats
// names a heat pump or a mini-split. View only for someone not on the job, or while one of your phones holds it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Empty, Loading } from './ui';
import type { EditLock } from './FindingEditor';
import { loadTemplate, loadValues, putValue } from '@/lib/scope/api';
import { valueId, valueMapOf, type ServerValue, type ValueMap } from '@/lib/scope/model';
import { loadFactsRow, saveFactColumn, saveFactColumns } from '@/lib/houseFacts/api';
import { blockedBy, blockedSentence, factsView, nextAnswer, picksOf, NONE_ANSWER, WEATHER_OPTIONS, GROUND_OPTIONS, OCCUPANCY_OPTIONS, UTILITY_STATE_OPTIONS, visitHasGas, type FactView, type FactsRow } from '@/lib/houseFacts/model';
import type { TemplateNode } from '@/lib/scope/core/templates/InspectionTemplate';
import { conditionValues } from '@/lib/scope/model';
import { sectionsOfTemplate } from '@/lib/scope/core/taxonomy/scopeRules';
import { applianceItems, applianceStates, applianceTap, appliancesDisplay, type ApplianceState } from '@/lib/scope/core/taxonomy/appliancesHere';

type Props = { inspectionId: string; lock: EditLock; canEdit: boolean; findings: Record<string, number>;
  /** The menu's count follows what is still unanswered. */
  onLeft?: (n: number) => void };

export function HouseFactsPanel({ inspectionId, lock, canEdit, findings, onLeft }: Props) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; systems: TemplateNode[]; values: ValueMap; row: FactsRow | null }>({ kind: 'loading' });
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<{ tone: 'warn' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // THIS VISIT (z22): a page's own answers, column by column, while it is open.
  const [visit, setVisit] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [template, rows, row] = await Promise.all([loadTemplate(inspectionId), loadValues(inspectionId), loadFactsRow(inspectionId)]);
      setState({ kind: 'ready', systems: ((template?.systems ?? []) as TemplateNode[]), values: valueMapOf(rows), row });
    } catch (e) { setState({ kind: 'error', message: e instanceof Error ? e.message : 'The house facts could not be loaded.' }); }
  }, [inspectionId]);
  useEffect(() => { void load(); }, [load]);

  const views = useMemo(() => (state.kind === 'ready' && state.row ? factsView(state.systems, state.values, state.row) : []), [state]);
  // APPLIANCES COUNT AS A QUESTION (w22, 2026-11-23 — the phone's BeforeYouStart): answered once `appliances_asked` is
  // stamped, by the phone's Continue or by closing the Appliances row here.
  const applianceCount = state.kind === 'ready' ? applianceItems(state.systems).length : 0;
  const appliancesAnswered = state.kind === 'ready' && !!state.row?.appliances_asked?.trim();
  const asked = views.length + (applianceCount ? 1 : 0);
  const left = views.filter(v => !v.value).length + (applianceCount && !appliancesAnswered ? 1 : 0);
  useEffect(() => { if (state.kind === 'ready') onLeft?.(left); }, [left, state.kind]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (state.kind === 'loading') return <Card className="xl:col-span-2"><Loading label="Loading the house facts…" /></Card>;
  if (state.kind === 'error') return <Card className="xl:col-span-2"><Empty>{state.message}</Empty></Card>;
  if (!state.row) return <Card title="Before you start" className="xl:col-span-2"><Empty>This job isn’t on the server yet.</Empty></Card>;
  const row = state.row;
  const editable = canEdit && !lock.heldBy;

  const start = (v: FactView) => {
    setOpen(v.fact.id); setDraft(v.value); setNote(null);
    const c = (k: keyof FactsRow) => String(row[k] ?? '');
    if (v.target.kind === 'visit') setVisit(v.target.id === 'weather' ? { weather: c('weather'), ground: c('ground') }
      : v.target.id === 'occupancy' ? { occupancy: c('occupancy') }
      : { water_state: c('water_state'), power_state: c('power_state'), ...(visitHasGas(row) ? { gas_state: c('gas_state') } : {}) });
  };
  /** A visit page's Save: its columns together. The weather Save is the inspector confirming it (the phone's Continue). */
  const saveVisit = async (v: FactView) => {
    if (v.target.kind !== 'visit') return;
    const patch: Record<string, string | null> = Object.fromEntries(Object.entries(visit).map(([k, x]) => [k, x || null]));
    if (v.target.id === 'weather' && visit.weather) {
      Object.assign(patch, { weather_confirmed_at: new Date().toISOString(), weather_confirmed_weather: visit.weather,
        weather_confirmed_temp_f: row.temp_f != null && String(row.temp_f).trim() ? String(row.temp_f) : null });
    }
    setBusy(true); setNote(null);
    try {
      const lease = await lock.ensure();
      if (!lease) return;
      const r = await saveFactColumns(row, patch, lease);
      if (r.kind === 'saved') { setState(s => s.kind === 'ready' ? { ...s, row: r.row } : s); setOpen(null); }
      else if (r.kind === 'changed') { setState(s => s.kind === 'ready' ? { ...s, row: r.row } : s); setNote({ tone: 'warn', text: `${v.fact.label} changed on a phone first. Your change wasn’t saved. Theirs is showing now.` }); setOpen(null); }
      else if (r.kind === 'locked') { lock.lost(); setNote({ tone: 'warn', text: 'Your phone has this job open. Use “Edit here instead” to change it here.' }); }
      else setNote({ tone: 'bad', text: r.message });
    } finally { setBusy(false); }
  };
  const save = async (v: FactView) => {
    if (v.target.kind === 'visit') return saveVisit(v);
    if (draft === v.value) { setOpen(null); return; }
    const blocked = blockedBy(v, draft, state.systems, state.values, row, id => findings[id] ?? 0);
    if (blocked.length) { setNote({ tone: 'bad', text: blockedSentence(blocked) }); return; }
    setBusy(true); setNote(null);
    try {
      const lease = await lock.ensure();
      if (!lease) return;
      if (v.target.kind === 'extras') {
        const r = await saveFactColumn(row, v.target.column, draft || null, lease);
        if (r.kind === 'saved') { setState(s => s.kind === 'ready' ? { ...s, row: r.row } : s); setOpen(null); }
        else if (r.kind === 'changed') { setState(s => s.kind === 'ready' ? { ...s, row: r.row } : s); setNote({ tone: 'warn', text: `${v.fact.label} changed on a phone first. Your change wasn’t saved. Theirs is showing now.` }); setOpen(null); }
        else if (r.kind === 'locked') { lock.lost(); setNote({ tone: 'warn', text: 'Your phone has this job open. Use “Edit here instead” to change it here.' }); }
        else setNote({ tone: 'bad', text: r.message });
        return;
      }
      const t = v.target;
      if (t.kind !== 'spec') return;
      const prev = (state.values.get(valueId('spec', t.key))?.value as Record<string, unknown> | null) ?? {};
      const value = { ...prev, label: (prev as { label?: string }).label ?? `${t.node.label}`, value: draft };
      const r = await putValue(inspectionId, { key: t.key, kind: 'spec', section: t.section, value, baseSeq: t.seq });
      if (r.kind === 'saved') {
        setState(s => {
          if (s.kind !== 'ready') return s;
          const m = new Map(s.values);
          m.set(valueId('spec', t.key), { structure_id: 'main', node_key: t.key, kind: 'spec', section_key: t.section, value, updated_by: null, updated_at: new Date().toISOString(), seq: r.seq } as ServerValue);
          return { ...s, values: m };
        });
        setOpen(null);
      } else if (r.kind === 'refused' && r.reason === 'changed') {
        await load(); setOpen(null);
        setNote({ tone: 'warn', text: `${v.fact.label} changed on a phone first. Your change wasn’t saved. Theirs is showing now.` });
      } else if (r.kind === 'refused') {
        setNote({ tone: 'bad', text: r.reason === 'not_your_section' ? 'This section belongs to someone else on the team. Only they or the lead can change it.' : 'The server didn’t take that change. Reload and try again.' });
      } else setNote({ tone: 'bad', text: r.message });
    } finally { setBusy(false); }
  };

  // "WHICH APPLIANCES ARE HERE?" (2026-11-15, the phone's Option A — appliancesHere.ts): each appliance not here carries its
  // row's "Not Present" limitation, saved the way the Scope panel saves a row; recorded work is never overwritten.
  const appliances = applianceStates(applianceItems(state.systems), id => conditionValues(state.values, id), id => findings[id] ?? 0);
  const applianceSectionOf = sectionsOfTemplate(state.systems);
  const tapAppliance = async (st: ApplianceState) => {
    const next = applianceTap(st, conditionValues(state.values, st.item.id));
    if (!next) { if (st.locked) setNote({ tone: 'warn', text: `${st.item.label} has ${st.locked}, so it stays on the checklist.` }); return; }
    setBusy(true); setNote(null);
    try {
      const lease = await lock.ensure();
      if (!lease) return;
      const key = st.item.id, section = applianceSectionOf(key);
      const value = { label: st.item.label, values: next };
      const r = await putValue(inspectionId, { key, kind: 'condition', section, value, baseSeq: state.values.get(valueId('condition', key))?.seq ?? null });
      if (r.kind === 'saved') setState(s => {
        if (s.kind !== 'ready') return s;
        const m = new Map(s.values);
        m.set(valueId('condition', key), { structure_id: 'main', node_key: key, kind: 'condition', section_key: section, value, updated_by: null, updated_at: new Date().toISOString(), seq: r.seq } as ServerValue);
        return { ...s, values: m };
      });
      else if (r.kind === 'refused' && r.reason === 'changed') { await load(); setNote({ tone: 'warn', text: `${st.item.label} changed on a phone first. Theirs is showing now.` }); }
      else if (r.kind === 'refused') setNote({ tone: 'bad', text: r.reason === 'not_your_section' ? 'This section belongs to someone else on the team. Only they or the lead can change it.' : 'The server didn’t take that change. Reload and try again.' });
      else setNote({ tone: 'bad', text: r.message });
    } finally { setBusy(false); }
  };
  /** Closing the opened Appliances row answers the question, as Continue does on the phone: what is lit is here, each one
   *  off is already marked Not present on its row. Stamped once; an answered job is left alone. */
  const stampAppliances = async () => {
    if (appliancesAnswered || !applianceCount) return;
    setBusy(true);
    try {
      const lease = await lock.ensure(); if (!lease) return;
      const r = await saveFactColumn(row, 'appliances_asked', new Date().toISOString(), lease);
      if (r.kind === 'saved' || r.kind === 'changed') setState(s => s.kind === 'ready' ? { ...s, row: r.row } : s);
      else if (r.kind === 'locked') { lock.lost(); setNote({ tone: 'warn', text: 'Your phone has this job open. Use “Edit here instead” to change it here.' }); }
      else setNote({ tone: 'bad', text: r.message });
    } finally { setBusy(false); }
  };
  const appliancesOpen = open === 'appliances';
  const appliancesRow = appliances.length ? (
    <div className={`border-t border-hairline ${appliancesOpen ? 'bg-accent/10' : ''}`}>
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
        <span className="text-sm text-body">Appliances</span>
        <span className={`order-3 col-span-2 min-w-0 text-sm font-semibold sm:order-none sm:col-span-1 ${appliancesAnswered ? 'text-ink' : 'text-amber-700 dark:text-amber-400'}`}>{appliancesAnswered ? appliancesDisplay(appliances) : 'Not answered'}</span>
        {editable ? <button type="button" onClick={() => { if (appliancesOpen) { setOpen(null); void stampAppliances(); } else setOpen('appliances'); }} className="text-sm font-semibold text-accent-ink hover:underline">{appliancesOpen ? 'Close' : appliancesAnswered ? 'Change' : 'Answer'}</button> : <span />}
      </div>
      {appliancesOpen ? (
        <div className="px-4 pb-4">
          <p className="mb-2.5 text-sm text-body">Which appliances are here? Tap off any that aren’t. Each one off is marked Not present on its row.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Appliances">
            {appliances.map(st => (
              <button key={st.item.id} type="button" aria-pressed={st.here} disabled={busy || !!st.locked} onClick={() => void tapAppliance(st)}
                title={st.locked ? `Has ${st.locked}, so it stays` : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm disabled:opacity-60 ${st.here ? 'border-accent bg-accent font-semibold text-white' : 'border-dashed border-hairline bg-surface text-muted line-through'}`}>
                {st.here ? `✓ ${st.item.label}` : st.item.label}{st.locked ? ` · has ${st.locked}` : ''}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  const groups = [...new Set(views.map(v => v.group))];
  const chip = (on: boolean, extra = '') => `rounded-full border px-3 py-1.5 text-sm ${on ? 'border-accent bg-accent font-semibold text-white' : `border-hairline bg-surface text-ink hover:bg-ink/5 ${extra}`}`;
  return (
    <Card title="This house has" className="xl:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-4 py-2.5 text-xs text-muted">
        <span>{asked - left} of {asked} answered · Scope is built from these</span>
        {!canEdit ? <span>View only. You aren’t on this job.</span> : lock.heldBy ? <span>View only while {lock.heldBy} has this job open.</span> : null}
      </div>
      {note ? <div role="status" className={`mx-4 mt-3 rounded-xl px-3 py-2.5 text-sm text-ink ${note.tone === 'warn' ? 'bg-amber-600/10' : 'bg-safety/10'}`}>{note.text}</div> : null}
      {groups.map(g => (
        <div key={g}>
          <div className="px-4 pb-1.5 pt-4 font-mono text-[10.5px] font-bold tracking-[0.14em] text-muted">{g}</div>
          {views.filter(v => v.group === g).map(v => {
            const isOpen = open === v.fact.id;
            const picks = picksOf(v, isOpen ? draft : v.value);
            return (
              <div key={v.fact.id} className={`border-t border-hairline first:border-t-0 ${isOpen ? 'bg-accent/10' : ''}`}>
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
                  <span className="text-sm text-body">{v.fact.label}</span>
                  <span className={`order-3 col-span-2 min-w-0 text-sm font-semibold sm:order-none sm:col-span-1 ${v.display ? 'text-ink' : 'text-amber-700 dark:text-amber-400'}`}>{v.display || 'Not answered'}</span>
                  {editable ? (
                    <button type="button" onClick={() => (isOpen ? setOpen(null) : start(v))} className="text-sm font-semibold text-accent-ink hover:underline">
                      {isOpen ? 'Close' : v.display ? 'Change' : 'Answer'}
                    </button>
                  ) : <span />}
                </div>
                {isOpen && v.target.kind === 'visit' ? (() => {
                  const id = v.target.id;
                  const one = (col: string, opts: readonly string[], label: string) => (
                    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
                      {opts.map(o => { const on = visit[col] === o;
                        return <button key={o} type="button" aria-pressed={on} className={chip(on)} onClick={() => setVisit(d => ({ ...d, [col]: d[col] === o ? '' : o }))}>{on ? `✓ ${o}` : o}</button>; })}
                    </div>
                  );
                  const changed = Object.entries(visit).some(([k, x]) => x !== String(row[k as keyof FactsRow] ?? ''));
                  const ready = id === 'weather' ? !!visit.weather : id === 'occupancy' ? !!visit.occupancy : Object.values(visit).every(Boolean);
                  return (
                    <div className="px-4 pb-4">
                      <p className="mb-1 text-sm text-body">{v.fact.question ?? v.fact.label}</p>
                      {v.fact.hint ? <p className="mb-2.5 text-xs text-muted">{v.fact.hint}</p> : null}
                      {id === 'weather' ? <div className="flex flex-col gap-2.5">{one('weather', WEATHER_OPTIONS, 'Weather')}
                        <span className="text-xs font-semibold text-muted">Ground</span>{one('ground', GROUND_OPTIONS, 'Ground')}</div>
                        : id === 'occupancy' ? one('occupancy', OCCUPANCY_OPTIONS, 'Occupancy')
                        : <div className="flex flex-col gap-2">
                            {([['water_state', 'Water'], ...(visitHasGas(row) ? [['gas_state', 'Gas']] : []), ['power_state', 'Power']] as [string, string][]).map(([col, label]) => (
                              <div key={col} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2"><span className="text-sm text-ink">{label}</span>{one(col, UTILITY_STATE_OPTIONS, label)}</div>
                            ))}
                          </div>}
                      <div className="mt-3 flex justify-end gap-2">
                        <button type="button" onClick={() => setOpen(null)} className="rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm font-semibold text-ink hover:bg-ink/5">Cancel</button>
                        <button type="button" disabled={busy || !ready || (!changed && !(id === 'weather' && !row.weather_confirmed_at))} onClick={() => void saveVisit(v)}
                          className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : id === 'weather' && !changed ? 'Confirm' : 'Save'}</button>
                      </div>
                    </div>
                  );
                })() : isOpen ? (
                  <div className="px-4 pb-4">
                    <p className="mb-2.5 text-sm text-body">{v.fact.question ?? v.fact.label}{v.fact.multi ? ' Pick every one.' : ''}</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label={v.fact.label}>
                      {v.options.map(o => {
                        const on = picks.includes(o);
                        return <button key={o} type="button" aria-pressed={on} className={chip(on)} onClick={() => setDraft(d => nextAnswer(v, d, o))}>{on ? `✓ ${o}` : o}</button>;
                      })}
                      {v.absence ? (() => { const on = picks.includes(v.absence); const word = v.absence === 'None' ? 'No garage' : v.absence;
                        return <button type="button" aria-pressed={on} className={chip(on, 'border-dashed')} onClick={() => setDraft(d => nextAnswer(v, d, v.absence!))}>{on ? `✓ ${word}` : word}</button>; })() : null}
                      {v.allowsNone ? (() => { const on = picks.includes(NONE_ANSWER);
                        return <button type="button" aria-pressed={on} className={chip(on, 'border-dashed')} onClick={() => setDraft(d => nextAnswer(v, d, NONE_ANSWER))}>{on ? '✓ None, this house has none' : 'None, this house has none'}</button>; })() : null}
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button type="button" onClick={() => setOpen(null)} className="rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm font-semibold text-ink hover:bg-ink/5">Cancel</button>
                      <button type="button" disabled={busy || draft === v.value} onClick={() => void save(v)} className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {/* The appliances close the equipment questions, as on the phone. */}
          {g === 'EQUIPMENT TYPES' ? appliancesRow : null}
        </div>
      ))}
      <p className="border-t border-hairline px-4 py-2.5 text-xs text-muted">Saved to this job. The phone picks a change up on its next sync. A change that would take an item with recorded work off the checklist isn’t made, the same rule as on the phone.</p>
    </Card>
  );
}
