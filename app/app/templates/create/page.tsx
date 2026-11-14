'use client';

// Templates › New template — a guided page instead of the old dialog (2026-10-27).
//   Start → Company requirements → Starting point → Create draft → (Configure: the existing Template Builder)
// 2026-11-05 (owner rulings, mockup ED2sZJDGCViLHGs1wXjiDg): a Ledrix starting point also asks what kind of home the
// template is for (KindOfHome below) — each kind's checkpoints start ticked, Older / Log are "Also" picks, Condo offers
// the association pre-mark, and the New Construction card brings its ten; the draft is built by buildStarterTree.
// Owners and admins only (the same rule as the old "New template" button). Creating makes a PRIVATE DRAFT through
// lib/templates/api.startNewTemplateDraft — the same call the dialog made — and opens it in the Template Builder; it is
// never published here. The company's answers are its own declaration (lib/templates/startingPoints honesty rules):
// recommendations state facts only, requirements coverage reads "not evaluated", and no individual license is asked.
import { propertyTypesOf, type PropertyTypeId } from '@/lib/templateBuilder/core/propertyTypes';
import { PropertyTypePicker } from '@/components/templates/PropertyTypes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdvisoriesEditor } from '@/components/templates/AdvisoriesEditor';
import { presetAdvisories } from '@/lib/templates/advisoryModel';
import { LEDRIX_DEFAULT_STRUCTURE_TYPES, newStructureTypeId, seedStructureTypes } from '@/lib/templateBuilder/core/structureTypes';
import type { Advisory } from '@/lib/templates/reportAdvisories';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { ErrorBox, Loading, Page } from '@/components/workspace/ui';
import { Banner, Pill, btn, field, label } from '@/components/templates/ui';
import { canAuthorTemplates } from '@/lib/templateBuilder/access';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import {
  EMPTY_CONTEXT, detectBackend, listInspectionTypes, listTemplates, loadCompanyContext, saveCompanyContext, startNewTemplateDraft,
  type CompanyContext, type InspectionType, type LiveTemplate,
} from '@/lib/templates/api';
import {
  AFFILIATIONS, EMPTY_KIND_CHOICE, LICENSING, SERVICES, STANDARDS, US_STATES, asksKindOfHome, buildStarterTree, forkTree, kindPlan, labelOf, startingPoints,
  type KindChoice, type Option, type StartingPoint,
} from '@/lib/templates/startingPoints';
import { ALSO_KINDS, ASSOCIATION_SYSTEMS, SPECIAL_KINDS, starterCheckpoints } from '@/lib/templateBuilder/core/specialHomes';

type Loaded = {
  templates: LiveTemplate[]; types: InspectionType[];
  context: CompanyContext; rowVersion: number | null; contextSaving: 'server' | 'session';
  ledrixDefault: InspectionTemplate | null; ledrixFourPoint: InspectionTemplate | null;
};

