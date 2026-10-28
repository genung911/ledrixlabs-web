'use client';

// Templates › New template — a guided page instead of the old dialog (2026-10-27).
//   Start → Company requirements → Starting point → Create draft → (Configure: the existing Template Builder)
// Owners and admins only (the same rule as the old "New template" button). Creating makes a PRIVATE DRAFT through
// lib/templates/api.startNewTemplateDraft — the same call the dialog made — and opens it in the Template Builder; it is
// never published here. The company's answers are its own declaration (lib/templates/startingPoints honesty rules):
// recommendations state facts only, requirements coverage reads "not evaluated", and no individual license is asked.
import { propertyTypesOf, type PropertyTypeId } from '@/lib/templateBuilder/core/propertyTypes';
import { PropertyTypePicker } from '@/components/templates/PropertyTypes';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  AFFILIATIONS, LICENSING, SERVICES, STANDARDS, US_STATES, forkTree, labelOf, startingPoints, type Option, type StartingPoint,
} from '@/lib/templates/startingPoints';

type Loaded = {
  templates: LiveTemplate[]; types: InspectionType[];
  context: CompanyContext; rowVersion: number | null; contextSaving: 'server' | 'session';
  ledrixDefault: InspectionTemplate | null; ledrixFourPoint: InspectionTemplate | null;
};
const STEPS = ['Company requirements', 'Starting point', 'Create draft', 'Configure'];

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
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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
    setStep(2);
  };
  const create = async () => {
    if (!chosen?.tree || !name.trim()) return;
    setBusy(true); setProblem(null);
    try {
      const tree = forkTree(chosen.tree, name.trim());
      const picked = props ?? propertyTypesOf(chosen.tree);
      if (picked.length) tree.propertyTypes = picked; else delete tree.propertyTypes;
      const draft = await startNewTemplateDraft(access.companyId!, { name: name.trim(), base: chosen.base, tree });
      router.push(`/app/templates/new?draft=${encodeURIComponent(draft.id)}`);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'The draft could not be created.'); setBusy(false); }
  };

  return (
    <Page>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/app/templates" className="text-sm text-muted hover:text-ink">← Templates</Link>
      </div>
      <h1 className="text-2xl font-bold text-ink">{['Create a template', 'Company requirements', 'Starting point', 'Create your template draft'][step]}</h1>
      <p className="mt-1 max-w-2xl text-sm text-body">{[
        'Build an inspection template for your company’s workflow, requirements and reporting.',
        'Tell Ledrix about your company so it can suggest where to start. These are your own answers — Ledrix doesn’t verify them.',
        'Choose where your new template starts. You can change anything afterwards in the Template Builder.',
        'Name your template. It is created as a private draft — nothing changes for your inspectors until you publish it.',
      ][step]}</p>
      <Stepper current={Math.max(step, 1)} started={step > 0} />
      {problem && <div className="mt-4"><Banner tone="error" title={problem} /></div>}

      {step === 0 && (
        <section className="mt-6 grid gap-6 rounded-2xl border border-hairline bg-surface p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
          <div className="flex items-center justify-center rounded-2xl bg-accent/5 p-8" aria-hidden>
            <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-accent"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M8.5 10l1.5 1.5L13 8.5M8.5 15.5l1.5 1.5L13 14M14.5 10.5H16M14.5 16H16" /></svg>
          </div>
          <div className="flex flex-col justify-center gap-3">
            <h2 className="text-lg font-semibold text-ink">Let’s set the foundation</h2>
            <p className="text-sm text-body">A few details about your company help Ledrix suggest a starting template. Then you name a private draft and finish it in the Template Builder.</p>
            <ul className="space-y-1.5 text-sm text-body">
              <li>✓ Record where you work, what you inspect and the standards you follow</li>
              <li>✓ See which starting points fit, and why</li>
              <li>✓ Nothing is published until you choose to publish</li>
            </ul>
            <div><button className={btn.primary + ' mt-2'} onClick={() => setStep(1)}>Get started →</button></div>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="mt-6 space-y-4">
          {d.contextSaving === 'session' && <Banner tone="info" title="These answers are used for this template only.">Saving them for your whole company turns on with a database update (ledger #71).</Banner>}
          <Panel title="Where do you operate?" sub="The states or jurisdictions your company works in.">
            <MultiSelect options={US_STATES} values={ctx.jurisdictions} onChange={v => setCtx({ ...ctx, jurisdictions: v })} placeholder="Add a state…" ariaLabel="States" />
          </Panel>
          <Panel title="What types of inspections do you perform?">
            <Checks options={SERVICES} values={ctx.services} onChange={v => setCtx({ ...ctx, services: v })} />
          </Panel>
          <Panel title="Professional associations" sub="Associations your company belongs to. Membership is not the same as following their standards.">
            <Checks options={AFFILIATIONS} values={ctx.affiliations} onChange={v => setCtx({ ...ctx, affiliations: v })} />
          </Panel>
          <Panel title="Standards you follow" sub="The standards of practice your company says it inspects to. Ledrix doesn’t supply or check them.">
            <Checks options={STANDARDS} values={ctx.standards} onChange={v => setCtx({ ...ctx, standards: v })} />
          </Panel>
          <Panel title="Licensing" sub="How licensing applies to your inspectors. Each inspector’s own license number stays on their profile — it isn’t collected here.">
            <div className="space-y-1.5" role="radiogroup" aria-label="Licensing">
              {LICENSING.map(o => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-body">
                  <input type="radio" name="licensing" checked={ctx.licensing === o.id} onChange={() => setCtx({ ...ctx, licensing: o.id })} className="h-4 w-4" />{o.label}
                </label>
              ))}
            </div>
          </Panel>
          <Panel title="Company-specific requirements (optional)" sub="Anything your company always requires — written in your words. Ledrix doesn’t check templates against it.">
            <textarea className={field + ' min-h-[80px]'} maxLength={2000} value={ctx.notes} onChange={e => setCtx({ ...ctx, notes: e.target.value })}
              aria-label="Company-specific requirements" placeholder="e.g. Every report includes a sewer-scope recommendation for homes built before 1980." />
          </Panel>
          <div className="flex items-center justify-between">
            <button className={btn.secondary} onClick={() => setStep(0)}>Back</button>
            <button className={btn.primary} disabled={busy} onClick={saveAndNext}>{busy ? 'Saving…' : 'Next: Starting point →'}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-6 space-y-3">
          {!points.some(p => p.recommended) && <p className="text-sm text-muted">No recommendation yet — choose the services you offer on the previous step, or pick any starting point below.</p>}
          {points.map(p => <PointCard key={p.key} p={p} on={picked === p.key} onPick={() => setPicked(p.key)} />)}
          <div className="flex items-center gap-4 rounded-xl border border-dashed border-hairline px-4 py-3 opacity-70">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Import a template <Pill>Coming later</Pill></p>
              <p className="text-xs text-muted">Bringing in a template from Spectora, HomeGauge or another tool isn’t available here yet. Ledrix can help you move one over — contact support.</p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <button className={btn.secondary} onClick={() => setStep(1)}>Back</button>
            <button className={btn.primary} disabled={!chosen} onClick={() => { if (!name && chosen && chosen.kind !== 'blank') setName(chosen.kind === 'company' ? `Copy of ${chosen.title}` : chosen.title); setStep(3); }}>Next: Create draft →</button>
          </div>
        </section>
      )}

      {step === 3 && chosen && (
        <section className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-3 rounded-2xl border border-hairline bg-surface p-5">
            <p className={label}>Starting point</p>
            <p className="text-base font-semibold text-ink">{chosen.title}</p>
            <p className="text-sm text-body">{chosen.subtitle}</p>
            <p className="text-sm text-body">{chosen.kind === 'blank' ? 'No systems — you add your own.' : `${chosen.systems.length} systems covered by default · ${chosen.componentCount} items`}</p>
            {!!chosen.systems.length && <p className="text-xs text-muted">{chosen.systems.join(' · ')}</p>}
            <button className={btn.ghost + ' text-xs'} onClick={() => setStep(2)}>Change starting point</button>
          </div>
          <div className="space-y-4 rounded-2xl border border-hairline bg-surface p-5">
            <div>
              <label htmlFor="tpl-name" className={label}>Template name *</label>
              <input id="tpl-name" className={field} value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="e.g. Home inspection — Idaho" />
            </div>
            <div>
              <p className={label}>Property types</p>
              <PropertyTypePicker value={props ?? propertyTypesOf(chosen.tree)} onChange={setProps} />
              <p className="mt-1 text-[11px] text-muted">What this template is for. You can change it later.</p>
            </div>
            <div>
              <p className={label}>Your company context</p>
              <div className="flex flex-wrap gap-1.5">
                {[...ctx.jurisdictions, ...ctx.services.map(s => labelOf(SERVICES, s)), ...ctx.standards.map(s => labelOf(STANDARDS, s))].map(x => <Pill key={x}>{x}</Pill>)}
                {!ctx.jurisdictions.length && !ctx.services.length && !ctx.standards.length && <span className="text-xs text-muted">None given.</span>}
              </div>
              <p className="mt-1 text-[11px] text-muted">For your reference — it isn’t written into the template.</p>
            </div>
            <div className="flex items-center justify-between pt-1">
              <button className={btn.secondary} onClick={() => setStep(2)}>Back</button>
              <button className={btn.primary} disabled={busy || !name.trim()} onClick={create}>{busy ? 'Creating…' : 'Create draft & open Template Builder →'}</button>
            </div>
            <p className="text-xs text-muted">A private draft. {chosen.kind === 'company' ? 'Your original template is not changed. ' : ''}Only the owner can publish it.</p>
          </div>
        </section>
      )}
    </Page>
  );
}

