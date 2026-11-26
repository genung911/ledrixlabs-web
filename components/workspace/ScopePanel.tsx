'use client';

// The Scope checklist on an inspection (2026-11-02, mockup "Website Scope Checklist", owner-approved). Systems down the
// left; one system's checklist on the right, a row per item: Satisfactory or a Limitation (picking one replaces the
// other), the spec fields as chips where more than one can apply, and the item's findings and photos. A pick saves on
// click, through the phones' own server function and rules (lib/scope). Someone else's section, a job you are not on,
// or your phone holding the job is view only and says why.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Empty, Loading, formatWhen } from './ui';
import type { EditLock } from './FindingEditor';
import { gateOfRow, gateRowAction, gateStoreKey } from '@/lib/scope/core/taxonomy/gates';
import { buildScope, gatesOfTemplate, locateItem, otherBuildingsOf, type OtherBuilding, holderOf, sectionAccess, valueId, valueMapOf, type Utilities, type AreaLimitView, type ScopeRow, type ServerValue, type SpecField, type TeamLike, type ValueMap } from '@/lib/scope/model';
import { loadHouseFacts, loadTemplate, loadUtilities, loadValues, putValue } from '@/lib/scope/api';
import { CONDITION_OK, joinSpecPicks, limitationReasonOf, nextConditionValues } from '@/lib/scope/core/taxonomy/scopeRules';
import type { TemplateNode } from '@/lib/scope/core/templates/InspectionTemplate';

type Counts = { findings: Record<string, number>; photos: Record<string, number> };
type Props = { inspectionId: string; team: TeamLike; names: Record<string, string>; lock: EditLock; counts: Counts; onOpenFindings: () => void; onOpenPhotos: () => void;
  /** Opened from a Seal & send item (owner 2026-11-04): open its system, scroll to its row, mark it. */
  focus?: { nodeId: string; n: number } | null; onBackToSeal?: () => void;
  /** The phone's list around the systems (website Apple pass batch 1, owner 2026-11-25): Before you start on top, Findings
   *  and Review & send below. Each opens its own section of the inspection page. */
  around?: { factsLeft?: number; onFacts: () => void; findings: { total: number; review: number }; onFindings: () => void; onSeal: () => void } };