export default function CreateTemplatePage() {
  const { access } = useWorkspace();
  const router = useRouter();
  const author = canAuthorTemplates(access.role);
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'blocked'; message: string } | { kind: 'ready'; data: Loaded }>({ kind: 'loading' });
  const [step, setStep] = useState(0);             // 0 = start, 1..3 = the steps above
  const [ctx, setCtx] = useState<CompanyContext>(EMPTY_CONTEXT);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [props, setProps] = useState<PropertyTypeId[] | null>(null);   // null = not touched: the starting point's own
  const [kindChoice, setKindChoice] = useState<Omit<KindChoice, 'propertyTypes'>>(EMPTY_KIND_CHOICE);
  const [busy, setBusy] = useState(false);
  const [advisories, setAdvisories] = useState<Advisory[]>(() => presetAdvisories());
  // Other buildings this template includes (2026-11-06): Ledrix's ids picked, and the company's own names.
  const [otherBuildings, setOtherBuildings] = useState<string[]>(['ledrix_garage', 'ledrix_shop', 'ledrix_adu']);
  const [ownBuildings, setOwnBuildings] = useState<string[]>([]);
  const [ownBuilding, setOwnBuilding] = useState('');
  const [suggestAdv, setSuggestAdv] = useState(true);   // "Should Ledrix suggest advisories from the home's details?"
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState(false);   // "+ Add a note" on the last screen (the notes field, folded away)

  const load = useCallback(async () => {
    if (!access.companyId) { setState({ kind: 'blocked', message: 'Your account is not part of a company yet.' }); return; }
    setState({ kind: 'loading' });
    try {
      if (await detectBackend() !== 'server') { setState({ kind: 'blocked', message: 'New templates turn on with the next Ledrix app update.' }); return; }
      const [templates, types, stored, def, four] = await Promise.all([
        listTemplates(access.companyId, 'server'), listInspectionTypes(access.companyId), loadCompanyContext(access.companyId),
        import('@/lib/templates/baselines/ledrixDefault.json').then(m => m.default as unknown as InspectionTemplate).catch(() => null),
        import('@/lib/templates/baselines/fourPoint.json').then(m => m.default as unknown as InspectionTemplate).catch(() => null),
      ]);
      const data: Loaded = {
        templates, types, ledrixDefault: def, ledrixFourPoint: four,
        context: stored && stored !== 'unavailable' ? stored.context : EMPTY_CONTEXT,
        rowVersion: stored && stored !== 'unavailable' ? stored.rowVersion : null,
        contextSaving: stored === 'unavailable' ? 'session' : 'server',
      };
      setCtx(data.context);
      setState({ kind: 'ready', data });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'This page could not be loaded.' });
    }
  }, [access.companyId]);
  useEffect(() => { load(); }, [load]);

  const data = state.kind === 'ready' ? state.data : null;
  const points = useMemo(() => (data ? startingPoints({ context: ctx, templates: data.templates, types: data.types, ledrixDefault: data.ledrixDefault, ledrixFourPoint: data.ledrixFourPoint }) : []), [data, ctx]);
  const chosen = points.find(p => p.key === picked) ?? null;
  useEffect(() => { if (!picked && points.length) setPicked((points.find(p => p.recommended) ?? null)?.key ?? null); }, [points, picked]);

  if (!author) return <Page><Banner tone="warn" title="Only the company owner or an admin can create templates." /></Page>;
  if (state.kind === 'loading') return <Page><Loading /></Page>;
  if (state.kind === 'error') return <Page><ErrorBox message={state.message} onRetry={load} /></Page>;
  if (state.kind === 'blocked') return <Page><Banner tone="info" title={state.message} /></Page>;
  const d = state.data;

  const saveAndNext = async () => {
    setProblem(null);
    if (d.contextSaving === 'server') {
      setBusy(true);
      try {
        const saved = await saveCompanyContext(access.companyId!, ctx, d.rowVersion);
        setState({ kind: 'ready', data: { ...d, context: saved.context, rowVersion: saved.rowVersion } });
      } catch (e) { setProblem(e instanceof Error ? e.message : 'Your company details could not be saved.'); setBusy(false); return; }
      setBusy(false);
    }
    setStep(s => s + 1);
  };
  const create = async () => {
    if (!chosen?.tree || !name.trim()) return;
    setBusy(true); setProblem(null);
    try {
      const forked = forkTree(chosen.tree, name.trim());
      const picked = props ?? propertyTypesOf(chosen.tree);
      if (picked.length) forked.propertyTypes = picked; else delete forked.propertyTypes;
      // The kind of home: base + exactly the ticked checkpoints and the two fields, as one validated change set.
      const built = d.ledrixDefault ? buildStarterTree(chosen.kind, forked, d.ledrixDefault, { ...kindChoice, propertyTypes: picked }) : { ok: true as const, tree: forked };
      if (!built.ok) { setProblem(built.error); setBusy(false); return; }
      const tree = built.tree;
      // The company's report advisories, picked on step 1 — the new draft's own list (none picked → Ledrix's list).
      if (advisories.length) tree.advisories = JSON.parse(JSON.stringify(advisories)); else delete tree.advisories;
      if (suggestAdv) delete tree.suggestAdvisories; else tree.suggestAdvisories = false;
      // The other buildings picked: Ledrix's (limited to this template's systems) and the company's own, starting empty.
      if (chosen.kind !== 'company') {
        const seeded = seedStructureTypes(tree).filter(t => otherBuildings.includes(t.id.replace(/^st_/, 'ledrix_')));
        const taken = seeded.map(t => t.id);
        const own = ownBuildings.map((n, i) => ({ id: newStructureTypeId(taken, Date.now() + i), name: n, icon: 'home-outline', systems: [] as string[], kind: 'other' as const }));
        tree.structureTypes = [...seeded, ...own];
      }
      const draft = await startNewTemplateDraft(access.companyId!, { name: name.trim(), base: chosen.base, tree });
      router.push(`/app/templates/new?draft=${encodeURIComponent(draft.id)}`);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'The draft could not be created.'); setBusy(false); }
  };

  // ── ONE QUESTION PER SCREEN (owner 2026-11-14, mockup MgKsXQx2KDiXpyL4NfAAu9 → "approved": "make each screen quick, easy
  // to read, not text heavy") ── the same answers as before, each on its own screen with Back · Skip · Next; the company's
  // answers are saved when leaving the last company question (saveAndNext, unchanged); Create is unchanged.
  type Screen = { id: string; q: string; sub?: string; skip?: boolean; body: React.ReactNode; next?: () => void; ok?: boolean };
  const tile = (on: boolean, label: string, onClick: () => void, round = false) => (
    <button key={label} type="button" role={round ? 'radio' : 'checkbox'} aria-checked={on} onClick={onClick}
      className={`flex min-h-[50px] items-center gap-3 rounded-xl border px-4 text-left text-[15px] font-semibold text-ink ${on ? 'border-2 border-accent bg-accent/10' : 'border-hairline bg-surface hover:bg-ink/5'}`}>
      <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 text-[11px] text-white ${round ? 'rounded-full' : 'rounded-md'} ${on ? 'border-accent bg-accent' : 'border-muted'}`}>{on ? '✓' : ''}</span>{label}
    </button>
  );
  const many = (opts: Option[], values: string[], set: (v: string[]) => void, short: Record<string, string> = {}) => (
    <div className="grid max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
      {opts.map(o => tile(values.includes(o.id), short[o.id] ?? o.label, () => set(values.includes(o.id) ? values.filter(v => v !== o.id) : [...values, o.id])))}
    </div>
  );
  const SHORT_SERVICE: Record<string, string> = { home: 'Home inspection', four_point: '4-Point', new_construction: 'New construction', commercial: 'Commercial', other: 'Other' };
  const SHORT_STANDARD: Record<string, string> = { internachi_sop: 'InterNACHI', ashi_sop: 'ASHI', state_sop: 'Our state’s', company: 'Our own', other: 'Other' };
  const SHORT_AFFIL: Record<string, string> = { internachi: 'InterNACHI', ashi: 'ASHI', state_association: 'A state association', other: 'Other', none: 'None' };
  const SHORT_LICENSE: Record<string, string> = { licensed: 'Yes, the state requires one', varies: 'It varies by inspector', not_required: 'No license where we work' };
  const defaultName = (p: StartingPoint) => {
    const base = p.kind === 'company' ? `Copy of ${p.title}` : p.kind === 'blank' ? 'New template' : p.title;
    const st = ctx.jurisdictions[0] ? labelOf(US_STATES, ctx.jurisdictions[0]) : '';
    return st && p.kind !== 'company' ? `${base} · ${st}` : base;
  };
  const screens: Screen[] = [
    { id: 'where', q: 'Where do you inspect?', skip: true, body: <MultiSelect options={US_STATES} values={ctx.jurisdictions} onChange={v => setCtx({ ...ctx, jurisdictions: v })} placeholder="+ Add a state" ariaLabel="States" /> },
    { id: 'what', q: 'What do you inspect?', sub: 'Pick every one.', skip: true, body: many(SERVICES, ctx.services, v => setCtx({ ...ctx, services: v }), SHORT_SERVICE) },
    { id: 'standards', q: 'Which standards do you follow?', skip: true, body: many(STANDARDS, ctx.standards, v => setCtx({ ...ctx, standards: v }), SHORT_STANDARD) },
    { id: 'associations', q: 'Which associations do you belong to?', skip: true, body: many(AFFILIATIONS, ctx.affiliations, v => setCtx({ ...ctx, affiliations: v }), SHORT_AFFIL) },
    { id: 'license', q: 'Do your inspectors need a license?', skip: true, body: (
      <div className="flex max-w-md flex-col gap-2.5" role="radiogroup" aria-label="Licensing">
        {LICENSING.map(o => tile(ctx.licensing === o.id, SHORT_LICENSE[o.id] ?? o.label, () => setCtx({ ...ctx, licensing: o.id }), true))}
      </div>) },
    { id: 'advisories', q: 'What do your reports recommend?', sub: 'Sewer scope, radon, asbestos… Tick the ones you use.', skip: true, next: () => void saveAndNext(),
      body: <div className="max-w-2xl"><AdvisoriesEditor value={advisories} onChange={setAdvisories} suggest={suggestAdv} onSuggest={setSuggestAdv} /></div> },
    { id: 'start', q: 'Start from', ok: !!chosen, next: () => { if (chosen && !name) setName(defaultName(chosen)); go(1); }, body: (
      <div className="flex max-w-xl flex-col gap-2.5">
        {points.map(p => (
          <button key={p.key} type="button" role="radio" aria-checked={picked === p.key} onClick={() => setPicked(p.key)}
            className={`flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left ${picked === p.key ? 'border-2 border-accent bg-accent/10' : 'border-hairline bg-surface hover:bg-ink/5'}`}>
            <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">{p.title}{p.recommended && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white">BEST FIT</span>}</span>
            <span className="text-sm text-body">{p.subtitle}</span>
          </button>
        ))}
        <p className="pt-1 text-xs text-muted">Import a template <Pill>Coming later</Pill> · from Spectora, HomeGauge or another tool, contact support.</p>
      </div>) },
    ...(chosen && asksKindOfHome(chosen.kind) && d.ledrixDefault ? [{ id: 'kind', q: 'What kind of home?', body: (
      <KindOfHome point={chosen} source={d.ledrixDefault} props={props ?? propertyTypesOf(chosen.tree)} setProps={setProps}
              choice={kindChoice} setChoice={setKindChoice} />) }] : []),
    ...(chosen && chosen.kind !== 'company' ? [{ id: 'buildings', q: 'Other buildings you include?', sub: 'Pick every one.', skip: true, body: (
      <div className="max-w-xl space-y-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {LEDRIX_DEFAULT_STRUCTURE_TYPES.map(t => tile(otherBuildings.includes(t.id), t.name, () => setOtherBuildings(cur => cur.includes(t.id) ? cur.filter(x => x !== t.id) : [...cur, t.id])))}
          {ownBuildings.map(b => tile(true, b, () => setOwnBuildings(ownBuildings.filter(x => x !== b))))}
        </div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const v = ownBuilding.trim(); if (v && !ownBuildings.some(x => x.toLowerCase() === v.toLowerCase())) { setOwnBuildings([...ownBuildings, v]); setOwnBuilding(''); } }}>
          <input value={ownBuilding} onChange={e => setOwnBuilding(e.target.value)} placeholder="+ Your own (e.g. Pole Barn)" aria-label="Your own building" className={field} />
          <button className={btn.secondary} disabled={!ownBuilding.trim()}>Add</button>
        </form>
      </div>) }] : []),
    { id: 'name', q: 'Name it', ok: !!name.trim() && !!chosen, body: (
      <div className="max-w-xl space-y-3">
        <input id="tpl-name" className={`${field} py-3 text-base font-semibold`} value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="e.g. Home inspection · Idaho" aria-label="Template name" />
        <div className="flex flex-wrap gap-1.5">
          {[...ctx.jurisdictions.map(j => labelOf(US_STATES, j)), ...ctx.services.map(x => SHORT_SERVICE[x] ?? labelOf(SERVICES, x)), ...ctx.standards.map(x => SHORT_STANDARD[x] ?? labelOf(STANDARDS, x))].map(x => <Pill key={x}>{x}</Pill>)}
        </div>
        {note ? <textarea className={field + ' min-h-[70px]'} maxLength={2000} value={ctx.notes} onChange={e => setCtx({ ...ctx, notes: e.target.value })} aria-label="Anything else your company requires" placeholder="Anything else your company requires" />
          : <button type="button" className={btn.ghost + ' px-0 text-sm'} onClick={() => setNote(true)}>+ Add a note</button>}
        <p className="text-xs text-muted">A private draft. Nothing reaches inspectors until you publish.</p>
      </div>) },
  ];
  const at = Math.min(step - 1, screens.length - 1);
  const cur = step > 0 ? screens[at] : null;
  function go(delta: number) { setProblem(null); setStep(s => Math.max(0, Math.min(screens.length, s + delta))); }
  const isLast = cur?.id === 'name';
  const onNext = () => { if (!cur) return; if (isLast) { void create(); return; } if (cur.next) cur.next(); else go(1); };

  return (
    <Page>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/app/templates" className="text-sm text-muted hover:text-ink">← Templates</Link>
      </div>
      {problem && <div className="mb-4"><Banner tone="error" title={problem} /></div>}
      <section className="mx-auto flex min-h-[460px] max-w-3xl flex-col gap-5 rounded-2xl border border-hairline bg-surface px-6 py-7 md:px-10"
        onKeyDown={e => { const t = e.target as HTMLElement; if (e.key === 'Enter' && cur && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) && (cur.ok ?? true)) { e.preventDefault(); onNext(); } }}>
        {!cur ? (
          <div className="my-auto flex flex-col items-start gap-4">
            <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-accent"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M8.5 10l1.5 1.5L13 8.5M8.5 15.5l1.5 1.5L13 14M14.5 10.5H16M14.5 16H16" /></svg>
            </span>
            <h1 className="text-3xl font-extrabold text-ink">Create a template</h1>
            <p className="-mt-2 text-[15px] text-body">A few quick questions. About two minutes.</p>
            {d.contextSaving === 'session' && <p className="text-xs text-muted">Your answers are used for this template only.</p>}
            <button className={`${btn.primary} mt-2 min-w-[200px]`} onClick={() => go(1)}>Start</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => go(-1)}>‹ Back</button>
              <span className="flex flex-1 gap-[3px]" aria-hidden>{screens.map((x, i) => <i key={x.id} className={`h-1 flex-1 rounded ${i <= at ? 'bg-accent' : 'bg-hairline'}`} />)}</span>
              <span className="whitespace-nowrap text-xs text-muted">{at + 1} of {screens.length}</span>
            </div>
            <h1 className="max-w-[24ch] text-3xl font-extrabold leading-tight text-ink">{cur.q}</h1>
            {cur.sub && <p className="-mt-3 text-[15px] text-body">{cur.sub}</p>}
            {cur.body}
            <div className="mt-auto flex flex-wrap gap-2.5 pt-4">
              {cur.skip && !isLast && <button className={btn.secondary} onClick={() => (cur.next ? cur.next() : go(1))}>Skip</button>}
              <button className={`${btn.primary} min-w-[200px] flex-1 sm:flex-none`} disabled={busy || !(cur.ok ?? true)} onClick={onNext}>
                {busy ? (isLast ? 'Creating…' : 'Saving…') : isLast ? 'Create and set it up ›' : 'Next'}
              </button>
            </div>
          </>
        )}
      </section>
    </Page>
  );
}

// ── the kind of home (2026-11-05) ──────────────────────────────────────────────────────────────────────────────────
function KindOfHome({ point, source, props, setProps, choice, setChoice }: {
  point: StartingPoint; source: InspectionTemplate; props: PropertyTypeId[]; setProps: (v: PropertyTypeId[]) => void;
  choice: Omit<KindChoice, 'propertyTypes'>; setChoice: (c: Omit<KindChoice, 'propertyTypes'>) => void;
}) {
  const plan = kindPlan(point.kind, { ...choice, propertyTypes: props });
  const labelOfId = useMemo(() => {
    const m = new Map<string, string>();
    const walk = (n: { id: string; label: string; children?: unknown[]; trimmed?: unknown[] }) => {
      m.set(n.id, n.label); for (const c of [...(n.children ?? []), ...(n.trimmed ?? [])]) walk(c as typeof n);
    };
    source.systems.forEach(s => walk(s as never));
    return m;
  }, [source]);
  const off = new Set(choice.unticked);
  const toggleAlso = (k: string) => setChoice({ ...choice, also: choice.also.includes(k) ? choice.also.filter(x => x !== k) : [...choice.also, k] });
  const toggleItem = (id: string) => setChoice({ ...choice, unticked: off.has(id) ? choice.unticked.filter(x => x !== id) : [...choice.unticked, id] });
  const kindLabel = (k: string) => SPECIAL_KINDS.find(x => x.id === k)?.label ?? k;
  const sysLabel = (id: string) => (labelOfId.get(id) ?? id).replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase());
  return (
    <div className="max-w-2xl space-y-4" aria-label="What kind of home is this template for?">
      <div>
        <p className={label}>Property type</p>
        <PropertyTypePicker value={props} onChange={setProps} />
      </div>
      <div className="space-y-2">
        <p className={label}>Also</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Also">
          {ALSO_KINDS.map(k => {
            const on = choice.also.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => toggleAlso(k)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-accent bg-accent/10 text-accent-ink' : 'border-hairline text-body hover:text-ink'}`}>
                {on ? '✓ ' : ''}{k === 'older' ? 'Older home' : kindLabel(k)}
              </button>
            );
          })}
        </div>
        {choice.also.includes('older') && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="older-cutoff" className="text-body">Your company calls a home “older” when it was built before</label>
            <input id="older-cutoff" type="number" min={1800} max={2100} className={field + ' w-24 py-1'} value={choice.olderCutoffYear ?? ''}
              onChange={e => { const n = parseInt(e.target.value, 10); setChoice({ ...choice, olderCutoffYear: Number.isFinite(n) ? n : null }); }} />
            <span className="text-xs text-muted">Saved with the template, for a later scheduling hint. It never changes a job by itself.</span>
          </div>
        )}
      </div>

      {/* The checkpoints each kind adds, folded away (2026-11-14: "not text heavy") — open to untick any. */}
      {plan.kinds.length > 0 && (<details className="rounded-xl border border-hairline">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-ink">Adds {plan.ticked.length} checkpoint{plan.ticked.length === 1 ? '' : 's'} · See them</summary>
        <div className="space-y-2 p-2">
      {plan.kinds.map(k => {
        const rows = starterCheckpoints([k]);
        const n = rows.filter(r => !off.has(r.id)).length;
        return (
          <details key={k} open={plan.kinds.length <= 2} className="rounded-xl border border-hairline bg-ground">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm font-semibold text-ink">
              <span className="flex-1">{kindLabel(k)}</span><span className="text-xs font-normal text-muted">adds {n} of {rows.length}</span>
            </summary>
            <ul className="space-y-0.5 px-3 pb-3">
              {rows.map(r => {
                const id = `kind-${k}-${r.id}`;
                return (
                  <li key={r.id} className="flex items-baseline gap-2 text-sm">
                    <input id={id} type="checkbox" className="h-4 w-4 accent-[var(--accent,#217BE8)]" checked={!off.has(r.id)} onChange={() => toggleItem(r.id)} />
                    <label htmlFor={id} className="flex-1 text-body">{labelOfId.get(r.id) ?? r.id}<span className="ml-2 text-xs text-muted">{r.why}</span></label>
                    <span className="text-xs text-muted">{sysLabel(r.system)}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
        </div>
      </details>)}

      {plan.condo && (
        <div className="space-y-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-body">
          <p>Condo / Townhome adds no checkpoints. The roof, foundation and shared exterior usually belong to the association.</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={choice.associationPremark} onChange={() => setChoice({ ...choice, associationPremark: !choice.associationPremark })} />
            <span>Pre-mark {ASSOCIATION_SYSTEMS.map(sysLabel).join(', ').replace(/, ([^,]*)$/, ' and $1')} as <strong>Not inspected — association responsibility</strong> on every new job. The inspector can clear it and inspect anyway.</span>
          </label>
        </div>
      )}

    </div>
  );
}




function MultiSelect({ options, values, onChange, placeholder, ariaLabel }: { options: Option[]; values: string[]; onChange: (v: string[]) => void; placeholder: string; ariaLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {values.map(v => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-sm text-ink">
          {labelOf(options, v)}<button type="button" aria-label={`Remove ${labelOf(options, v)}`} className="text-muted hover:text-ink" onClick={() => onChange(values.filter(x => x !== v))}>×</button>
        </span>
      ))}
      <select aria-label={ariaLabel} className={field + ' w-auto py-1.5'} value="" onChange={e => { if (e.target.value) onChange([...values, e.target.value]); }}>
        <option value="">{placeholder}</option>
        {options.filter(o => !values.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