function Stepper({ current, started }: { current: number; started: boolean }) {
  return (
    <ol className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Progress">
      {STEPS.map((s, i) => {
        const n = i + 1, done = started && n < current, on = started && n === current;
        return (
          <li key={s} className="flex items-center gap-2 text-sm" aria-current={on ? 'step' : undefined}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-accent text-white' : on ? 'border-2 border-accent text-accent' : 'border border-hairline text-muted'}`}>{done ? '✓' : n}</span>
            <span className={on ? 'font-semibold text-ink' : 'text-muted'}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {sub && <p className="mb-3 mt-0.5 text-xs text-muted">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Checks({ options, values, onChange }: { options: Option[]; values: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = values.includes(o.id);
        return (
          <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-accent bg-accent/5 text-ink' : 'border-hairline text-body'}`}>
            <input type="checkbox" className="h-4 w-4" checked={on} onChange={() => onChange(on ? values.filter(v => v !== o.id) : [...values, o.id])} />{o.label}
          </label>
        );
      })}
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

function PointCard({ p, on, onPick }: { p: StartingPoint; on: boolean; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-2xl border p-4 ${on ? 'border-accent bg-accent/5' : 'border-hairline bg-surface'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" role="radio" aria-checked={on} onClick={onPick} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent' : 'border-hairline'}`}>{on && <span className="h-2 w-2 rounded-full bg-accent" />}</span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              {p.recommended && <Pill tone="accent">Recommended</Pill>}
              <span className="text-sm font-semibold text-ink">{p.title}</span>
              <span className="text-xs text-muted">{p.kind === 'company' ? 'Your template' : p.kind === 'blank' ? '' : 'From Ledrix'}</span>
            </span>
            <span className="mt-0.5 block text-xs text-body">{p.subtitle}</span>
          </span>
        </button>
        {p.kind !== 'blank' && <button type="button" className={btn.ghost + ' text-xs'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Details'}</button>}
      </div>
      {(open || on) && (
        <div className="ml-7 mt-3 grid gap-3 text-xs md:grid-cols-3">
          <div><p className="font-semibold text-ink">Why it fits</p>
            {p.reasons.length ? <ul className="mt-1 space-y-0.5 text-body">{p.reasons.map(r => <li key={r}>• {r}</li>)}</ul>
              : <p className="mt-1 text-muted">Nothing Ledrix knows about your company points to it — it’s still available to choose.</p>}
            {p.kind !== 'blank' && <p className="mt-2 text-muted">{p.systems.length} systems on by default · {p.componentCount} items</p>}
          </div>
          <div><p className="font-semibold text-ink">Requirements coverage</p><p className="mt-1 text-body">{p.coverage.text}</p></div>
          <div><p className="font-semibold text-ink">Check yourself</p>
            {p.review.length ? <ul className="mt-1 space-y-0.5 text-body">{p.review.map(r => <li key={r}>• {r}</li>)}</ul> : <p className="mt-1 text-muted">Nothing flagged from your answers.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
