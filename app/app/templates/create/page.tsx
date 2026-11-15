'use client';

// Templates › New template — a guided page instead of the old dialog (2026-10-27).
//   Start → Company requirements → Starting point → Create draft → (Configure: the existing Template Builder)
// 2026-11-05 (owner rulings, mockup ED2sZJDGCViLHGs1wXjiDg): a Ledrix starting point also asks what kind of home the
// template is for (KindOfHome below) — each kind's checkpoints start ticked, Older / Log are "Also" picks, Condo offers
// the association pre-mark, and the New Construction card brings its ten; the draft is built by buildStarterTree.
// 2026-11-14 (owner, mockup B6BhhbaEivmUiE9GtETeqi → "Approved, start building it"): every answer builds it — What it's
// for (with the home types) picks the Ledrix build, so there is no Start from screen; one short screen per home type;
// standards in three groups, pre-ticked; add-on services become sections offered at intake (lib/templates/createModel.ts).
// Owners and admins only (the same rule as the old "New template" button). Creating makes a PRIVATE DRAFT through
// lib/templates/api.startNewTemplateDraft — the same call the dialog made — and opens it in the Template Builder; it is
// never published here. The company's answers are its own declaration (lib/templates/startingPoints honesty rules):
// recommendations state facts only, requirements coverage reads "not evaluated", and no individual license is asked.
import { propertyTypesOf } from '@/lib/templateBuilder/core/propertyTypes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdvisoriesEditor } from '@/components/templates/AdvisoriesEditor';
import { presetAdvisories } from '@/lib/templates/advisoryModel';
import { LEDRIX_DEFAULT_STRUCTURE_TYPES, newStructureTypeId, seedStructureTypes } from '@/lib/templateBuilder/core/structureTypes';
import type { Advisory } from '@/lib/templates/reportAdvisories';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { ErrorBox, Loading, Page } from '@/components/workspace/ui';
import { Banner, Pill, btn, field } from '@/components/templates/ui';
import { canAuthorTemplates } from '@/lib/templateBuilder/access';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import {
  EMPTY_CONTEXT, detectBackend, listInspectionTypes, listTemplates, loadCompanyContext, saveCompanyContext, startNewTemplateDraft,
  type CompanyContext, type InspectionType, type LiveTemplate,
} from '@/lib/templates/api';
import {
  AFFILIATIONS, EMPTY_KIND_CHOICE, LICENSING, US_STATES, buildStarterTree, forkTree, kindPlan, labelOf, startingPoints,
  type KindChoice, type Option,
} from '@/lib/templates/startingPoints';
import { ASSOCIATION_SYSTEMS, starterCheckpoints } from '@/lib/templateBuilder/core/specialHomes';
import {
  HOME_TYPES, LEDRIX_ADD_ONS, MULTI_LAYOUTS, PURPOSES, STANDARD_GROUPS, asksHomeTypes, buildFor, builtLines, defaultName, propertyTypesFor,
  stateStandardLabel, suggestedStandards, withAddOns, withService, type HomeType, type MultiLayout, type Purpose,
} from '@/lib/templates/createModel';

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
  const [step, setStep] = useState(0);             // 0 = start, then one screen per question
  const [ctx, setCtx] = useState<CompanyContext>(EMPTY_CONTEXT);
  const [purpose, setPurpose] = useState<Purpose>('home');
  const [types, setTypes] = useState<HomeType[]>(['single_family', 'manufactured', 'condo_townhome', 'multi']);
  const [layouts, setLayouts] = useState<MultiLayout[]>(['multi_unit_one', 'multi_unit_many']);
  const [name, setName] = useState('');
  const [kindChoice, setKindChoice] = useState<Omit<KindChoice, 'propertyTypes'>>(EMPTY_KIND_CHOICE);
  const [busy, setBusy] = useState(false);
  const [advisories, setAdvisories] = useState<Advisory[]>(() => presetAdvisories());
  // What can come with a single family home (2026-11-06 buildings, 2026-11-14 its own screen): Ledrix's ids and the company's own.
  const [otherBuildings, setOtherBuildings] = useState<string[]>(['ledrix_garage', 'ledrix_shop', 'ledrix_adu']);
  const [ownBuildings, setOwnBuildings] = useState<string[]>([]);
  const [ownBuilding, setOwnBuilding] = useState('');
  const [addOns, setAddOns] = useState<string[]>(['radon', 'sewer_scope', 'mold']);
  const [ownAddOns, setOwnAddOns] = useState<string[]>([]);
  const [ownAddOn, setOwnAddOn] = useState('');
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
  // LEDRIX ALWAYS BUILDS IT (owner 2026-11-14): the build follows from what the template is for.
  const chosen = buildFor(purpose, points);
  const labelOfId = useMemo(() => {
    const m = new Map<string, string>();
    const walk = (n: { id: string; label: string; children?: unknown[]; trimmed?: unknown[] }) => { m.set(n.id, n.label); for (const c of [...(n.children ?? []), ...(n.trimmed ?? [])]) walk(c as typeof n); };
    (data?.ledrixDefault?.systems ?? []).forEach(s => walk(s as never));
    return m;
  }, [data]);

  if (!author) return <Page><Banner tone="warn" title="Only the company owner or an admin can create templates." /></Page>;
  if (state.kind === 'loading') return <Page><Loading /></Page>;
  if (state.kind === 'error') return <Page><ErrorBox message={state.message} onRetry={load} /></Page>;
  if (state.kind === 'blocked') return <Page><Banner tone="info" title={state.message} /></Page>;
  const d = state.data;
  const homes = asksHomeTypes(purpose);
  const picked = chosen ? (homes ? propertyTypesFor(types, layouts) : propertyTypesOf(chosen.tree)) : [];
  const plan = chosen ? kindPlan(chosen.kind, { ...kindChoice, propertyTypes: picked }) : null;
  const stateNames = ctx.jurisdictions.map(j => labelOf(US_STATES, j));

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
    if (!name) setName(defaultName(purpose, stateNames[0] ?? null));
    setStep(s => s + 1);
  };
  const create = async () => {
    if (!chosen?.tree || !name.trim()) return;
    setBusy(true); setProblem(null);
    try {
      const forked = forkTree(chosen.tree, name.trim());
      if (picked.length) forked.propertyTypes = picked; else delete forked.propertyTypes;
      // The kinds of home: base + exactly the ticked checkpoints and the fields, as one validated change set.
      const built = d.ledrixDefault ? buildStarterTree(chosen.kind, forked, d.ledrixDefault, { ...kindChoice, propertyTypes: picked }) : { ok: true as const, tree: forked };
      if (!built.ok) { setProblem(built.error); setBusy(false); return; }
      let tree = built.tree;
      // The company's report advisories — the new draft's own list (none picked → Ledrix's list).
      if (advisories.length) tree.advisories = JSON.parse(JSON.stringify(advisories)); else delete tree.advisories;
      if (suggestAdv) delete tree.suggestAdvisories; else tree.suggestAdvisories = false;
      // What can come with a home: Ledrix's buildings picked (limited to this template's systems) and the company's own.
      const seeded = seedStructureTypes(tree).filter(t => otherBuildings.includes(t.id.replace(/^st_/, 'ledrix_')));
      const taken = seeded.map(t => t.id);
      const own = ownBuildings.map((n, i) => ({ id: newStructureTypeId(taken, Date.now() + i), name: n, icon: 'home-outline', systems: [] as string[], kind: 'other' as const }));
      tree.structureTypes = [...seeded, ...own];
      // The add-on services: each a section, off for every job until it is booked (addOnServices.ts).
      const withAdd = withAddOns(tree, addOns, ownAddOns);
      if (!withAdd.ok) { setProblem(withAdd.error); setBusy(false); return; }
      tree = withAdd.tree;
      const draft = await startNewTemplateDraft(access.companyId!, { name: name.trim(), base: chosen.base, tree });
      router.push(`/app/templates/new?draft=${encodeURIComponent(draft.id)}`);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'The draft could not be created.'); setBusy(false); }
  };

  // ── ONE QUESTION PER SCREEN (owner 2026-11-14) ── Back · Skip · Next; the company's answers are saved leaving the last
  // company question (Recommendations, saveAndNext); the last screen creates the draft.
  type Screen = { id: string; q: string; sub?: string; skip?: boolean; body: React.ReactNode; next?: () => void; ok?: boolean };
  const tile = (on: boolean, label: string, onClick: () => void, round = false, hint?: string) => (
    <button key={label} type="button" role={round ? 'radio' : 'checkbox'} aria-checked={on} onClick={onClick}
      className={`flex min-h-[50px] items-center gap-3 rounded-xl border px-4 text-left text-[15px] font-semibold text-ink ${on ? 'border-2 border-accent bg-accent/10' : 'border-hairline bg-surface hover:bg-ink/5'}`}>
      <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 text-[11px] text-white ${round ? 'rounded-full' : 'rounded-md'} ${on ? 'border-accent bg-accent' : 'border-muted'}`}>{on ? '✓' : ''}</span>
      <span className="flex-1">{label}</span>{hint && on && <span className="text-xs font-normal text-muted">{hint}</span>}
    </button>
  );
  const many = (opts: Option[], values: string[], set: (v: string[]) => void, short: Record<string, string> = {}) => (
    <div className="grid max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
      {opts.map(o => tile(values.includes(o.id), short[o.id] ?? o.label, () => set(values.includes(o.id) ? values.filter(v => v !== o.id) : [...values, o.id])))}
    </div>
  );
  const flip = <T extends string>(list: T[], v: T): T[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const cap = (t: string) => <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{t}</p>;
  const addOwn = (val: string, list: string[], set: (v: string[]) => void, clear: () => void) => {
    const v = val.trim(); if (v && !list.some(x => x.toLowerCase() === v.toLowerCase())) { set([...list, v]); clear(); }
  };
  const SHORT_AFFIL: Record<string, string> = { internachi: 'InterNACHI', ashi: 'ASHI', state_association: 'A state association', other: 'Other', none: 'None' };
  const SHORT_LICENSE: Record<string, string> = { licensed: 'Yes, the state requires one', varies: 'It varies by inspector', not_required: 'No license where we work' };
  const STANDARD_NAME: Record<string, string> = { internachi_sop: 'InterNACHI', ashi_sop: 'ASHI', state_sop: stateStandardLabel(stateNames), company: 'Our own' };
  const why = new Map(suggestedStandards(ctx).map(x => [x.id, x.why]));
  const sysLabel = (id: string) => (labelOfId.get(id) ?? id).replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase());
  const off = new Set(kindChoice.unticked);
  const manuf = starterCheckpoints(['manufactured']);

  const screens: Screen[] = [
    { id: 'what', q: 'What’s this template for?', ok: !!chosen && (!homes || types.length > 0), next: () => { setCtx({ ...ctx, services: withService(ctx.services, purpose) }); go(1); }, body: (
      <div className="flex max-w-xl flex-col gap-2.5" role="radiogroup" aria-label="What the template is for">
        {PURPOSES.map(p => (
          <div key={p.id} className={`rounded-xl border px-4 py-3 ${purpose === p.id ? 'border-2 border-accent bg-accent/10' : 'border-hairline bg-surface'} ${p.soon ? 'opacity-60' : ''}`}>
            <button type="button" role="radio" aria-checked={purpose === p.id} disabled={!!p.soon} onClick={() => setPurpose(p.id)} className="flex w-full items-start gap-3 text-left disabled:cursor-not-allowed">
              <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] text-white ${purpose === p.id ? 'border-accent bg-accent' : 'border-muted'}`}>{purpose === p.id ? '✓' : ''}</span>
              <span className="flex flex-col"><span className="flex items-center gap-2 text-[15px] font-semibold text-ink">{p.label}{p.soon && <Pill>Coming soon</Pill>}</span><span className="text-sm text-body">{p.sub}</span></span>
            </button>
            {purpose === p.id && asksHomeTypes(p.id) && (
              <div className="mt-3 grid grid-cols-1 gap-2 pl-8 sm:grid-cols-2" role="group" aria-label="Home types">
                {HOME_TYPES.map(h => tile(types.includes(h.id), h.label, () => setTypes(flip(types, h.id))))}
              </div>
            )}
          </div>
        ))}
      </div>) },
    { id: 'where', q: 'Where do you inspect?', skip: true, body: <MultiSelect options={US_STATES} values={ctx.jurisdictions} onChange={v => setCtx({ ...ctx, jurisdictions: v })} placeholder="+ Add a state" ariaLabel="States" /> },
    { id: 'license', q: 'Do your inspectors need a license?', skip: true, body: (
      <div className="flex max-w-md flex-col gap-2.5" role="radiogroup" aria-label="Licensing">
        {LICENSING.map(o => tile(ctx.licensing === o.id, SHORT_LICENSE[o.id] ?? o.label, () => setCtx({ ...ctx, licensing: o.id }), true))}
      </div>) },
    // Associations, then standards pre-ticked from them and the state — the first time only (nothing ticked yet).
    { id: 'associations', q: 'Which associations do you belong to?', skip: true,
      next: () => { if (!ctx.standards.length) setCtx({ ...ctx, standards: suggestedStandards(ctx).map(x => x.id) }); go(1); },
      body: many(AFFILIATIONS, ctx.affiliations, v => setCtx({ ...ctx, affiliations: v }), SHORT_AFFIL) },
    { id: 'standards', q: 'Which standards do you follow?', skip: true, body: (
      <div className="max-w-xl space-y-3">
        {STANDARD_GROUPS.map(g => (
          <div key={g.id} className="space-y-2">{cap(g.label)}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {g.ids.map(id => tile(ctx.standards.includes(id), STANDARD_NAME[id] ?? id, () => setCtx({ ...ctx, standards: flip(ctx.standards, id) }), false, why.get(id)))}
            </div>
          </div>
        ))}
        <p className="text-sm text-muted">Ledrix will check your template against these soon.</p>
      </div>) },
    ...(homes && types.includes('single_family') ? [{ id: 'single_family', q: 'What can come with a single family home?', sub: 'The inspector picks from these when adding an inspection.', body: (
      <div className="max-w-xl space-y-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {/* WHAT EACH COVERS (owner 2026-11-14, test run x1: "Do we need to determine what the items in the list cover?") */}
          {LEDRIX_DEFAULT_STRUCTURE_TYPES.map(t => (
            <div key={t.id} className="flex flex-col gap-1">
              {tile(otherBuildings.includes(t.id), t.name, () => setOtherBuildings(flip(otherBuildings, t.id)))}
              <span className="px-1 text-xs text-muted">{t.systems.length ? t.systems.map(sysLabel).join(', ') : 'You pick its systems'}</span>
            </div>
          ))}
          {ownBuildings.map(b => tile(true, b, () => setOwnBuildings(ownBuildings.filter(x => x !== b))))}
        </div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addOwn(ownBuilding, ownBuildings, setOwnBuildings, () => setOwnBuilding('')); }}>
          <input value={ownBuilding} onChange={e => setOwnBuilding(e.target.value)} placeholder="+ Your own (e.g. Pole Barn)" aria-label="Your own building" className={field} />
          <button className={btn.secondary} disabled={!ownBuilding.trim()}>Add</button>
        </form>
      </div>) }] : []),
    ...(homes && types.includes('manufactured') ? [{ id: 'manufactured', q: 'Manufactured homes', sub: 'Ticked items are added. Untick any you don’t do.', body: (
      <div className="grid max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {manuf.map(r => tile(!off.has(r.id), labelOfId.get(r.id) ?? r.id, () => setKindChoice({ ...kindChoice, unticked: flip([...kindChoice.unticked], r.id) })))}
      </div>) }] : []),
    ...(homes && types.includes('multi') ? [{ id: 'multi', q: 'Which multi unit properties?', sub: 'Pick every one.', ok: layouts.length > 0, body: (
      <div className="flex max-w-xl flex-col gap-2.5">
        {MULTI_LAYOUTS.map(l => tile(layouts.includes(l.id), l.label, () => setLayouts(flip(layouts, l.id))))}
        <p className="text-sm text-muted">Each unit is its own building on the job. Adds {starterCheckpoints(['multi_unit']).length} multi unit checkpoints.</p>
      </div>) }] : []),
    ...(homes && types.includes('condo_townhome') ? [{ id: 'condo', q: 'Condos: start the association’s parts as not inspected?', sub: `${ASSOCIATION_SYSTEMS.map(sysLabel).join(', ').replace(/, ([^,]*)$/, ' and $1')}. The inspector can clear it on site.`, body: (
      <div className="flex max-w-md flex-col gap-2.5" role="radiogroup" aria-label="Association parts">
        {tile(kindChoice.associationPremark, 'Yes, mark them association responsibility', () => setKindChoice({ ...kindChoice, associationPremark: true }), true)}
        {tile(!kindChoice.associationPremark, 'No, we inspect them', () => setKindChoice({ ...kindChoice, associationPremark: false }), true)}
      </div>) }] : []),
    ...(homes ? [{ id: 'also', q: 'Anything else about the homes?', skip: true, body: (
      <div className="max-w-xl space-y-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {tile(kindChoice.also.includes('log'), 'Log homes', () => setKindChoice({ ...kindChoice, also: flip([...kindChoice.also], 'log') }))}
        </div>
        {/* x2 phase 2 (2026-11-14): no "Older homes" — the older-home items follow each job's year built. */}
        <p className="text-sm text-muted">Older-home items (galvanized pipe, fuse panels, asbestos and lead) are already in: each shows only for a house built in its years.</p>
      </div>) }] : []),
    { id: 'addons', q: 'Which add-on services do you offer?', sub: 'Each brings its own short section when it’s booked.', skip: true, body: (
      <div className="max-w-xl space-y-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {LEDRIX_ADD_ONS.map(a => tile(addOns.includes(a.id), a.label, () => setAddOns(flip(addOns, a.id))))}
          {ownAddOns.map(a => tile(true, a, () => setOwnAddOns(ownAddOns.filter(x => x !== a))))}
        </div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addOwn(ownAddOn, ownAddOns, setOwnAddOns, () => setOwnAddOn('')); }}>
          <input value={ownAddOn} onChange={e => setOwnAddOn(e.target.value)} placeholder="+ Your own (e.g. Lead paint)" aria-label="Your own add-on" className={field} />
          <button className={btn.secondary} disabled={!ownAddOn.trim()}>Add</button>
        </form>
      </div>) },
    { id: 'advisories', q: 'What do your reports recommend?', sub: 'Sewer scope, radon, asbestos… Tick the ones you use.', skip: true, next: () => void saveAndNext(),
      body: <div className="max-w-2xl"><AdvisoriesEditor value={advisories} onChange={setAdvisories} suggest={suggestAdv} onSuggest={setSuggestAdv} /></div> },
    { id: 'name', q: 'Name it', ok: !!name.trim() && !!chosen, body: (
      <div className="max-w-xl space-y-3">
        <input id="tpl-name" className={`${field} py-3 text-base font-semibold`} value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="e.g. Home inspection · Idaho" aria-label="Template name" />
        <div className="space-y-1 rounded-xl border border-hairline bg-ground px-4 py-3 text-sm text-body">
          <p className="font-semibold text-ink">Ledrix built</p>
          {builtLines({ purpose, systems: chosen?.systems.length ?? 0, homeTypes: types, checkpoints: plan?.ticked.length ?? 0,
            buildings: homes && types.includes('single_family') ? [...LEDRIX_DEFAULT_STRUCTURE_TYPES.filter(t => otherBuildings.includes(t.id)).map(t => t.name), ...ownBuildings] : [],
            addOns: [...LEDRIX_ADD_ONS.filter(a => addOns.includes(a.id)).map(a => a.label), ...ownAddOns],
            states: stateNames, standards: ctx.standards.filter(x => x !== 'state_sop').map(x => STANDARD_NAME[x] ?? x) })
            .map(l => <p key={l.text} className={l.soon ? 'text-muted' : ''}>{l.text}</p>)}
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
            <p className="-mt-2 text-[15px] text-body">A few quick questions. Ledrix builds it from your answers, then you fine-tune.</p>
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
                {busy ? (isLast ? 'Creating…' : 'Saving…') : isLast ? 'Create and fine-tune ›' : 'Next'}
              </button>
            </div>
          </>
        )}
      </section>
    </Page>
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