export function ScopePanel({ inspectionId, team, names, lock, counts, onOpenFindings, onOpenPhotos, focus, onBackToSeal, around }: Props) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; template: { systems?: TemplateNode[] } | null; values: ValueMap; utilities: Utilities; house: Record<string, unknown> | null; others: OtherBuilding[] }>({ kind: 'loading' });
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'warn' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [limitFor, setLimitFor] = useState<string | null>(null);
  // One answer per row (Apple pass batch 1): a row shows its answer; tapping it opens its choices inline.
  const [rowOpen, setRowOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [template, rows, utilities, house] = await Promise.all([loadTemplate(inspectionId), loadValues(inspectionId), loadUtilities(inspectionId), loadHouseFacts(inspectionId)]);
      setState({ kind: 'ready', template: template as { systems?: TemplateNode[] } | null, values: valueMapOf(rows), utilities, house, others: otherBuildingsOf(template as { buildings?: unknown } | null, rows) });
    } catch (e) { setState({ kind: 'error', message: e instanceof Error ? e.message : 'The checklist could not be loaded.' }); }
  }, [inspectionId]);
  useEffect(() => { void load(); }, [load]);

  const view = useMemo(() => state.kind === 'ready'
    // The main building's checklist (other buildings are listed apart): the house facts decide its items, as on the phone.
    ? buildScope(state.template, state.values, { findings: id => counts.findings[id] ?? 0, photos: id => counts.photos[id] ?? 0 }, state.utilities, { extras: state.house, inMain: true })
    : null, [state, counts]);

  // A Seal & send item: open its system once the checklist is loaded, then bring its row into view and mark it.
  const [marked, setMarked] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!focus || !view) return;
    const at = locateItem(view, focus.nodeId);
    setMissing(!at?.rowId);
    if (!at) return;
    setOpen(at.systemId); setNote(null); setLimitFor(null); setMarked(at.rowId);
    if (!at.rowId) return;
    const t = setTimeout(() => document.getElementById(`scope-row-${at.rowId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n, !!view]);

  if (state.kind === 'loading') return <Card className="xl:col-span-2"><Loading label="Loading the checklist…" /></Card>;
  if (state.kind === 'error') return <Card className="xl:col-span-2"><Empty>{state.message}</Empty></Card>;
  if (!state.template || !view || !view.systems.length) return (
    <Card title="Scope" className="xl:col-span-2"><div className="p-4"><Banner tone="warn"><b>This job’s checklist is still only on the phone.</b> Open the job on that phone once, with a connection, and it appears here.</Banner></div></Card>
  );

  const current = view.systems.find(s => s.node.id === open) ?? view.systems[0];
  const access = sectionAccess(team, current.section);
  const holder = holderOf(team, current.section);
  const first = (id: string | null) => (id && names[id]?.split(/\s+/)[0]) || 'Someone';
  const editable = access === 'edit' && !lock.heldBy;

  const save = async (row: ScopeRow, kind: 'condition' | 'spec', key: string, section: string | null, value: Record<string, unknown>, seq: number | null, label: string) => {
    setBusy(`${kind}|${key}`); setNote(null);
    try {
      const lease = await lock.ensure();
      if (!lease) return;
      const r = await putValue(inspectionId, { key, kind, section, value, baseSeq: seq });
      if (r.kind === 'saved') {
        setState(s => {
          if (s.kind !== 'ready') return s;
          const m = new Map(s.values);
          m.set(valueId(kind, key), { structure_id: 'main', node_key: key, kind, section_key: section, value, updated_by: team?.me ?? null, updated_at: new Date().toISOString(), seq: r.seq } as ServerValue);
          return { ...s, values: m };
        });
      } else if (r.kind === 'refused' && r.reason === 'changed') {
        const rows = await loadValues(inspectionId).catch(() => null);
        const newer = rows?.find(x => x.kind === kind && x.node_key === key && (x.structure_id || 'main') === 'main');
        if (rows) setState(s => s.kind === 'ready' ? { ...s, values: valueMapOf(rows) } : s);
        setNote({ tone: 'warn', text: `${first(newer?.updated_by ?? null)} changed ${label} on their phone. Your pick wasn’t saved. Theirs is showing now.` });
      } else if (r.kind === 'refused') {
        setNote({ tone: 'bad', text: r.reason === 'not_your_section' ? 'This section belongs to someone else on the team. Only they or the lead can change it.' : 'The server didn’t take that pick. Reload and try again.' });
      } else setNote({ tone: 'bad', text: r.message });
    } finally { setBusy(null); }
  };

  const tapOk = (row: ScopeRow) => row.condition && save(row, 'condition', row.condition.key, row.section,
    { label: row.node.label, values: nextConditionValues(row.condition.values, { ok: true }) }, row.condition.seq, row.node.label);
  const tapLimitation = (row: ScopeRow, reason: string) => {
    setLimitFor(null);
    if (!row.condition) return;
    const before = row.condition.values, after = nextConditionValues(row.condition.values, { limitation: reason });
    void save(row, 'condition', row.condition.key, row.section, { label: row.node.label, values: after }, row.condition.seq, row.node.label)
      .then(() => gateFollow(row, before, after));
  };
  // A GATE's row (owner 2026-11-03: "No Access" on Crawlspace / Attic Access, Roof not inspected, the panel's dead front):
  // the same edge rule the phone runs (gates.gateRowAction) stores or takes back the gate's REMOVE, so the website and
  // the phone remove the same items.
  const gateFollow = async (row: ScopeRow, before: string[], after: string[]) => {
    if (state.kind !== 'ready') return;
    const gate = gateOfRow(gatesOfTemplate(state.template as any), row.node.id);
    if (!gate) return;
    const key = `system:${gateStoreKey(gate)}`;
    const cur = state.values.get(`limitation|${key}`);
    const act = gateRowAction(gate, before, after, (cur?.value as { cause?: string } | null) ?? null);
    if (!act) return;
    const r = await putValue(inspectionId, { key, kind: 'limitation', section: row.section,
      value: act.act === 'set' ? { cause: act.cause, at: new Date().toISOString(), kind: 'not_inspected' } : null, baseSeq: cur?.seq ?? null });
    if (r.kind === 'saved') await load();
  };
  const tapSpec = (row: ScopeRow, f: SpecField, option: string) => {
    const picked = f.picked.includes(option) ? f.picked.filter(p => p !== option) : [...f.picked, option];
    const prev = (state.kind === 'ready' ? state.values.get(valueId('spec', f.key))?.value : null) ?? {};
    void save(row, 'spec', f.key, f.section, { ...prev, label: f.label, value: joinSpecPicks(picked) }, f.seq, f.label);
  };

  // ── WEBSITE APPLE PASS, BATCH 1 (owner 2026-11-25, approval pack item 9, mockup Q4pK5k7BYeLdnWWrpRYYK6 #i9) ─────────────
  // The phone's style: sentence case, grouped rows, one answer per row, the same words. The systems down the left like the
  // phone's tiles, each with where it stands; the open system on the right as two groups — Details (the spec fields, the
  // type first) and Condition (Satisfactory, a limitation or its findings). A row opens its choices in place.
  const statusOf = (sys: typeof current): { text: string; tone: 'ok' | 'warn' | 'todo' } => {
    const f = sys.tiles.reduce((n, t) => n + t.rows.reduce((m, r) => m + r.findings, 0), 0);
    if (f) return { text: `${f} finding${f === 1 ? '' : 's'}`, tone: 'warn' };
    const left = sys.total - sys.done;
    return left > 0 ? { text: `${left} to answer`, tone: 'todo' } : { text: 'All OK', tone: 'ok' };
  };
  const tone = (t: 'ok' | 'warn' | 'todo') => t === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : t === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-muted';
  const listRow = (key: string, label: string, right: React.ReactNode, onClick: () => void, on = false) => (
    <button key={key} type="button" onClick={onClick} aria-current={on ? 'true' : undefined}
      className={`flex w-full min-w-0 items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm ${on ? 'bg-accent/10' : 'hover:bg-ink/5'}`}>
      <span className={`min-w-0 truncate ${on ? 'font-semibold text-accent-ink' : 'text-ink'}`}>{label}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs">{right}<span aria-hidden className="text-muted">›</span></span>
    </button>
  );
  const allRows = current.tiles.flatMap(t => t.rows.map(r => ({ tile: t, row: r })));
  // Details: every spec field, a row each — the type rows first (type-first, w16), then the rest in the checklist's order.
  const typeFirst = (f: SpecField) => (/\btype\b/i.test(`${f.attr.label} ${f.attr.id ?? ''}`) ? 0 : 1);
  const details = allRows.flatMap(({ tile, row }) => row.specs.map(f => ({ tile, row, f })))
    .map((x, n) => ({ ...x, n })).sort((a, b) => typeFirst(a.f) - typeFirst(b.f) || a.n - b.n);
  const conditions = allRows.filter(({ row }) => !!row.condition);
  const condAnswer = (row: ScopeRow): { text: string; tone: 'ok' | 'warn' | 'todo' | 'limit' } => {
    if (row.findings > 0) return { text: `${row.findings} finding${row.findings === 1 ? '' : 's'}`, tone: 'warn' };
    const v = row.condition?.values ?? [];
    const lim = v.find(x => /\(limitation\)/i.test(x));
    if (lim) return { text: `Limited · ${limitationReasonOf(lim)}`, tone: 'limit' };
    if (v.includes(CONDITION_OK)) return { text: 'Satisfactory', tone: 'ok' };
    return { text: 'Not answered', tone: 'todo' };
  };
  const multiField = (row: ScopeRow) => row.specs.length > 1 || !!row.condition;
  // A Seal & send item's row, marked (2026-11-04).
  const markCls = (id: string) => marked === id ? 'ring-2 ring-inset ring-accent' : '';
  const groupCard = 'overflow-hidden rounded-xl border border-hairline bg-surface divide-y divide-hairline';

  return (
    <div className="grid grid-cols-1 gap-5 lg:col-span-1 xl:col-span-2 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="This inspection" className="flex flex-col gap-3">
        {around && (
          <div className={groupCard}>
            {listRow('facts', 'Before you start', around.factsLeft === undefined ? null
              : around.factsLeft > 0 ? <span className="text-amber-700 dark:text-amber-400">{around.factsLeft} to answer</span>
              : <span className="text-emerald-700 dark:text-emerald-400">Done ✓</span>, around.onFacts)}
          </div>
        )}
        <div className={groupCard}>
          {view.systems.map(sys => {
            const h = holderOf(team, sys.section);
            const theirs = team && h && h !== team.me && team.people.length > 1 ? ` · ${first(h)}` : '';
            const st = statusOf(sys);
            return listRow(sys.node.id, `${sentence(sys.node.label)}${theirs}`, <span className={tone(st.tone)}>{st.text}</span>,
              () => { setOpen(sys.node.id); setNote(null); setLimitFor(null); setRowOpen(null); }, current.node.id === sys.node.id);
          })}
        </div>
        {around && (
          <div className={groupCard}>
            {listRow('findings', 'Findings', <span className={around.findings.review ? 'text-amber-700 dark:text-amber-400' : 'text-muted'}>
              {around.findings.total}{around.findings.review ? ` · ${around.findings.review} to review` : ''}</span>, around.onFindings)}
            {listRow('seal', 'Review & send', null, around.onSeal)}
          </div>
        )}
        {state.others.length > 0 && (
          // THE OTHER BUILDINGS (step 3 F6, option A): read-only here; they are inspected and edited on the phone.
          <div className="hidden lg:block" aria-label="Other buildings">
            <p className="px-3.5 pb-1 text-xs text-muted">Other buildings</p>
            <div className={groupCard}>
              {state.others.map(b => (
                <div key={b.id} className="px-3.5 py-2 text-sm">
                  <span className="text-ink">{b.name}</span>
                  <span className="block text-xs text-muted">{b.systems.length} system{b.systems.length === 1 ? '' : 's'} · {b.answered} answer{b.answered === 1 ? '' : 's'} · edited on the phone</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-ink">{sentence(current.node.label)}</h2>
            {team && team.people.length > 1 && holder && <span className="rounded-full bg-ground px-2.5 py-0.5 text-xs font-semibold text-body">{first(holder)}{holder === team.lead ? ' · lead' : ''}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">{current.done} of {current.total} answered
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-hairline"><span className="block h-full bg-emerald-600" style={{ width: `${current.total ? Math.round(100 * current.done / current.total) : 0}%` }} /></span>
          </div>
        </div>

        <div className="space-y-2 empty:hidden">
          {access === 'not_on_job' && <Banner tone="info">You’re not on this job’s team. Its inspectors change its checklist, on the phone or here.</Banner>}
          {access === 'not_yours' && <Banner tone="info"><b>{sentence(current.node.label)} is {first(holder)}’s section.</b> You can see it. {first(holder)} or the lead changes it.</Banner>}
          {access === 'edit' && lock.heldBy && (
            <Banner tone="info"><b>{lock.heldBy} is editing this job.</b> The website is view only while it is. Edit here instead and the phone becomes view only until it takes the job back.
              <div className="mt-2"><button type="button" disabled={!!busy} onClick={() => { setBusy('move'); void lock.moveHere().finally(() => setBusy(null)); }}
                className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50">{busy === 'move' ? 'Moving…' : 'Edit here instead'}</button></div></Banner>
          )}
          {lock.error && access === 'edit' && <Banner tone="bad">{lock.error}</Banner>}
          {focus && onBackToSeal && (
            <Banner tone="info">{missing ? <><b>That item isn’t on this list here.</b> It may be set on the phone.</> : <>Fix the highlighted item, then go back to seal.</>}
              <button type="button" onClick={onBackToSeal} className="ml-2 text-xs font-semibold text-accent-ink hover:underline">‹ Back to Review &amp; send</button></Banner>
          )}
          {note && <Banner tone={note.tone}>{note.text}</Banner>}
          {current.limit && <AreaLimit limit={current.limit} />}
          {current.tiles.map(t => t.limit ? <AreaLimit key={t.node.id} limit={t.limit} /> : null)}
          {(current.gates ?? []).map((g, i) => <Banner key={i} tone={g.tone === 'info' ? 'info' : 'warn'}><b>{g.head}</b> <span className="mt-1 block text-xs text-body">{g.text}</span></Banner>)}
        </div>

        {details.length > 0 && (
          <section aria-label="Details">
            <h3 className="px-1 pb-1.5 text-sm text-muted">Details</h3>
            <ul className={groupCard}>
              {details.map(({ row, f }) => {
                const id = `spec:${f.key}`, isOpen = rowOpen === id;
                const label = multiField(row) ? `${sentence(row.node.label)} · ${sentence(f.attr.label)}` : sentence(row.node.label);
                return (
                  <li key={id} id={`scope-row-${row.node.id}`} className={`scroll-mt-24 ${markCls(row.node.id)}`}>
                    <button type="button" onClick={() => setRowOpen(isOpen ? null : id)} aria-expanded={isOpen}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left text-sm ${isOpen ? 'bg-accent/5' : 'hover:bg-ink/5'}`}>
                      <span className="min-w-0 text-ink">{label}</span>
                      <span className={`max-w-[18rem] truncate text-right ${f.picked.length ? 'text-body' : 'text-muted'}`}>{f.picked.length ? f.picked.join(', ') : 'Not answered'}</span>
                    </button>
                    {isOpen && (
                      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                        {f.options.map(o => (
                          <button key={o} type="button" disabled={!editable || busy === `spec|${f.key}`} onClick={() => tapSpec(row, f, o)} aria-pressed={f.picked.includes(o)}
                            className={`rounded-full border px-3 py-1 text-sm ${f.picked.includes(o) ? 'border-accent bg-accent font-semibold text-white' : 'border-hairline text-ink hover:bg-ink/5'} disabled:cursor-default disabled:opacity-60`}>{f.picked.includes(o) ? `✓ ${o}` : o}</button>
                        ))}
                        {f.picked.filter(p => !f.options.includes(p)).map(p => <span key={p} className="rounded-full border border-accent bg-accent/10 px-3 py-1 text-sm text-ink">{p}</span>)}
                        {!editable && <span className="basis-full text-xs text-muted">View only.</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {conditions.length > 0 && (
          <section aria-label="Condition">
            <h3 className="px-1 pb-1.5 text-sm text-muted">Condition</h3>
            <ul className={groupCard}>
              {conditions.map(({ row }) => {
                const id = `cond:${row.node.id}`, isOpen = rowOpen === id, a = condAnswer(row);
                const cls = a.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : a.tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : a.tone === 'limit' ? 'text-violet-700 dark:text-violet-300' : 'text-muted';
                return (
                  <li key={id} id={details.some(d => d.row.node.id === row.node.id) ? undefined : `scope-row-${row.node.id}`} className={`scroll-mt-24 ${markCls(row.node.id)}`}>
                    <button type="button" onClick={() => { setRowOpen(isOpen ? null : id); setLimitFor(null); }} aria-expanded={isOpen}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left text-sm ${isOpen ? 'bg-accent/5' : 'hover:bg-ink/5'}`}>
                      <span className="min-w-0 text-ink">{sentence(row.node.label)}</span>
                      <span className={`max-w-[18rem] truncate text-right ${cls}`}>{a.text}</span>
                    </button>
                    {isOpen && (
                      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
                        <ConditionPicks row={row} editable={editable} busy={busy === `condition|${row.condition!.key}`} onOk={() => tapOk(row)}
                          limitOpen={limitFor === row.node.id} onLimit={() => setLimitFor(x => x === row.node.id ? null : row.node.id)} onReason={r => tapLimitation(row, r)} />
                        {row.findings > 0 && <button type="button" onClick={onOpenFindings} className="rounded-full bg-amber-600/10 px-3 py-1 text-sm text-ink">{row.findings} finding{row.findings === 1 ? '' : 's'} ›</button>}
                        {row.photos > 0 && <button type="button" onClick={onOpenPhotos} className="rounded-full bg-ground px-3 py-1 text-sm text-body">{row.photos} photo{row.photos === 1 ? '' : 's'} ›</button>}
                        {row.last?.by && row.last.by !== holderOf(team, row.section) && <span className="text-xs text-muted">{first(row.last.by)} · {formatWhen(row.last.at)}</span>}
                        {!editable && <span className="basis-full text-xs text-muted">View only.</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <p className="px-1 text-xs text-muted">Saved as you go. Phones on the job get it the next time they sync. Findings and photos are added on the phone.</p>
      </div>
    </div>
  );
}

function ConditionPicks({ row, editable, busy, onOk, limitOpen, onLimit, onReason }: {
  row: ScopeRow; editable: boolean; busy: boolean; onOk: () => void; limitOpen: boolean; onLimit: () => void; onReason: (r: string) => void;
}) {
  const c = row.condition!;
  const ok = c.values.length === 1 && c.values[0] === CONDITION_OK;
  const limited = c.values.find(v => /\(limitation\)/i.test(v));
  const noOk = row.findings > 0;   // Satisfactory is off while the item has a finding, as on the phone
  return (
    <>
      <button type="button" disabled={!editable || busy || (noOk && !ok)} onClick={onOk} aria-pressed={ok} title={noOk ? 'Satisfactory is off while the item has a finding' : undefined}
        className={`rounded-full border px-3 py-1 text-sm ${ok ? 'border-emerald-600 bg-emerald-600/10 font-semibold text-ink' : 'border-hairline text-ink hover:bg-ground'} disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent`}>{ok ? '✓ Satisfactory' : 'Satisfactory'}</button>
      {limited
        ? <button type="button" disabled={!editable || busy} onClick={onLimit} className="rounded-full border border-violet-500 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-ink disabled:cursor-default">Limitation: {limitationReasonOf(limited)}</button>
        : <button type="button" disabled={!editable || busy} onClick={onLimit} aria-expanded={limitOpen} className="rounded-full border border-dashed border-violet-500 px-3 py-1 text-sm text-violet-700 hover:bg-violet-500/5 disabled:cursor-default disabled:opacity-60 dark:text-violet-300">Limitation ▾</button>}
      {limitOpen && editable && (
        <span className="basis-full">
          <span className="mt-1 flex flex-col items-start gap-1 rounded-lg bg-violet-500/5 p-2">
            {c.reasons.map(r => <button key={r} type="button" onClick={() => onReason(r)} className="rounded-full border border-dashed border-violet-500 px-2.5 py-1 text-xs text-violet-700 hover:bg-violet-500/10 dark:text-violet-300">{r}</button>)}
          </span>
        </span>
      )}
    </>
  );
}

/** A whole-area limitation (Crawlspace, Basement, Attic — set on the phone, owner 2026-11-03): why, and the items it
 *  covers, which are not on the checklist or in the count. */
function AreaLimit({ limit }: { limit: AreaLimitView }) {
  return (
    <Banner tone="warn"><b>{limit.label} limited:</b> {limit.cause}
      {limit.covered.length > 0 && <span className="mt-1 block text-xs text-body">{limit.covered.length} item{limit.covered.length === 1 ? '' : 's'} covered, not counted: {limit.covered.join(', ')}. Change it on the phone.</span>}
    </Banner>
  );
}

function Banner({ tone, children }: { tone: 'info' | 'warn' | 'bad'; children: React.ReactNode }) {
  const cls = tone === 'warn' ? 'bg-amber-600/10' : tone === 'bad' ? 'bg-safety/10' : 'bg-accent/10';
  return <div role="status" className={`rounded-xl px-3 py-2.5 text-sm text-ink ${cls}`}>{children}</div>;
}

/** Sentence case, the phone's voice (Apple pass): "WATER HEATER" / "Water Heater" → "Water heater"; known acronyms stay. */
const ACRONYMS = /\b(hvac|gfci|afci|tpr|pex|abs|pvc|cpvc|csst|ac|ul|led)\b/gi;
const sentence = (s: string) => { const t = String(s ?? '').trim().toLowerCase(); return (t.charAt(0).toUpperCase() + t.slice(1)).replace(ACRONYMS, m => m.toUpperCase()); };
