'use client';

// The template editor — a workspace with six sections (left): Overview, Building Types, Systems & Components,
// Requirements, Report Content, Review & Publish. Systems & Components is the tree (searchable, expandable), the
// selected system or component's workspace (Details · Requirements · Fields · Applicability · Report) or Ask Ledrix,
// and the inspector preview (right).
//
// Everything edits ONE private draft (lib/templates/useDraft): hand edits and accepted Ledrix proposals both go
// through template operations, the preview renders the draft, and nothing reaches the live template until the
// OWNER publishes. Publishing never changes an inspection already started — each keeps its own snapshot.
// BUILDING TYPES (2026-10-24) are a second view of the same draft (components/templates/BuildingTypes): which of the
// template's systems each kind of building starts with. Publishing is refused while they have an error.
// REQUIREMENTS (2026-10-26) can be drafted on items but not published: inspections can't evaluate them yet, so the
// Publish button says why and useDraft.publish refuses as well.
// /app/templates/new?draft=<id> opens a template that isn't published yet.
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { ErrorBox, Loading } from '@/components/workspace/ui';
import { Banner, Modal, Pill, btn, timeAgo } from '@/components/templates/ui';
import { SystemTree } from '@/components/templates/Tree';
import { NodeWorkspace, type ComponentTab } from '@/components/templates/Workspace';
import { OverviewSection, RequirementsSection, ReportSection, ReviewSection, issueCounts } from '@/components/templates/Sections';
import { publishFixes } from '@/lib/templates/publishFixes';
import { LevelPill } from '@/components/templates/RequirementsEditor';
import { LedrixPanel } from '@/components/templates/LedrixPanel';
import { PhonePreview } from '@/components/templates/PhonePreview';
import { BuildingTypesPanel, buildingTypeChanges, buildingTypeIssues } from '@/components/templates/BuildingTypes';
import { canAuthorTemplates } from '@/lib/templateBuilder/access';
import type { InspectionTemplate } from '@/lib/templateBuilder/core/InspectionTemplate';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { validateTemplate } from '@/lib/templateBuilder/core/templateValidate';
import { applyManual, locate } from '@/lib/templates/editorModel';
import { LEVEL_MEANING, REQUIREMENT_LEVELS, carriedRequirements, levelCounts, pinnedDefaultSet, requirementsOf } from '@/lib/templates/requirementModel';
import { useDraft } from '@/lib/templates/useDraft';
import { TemplateApiError } from '@/lib/templates/api';

type Sel = { systemId: string | null; nodeId: string | null };
type Section = 'overview' | 'buildings' | 'systems' | 'requirements' | 'report' | 'review';

const SECTIONS: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { id: 'buildings', label: 'Building Types', icon: 'M3 10.5L12 4l9 6.5V20h-6v-6H9v6H3z' },
  { id: 'systems', label: 'Systems & Components', icon: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5' },
  { id: 'requirements', label: 'Requirements', icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12l3 3 5-6' },
  { id: 'report', label: 'Report Content', icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7' },
  { id: 'review', label: 'Review & Publish', icon: 'M4 12l16-8-6 16-3-7-7-1z' },
];
const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

export default function TemplateEditorPage() {
  const { access } = useWorkspace();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const templateId = decodeURIComponent(params?.id ?? '');
  const draftId = search?.get('draft') ?? null;
  const author = canAuthorTemplates(access.role);
  const owner = access.role === 'owner';

  if (!access.companyId || !author) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-sm font-semibold text-ink">Only a company owner or admin can edit templates.</p>
        <Link href="/app/templates" className="mt-4 inline-block text-sm font-semibold text-accent-ink hover:underline">Back to templates</Link>
      </div>
    );
  }
  return <Editor companyId={access.companyId} templateId={templateId} draftId={draftId} owner={owner}
    me={{ userId: access.userId, role: access.role }} onDone={() => router.push('/app/templates')} />;
}

function Editor({ companyId, templateId, draftId, owner, me, onDone }: {
  companyId: string; templateId: string; draftId: string | null; owner: boolean; me: { userId: string; role: string }; onDone: () => void;
}) {
  const d = useDraft({ companyId, templateId, draftId });
  const [sel, setSel] = useState<Sel>({ systemId: null, nodeId: null });
  const [section, setSection] = useState<Section>('systems');
  const [ctab, setCtab] = useState<ComponentTab>('overview');
  const [mode, setMode] = useState<'edit' | 'ledrix'>('edit');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [problem, setProblem] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'publish' | 'discard' | 'replace'>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(t); }, []);

  const m = d.model;
  const tree = m?.core.tree;
  useEffect(() => { if (tree && !sel.systemId && tree.systems[0]) setSel({ systemId: tree.systems[0].id, nodeId: null }); }, [tree, sel.systemId]);
  // A selection whose item was removed falls back to its system, then to the first system.
  useEffect(() => {
    if (!tree) return;
    if (sel.nodeId && !locate(tree, sel.nodeId)) setSel(s => ({ ...s, nodeId: null }));
    if (sel.systemId && !tree.systems.some(s => s.id === sel.systemId)) setSel({ systemId: tree.systems[0]?.id ?? null, nodeId: null });
  }, [tree, sel]);

  const readOnly = d.conflict === 'draft' ? 'This draft was saved somewhere else. Reload it to keep editing.'
    : d.conflict === 'base' ? 'The live template changed (for example on a phone) before your first change was saved. Reload to start from the newest version — your unsaved change is not kept.'
    : d.conflict === 'gone' ? 'This draft no longer exists.' : null;

  const onOps = useCallback((o: TemplateOp[]): boolean => {
    if (!m || readOnly) return false;
    const r = applyManual(m.core, o, me, Date.now());
    if (!r.ok) { setProblem(r.error); return false; }
    setProblem(null); d.change(r.draft); return true;
  }, [m, readOnly, me, d]);

  const select = useCallback((s: Sel) => { setSel(s); setMode('edit'); }, []);
  const go = useCallback((s: string, to?: Sel, tab?: ComponentTab) => {
    setSection(s as Section); if (to) select(to); if (tab) setCtab(tab);
  }, [select]);
  const issues = useMemo(() => (tree ? validateTemplate(tree) : []), [tree]);

  if (d.loadError) return <div className="mx-auto max-w-3xl px-4 py-8"><ErrorBox message={d.loadError} onRetry={d.reload} />
    <Link href="/app/templates" className="mt-4 inline-block text-sm font-semibold text-accent-ink hover:underline">Back to templates</Link></div>;
  if (!m || !tree) return <div className="px-4 py-8"><Loading label="Opening the template…" /></div>;

  const server = m.backend === 'server';
  const isNew = !m.live;
  const nextVersion = (m.live?.rowVersion ?? 0) + 1;
  const status = (() => {
    const saved = d.save.kind === 'saving' ? 'Saving…' : d.save.kind === 'dirty' ? 'Unsaved changes' : d.save.kind === 'saved' ? `Saved ${timeAgo(d.save.at)}`
      : d.save.kind === 'error' ? 'Not saved' : m.hasDraft ? `Saved ${timeAgo(m.server ? Date.parse(m.server.updatedAt) : m.core.updatedAt)}` : '';
    if (isNew) return `New template · not published${saved ? ` · ${saved}` : ''}`;
    if (!m.hasDraft && d.save.kind === 'clean') return server ? `Live · v${m.live!.rowVersion} · editing starts a shared draft` : 'Live · editing starts a draft in this browser';
    const where = server ? `Draft · started from live v${m.server?.basedOnVersion ?? m.live!.rowVersion}` : 'Draft in this browser';
    return saved ? `${where} · ${saved}` : where;
  })();
  const stage = isNew ? 'New' : (m.hasDraft || d.save.kind !== 'clean') ? 'Draft' : 'Live';

  const doPublish = async (replace: boolean) => {
    setBusy(true); setProblem(null);
    try { await d.publish(replace); setDialog(null); onDone(); }
    catch (e) {
      if (e instanceof TemplateApiError && e.reason === 'live_template_changed') setDialog('replace');
      else { setDialog(null); setProblem(e instanceof Error ? e.message : 'The template could not be published.'); }
    } finally { setBusy(false); }
  };
  const doDiscard = async () => {
    setBusy(true);
    try { await d.discard(); setDialog(null); if (isNew) onDone(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'The draft could not be discarded.'); }
    finally { setBusy(false); }
  };

  const bIssues = buildingTypeIssues(tree);
  const bChanges = buildingTypeChanges(m.live?.tree ?? null, tree);
  const reqs = carriedRequirements(tree);
  const publishBlock = !server ? 'Publishing turns on with the next Ledrix app update.' : !owner ? 'Only the company owner can publish.'
    : bIssues.errors.length ? `Fix the building types first: ${bIssues.errors[0].message}`
    : reqs.length ? `Not publishable yet — inspections can’t use requirements yet (${reqs.join('; ')}).` : null;
  const canSave = !busy && !readOnly && d.save.kind !== 'clean' && d.save.kind !== 'saved' && d.save.kind !== 'saving';
  const canDiscard = !busy && (m.hasDraft || d.save.kind !== 'clean');
  const canPublish = !publishBlock && !busy && !readOnly && !(!m.hasDraft && d.save.kind === 'clean');
  const counts = issueCounts(issues);
  const fixes = publishFixes(tree, issues, { errors: bIssues.errors.map(i => i.message), warnings: bIssues.warnings.map(i => i.message) });
  const blocking = fixes.filter(f => f.blocks).length;
  const reqTotal = reqs.length ? tree.systems.reduce((a, s) => a + countReqs(s), 0) : 0;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      {/* top bar */}
      <div className="border-b border-hairline bg-surface px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/app/templates" className={btn.ghost} aria-label="Back to templates">‹ Templates</Link>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <h1 className="truncate text-lg font-bold tracking-tight text-ink">{m.core.name}</h1>
            <Pill tone={stage === 'Live' ? 'ok' : stage === 'Draft' ? 'neutral' : 'accent'}>{stage}</Pill>
            <p className="w-full truncate text-xs text-muted sm:w-auto" aria-live="polite">{status}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(m.hasDraft || d.save.kind !== 'clean') && <button className={btn.secondary} disabled={busy} onClick={() => setDialog('discard')}>Discard draft</button>}
            <button className={btn.secondary} disabled={!canSave} onClick={() => d.flush()}>Save draft</button>
            <button className={btn.primary} disabled={!canPublish} title={publishBlock ?? undefined} onClick={() => setDialog('publish')}>Publish</button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          Save draft keeps changes private{server ? ' and shared with your owner and admins' : ' in this browser'}. Only Publish changes the live template — for new inspections only.
          {blocking > 0 && !(!server || !owner)
            ? <> <button className="font-semibold text-accent-ink hover:underline" onClick={() => go('review')}>{blocking} to fix before publishing →</button></>
            : publishBlock && <> {publishBlock}</>}
        </p>
      </div>

      <div className="space-y-2 px-4 pt-3 empty:hidden lg:px-6">
        {!server && <Banner title="Draft in this browser.">Shared drafts, publishing and inspection-type assignments turn on with the next Ledrix app update. Your draft never reaches inspectors until then.</Banner>}
        {readOnly && <Banner tone="error" title={readOnly} actions={<button className={btn.secondary} onClick={d.reload}>Reload draft</button>} />}
        {d.liveMoved && !readOnly && <Banner tone="warn" title="The live template changed after this draft started."
          actions={<><button className={btn.secondary} onClick={() => setDialog('discard')}>Start over from live</button></>}>
          Publishing now would replace those changes — you’ll be asked first.</Banner>}
        {d.save.kind === 'error' && !readOnly && <Banner tone="error" title={d.save.message} actions={<button className={btn.secondary} onClick={() => d.flush()}>Try again</button>} />}
        {problem && <Banner tone="warn" title={problem} actions={<button className={btn.ghost} onClick={() => setProblem(null)}>Dismiss</button>} />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        {/* section rail */}
        <nav aria-label="Template sections" className="shrink-0 border-b border-hairline xl:flex xl:w-[220px] xl:flex-col xl:border-b-0 xl:border-r">
          <p className="hidden px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted xl:block">Template</p>
          <ul className="flex gap-1 overflow-x-auto px-3 py-2 xl:flex-col xl:overflow-visible xl:px-2">
            {SECTIONS.map(s => {
              const on = section === s.id;
              const badge = s.id === 'buildings' && bIssues.errors.length ? <span className="h-2 w-2 rounded-full bg-safety" aria-label="needs attention" />
                : s.id === 'requirements' && reqTotal ? <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{reqTotal}</span>
                : s.id === 'review' && (counts.errors || reqs.length) ? <span className="h-2 w-2 rounded-full bg-safety" aria-label="needs attention" /> : null;
              return (
                <li key={s.id} className="shrink-0">
                  <button onClick={() => setSection(s.id)} aria-current={on ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-[13px] ${on ? 'bg-accent/15 font-semibold text-accent-ink' : 'text-body hover:bg-ink/5 hover:text-ink'}`}>
                    <Icon d={s.icon} /><span className="flex-1">{s.label}</span>{badge}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto hidden border-t border-hairline px-4 py-3 text-xs xl:block">
            <p className="font-semibold uppercase tracking-wide text-muted">Template version</p>
            <p className="mt-1 font-semibold text-ink">{isNew ? 'Not published yet' : `Live v${m.live!.rowVersion}`}</p>
            {!isNew && stage === 'Draft' && <p className="text-muted">Draft from v{m.server?.basedOnVersion ?? m.live!.rowVersion}{!isNew ? ` · publishes as v${nextVersion}` : ''}</p>}
            <p className="mt-2 text-muted">Requirement defaults: {pinnedDefaultSet(tree) === 'ledrix-r0' ? 'Ledrix r0' : pinnedDefaultSet(tree)}</p>
            <p className="mt-2 text-[11px] leading-snug text-muted">Each inspection keeps the copy of the template it started with.</p>
          </div>
        </nav>

        <main aria-label="Template section" className="flex min-h-0 min-w-0 flex-1 flex-col">
          {section === 'overview' && <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6"><OverviewSection tree={tree} status={status} issues={issues} onGo={go} onOps={onOps} disabled={!!readOnly} /></div>}
          {section === 'buildings' && (
            <div className="flex min-h-0 flex-1 flex-col px-4 py-4 lg:px-6">
              <BuildingTypesPanel tree={tree} live={m.live?.tree ?? null} onOps={onOps} disabled={!!readOnly}
                onOpenSystem={id => { select({ systemId: id, nodeId: null }); setSection('systems'); }} />
            </div>
          )}
          {section === 'requirements' && <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6"><RequirementsSection tree={tree} onGo={go} /></div>}
          {section === 'report' && <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6"><ReportSection tree={tree} onGo={go} /></div>}
          {section === 'review' && (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
              <ReviewSection tree={tree} status={status} issues={issues} buildingErrors={bIssues.errors.map(i => i.message)} buildingWarnings={bIssues.warnings.map(i => i.message)}
                buildingChanges={bChanges} publishBlock={publishBlock} readOnly={readOnly} liveMoved={d.liveMoved} edits={m.core.log.length} saveState={d.save.kind}
                isNew={isNew} nextVersion={nextVersion} canSave={canSave} canDiscard={canDiscard} canPublish={canPublish} busy={busy}
                onSave={() => d.flush()} onDiscard={() => setDialog('discard')} onPublish={() => setDialog('publish')} onGo={go} fixes={fixes} onOps={onOps} />
            </div>
          )}
          {/* Systems & Components stays mounted (hidden) so Ask Ledrix keeps its conversation across sections. */}
          <div className={`${section === 'systems' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>
            <div className="flex items-center gap-2 px-4 pt-3 2xl:hidden lg:px-6">
              <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-hairline bg-ground p-0.5">
                {(['edit', 'preview'] as const).map(v => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${view === v ? 'bg-surface text-ink shadow-sm' : 'text-body'}`}>{v === 'edit' ? 'Edit template' : 'Inspector preview'}</button>)}
              </div>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 px-4 py-3 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-6 2xl:grid-cols-[250px_minmax(0,1fr)_350px]">
              <div className={`${view === 'edit' ? 'flex' : 'hidden'} max-h-[45vh] min-h-0 flex-col lg:max-h-none 2xl:flex`}>
                <SystemTree tree={tree} sel={sel} onSelect={select} onOps={onOps} disabled={!!readOnly} />
              </div>
              <section aria-label="Editor" className={`${view === 'edit' ? 'flex' : 'hidden'} relative min-h-[560px] flex-col overflow-hidden rounded-xl border border-hairline bg-surface lg:min-h-0 2xl:flex`}>
                <div role="tablist" aria-label="Editor mode" className="flex items-center gap-1 border-b border-hairline px-2">
                  {(['edit', 'ledrix'] as const).map(t => <button key={t} role="tab" aria-selected={mode === t} onClick={() => setMode(t)}
                    className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${mode === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
                    {t === 'edit' ? 'Editor' : <>Ask Ledrix <Pill tone="accent">AI</Pill></>}</button>)}
                </div>
                <div className={`${mode === 'edit' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>
                  <NodeWorkspace tree={tree} sel={sel} onSelect={select} onOps={onOps} disabled={!!readOnly} tab={ctab} setTab={setCtab}
                    onOpenBuildingTypes={() => setSection('buildings')} />
                </div>
                <div className={`min-h-0 flex-1 ${mode === 'ledrix' ? 'flex flex-col' : 'hidden'}`}>
                  <LedrixPanel core={m.core} change={d.change} selection={sel} onSelect={select} author={me} readOnly={readOnly}
                    target={m.live ? { templateId: m.live.id } : { draftId: m.server!.id }} />
                </div>
              </section>
              <aside aria-label="Inspector preview" className={`${view === 'preview' ? 'flex' : 'hidden'} min-h-0 flex-col items-center gap-3 overflow-y-auto lg:col-span-2 2xl:col-span-1 2xl:flex`}>
                <PhonePreview tree={tree} selection={sel} onSelect={s => select(s)} />
                <CompletionCard tree={tree} nodeId={sel.nodeId} />
              </aside>
            </div>
          </div>
        </main>
      </div>

      <Modal open={dialog === 'publish'} title={`Publish ${m.core.name}${isNew ? '' : ` as v${nextVersion}`}?`} onClose={() => setDialog(null)} footer={<>
        <button className={btn.secondary} onClick={() => setDialog(null)}>Cancel</button>
        <button className={btn.primary} disabled={busy || !!publishBlock} title={publishBlock ?? undefined} onClick={() => doPublish(false)}>{busy ? 'Publishing…' : 'Publish'}</button>
      </>}>
        <p>{isNew ? 'It becomes a live template your company can assign to inspection types.' : 'New inspections that use this template start from this version.'}</p>
        <p className="mt-2">Inspections already started or finished keep the copy they started with — nothing about them changes.</p>
        {bChanges.length > 0 && (<>
          <p className="mt-3 font-semibold text-ink">Building types</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{bChanges.map(c => <li key={c}>{c}</li>)}</ul>
          <p className="mt-1 text-xs text-muted">Buildings already added to an inspection keep their own systems.</p>
        </>)}
        {bIssues.warnings.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">{bIssues.warnings.map(w => <li key={w.code + w.message}>{w.message}</li>)}</ul>}
      </Modal>
      <Modal open={dialog === 'replace'} title="The live template changed" onClose={() => setDialog(null)} footer={<>
        <button className={btn.secondary} onClick={() => setDialog(null)}>Cancel</button>
        <button className={btn.secondary} onClick={() => setDialog('discard')}>Start over from live</button>
        <button className={btn.danger} disabled={busy || !!publishBlock} onClick={() => doPublish(true)}>Publish anyway — replace</button>
      </>}>
        <p>Someone changed the live template (for example on a phone) after this draft started. Publishing anyway replaces those changes with this draft.</p>
      </Modal>
      <Modal open={dialog === 'discard'} title="Discard this draft?" onClose={() => setDialog(null)} footer={<>
        <button className={btn.secondary} onClick={() => setDialog(null)}>Keep editing</button>
        <button className={btn.danger} disabled={busy} onClick={doDiscard}>Discard draft</button>
      </>}>
        <p>Every change in the draft is removed, including accepted Ledrix proposals. {isNew ? 'This new template is removed too.' : 'The live template is not affected.'}</p>
      </Modal>
    </div>
  );
}

function countReqs(n: InspectionTemplate['systems'][number]): number {
  return requirementsOf(n).length + (n.children ?? []).reduce((a, c) => a + countReqs(c), 0);
}

/** The selected item's authored requirements by level — what the item WOULD owe. Not used by inspections yet, and
 *  only Required counts toward what is owed (ADR 2026-10-25 §4 M6); Recommended and Optional are shown apart. */
function CompletionCard({ tree, nodeId }: { tree: InspectionTemplate; nodeId: string | null }) {
  const node = nodeId ? locate(tree, nodeId)?.node ?? null : null;
  if (!node || node.kind !== 'component') return null;
  const defs = requirementsOf(node);
  const c = levelCounts(defs);
  return (
    <section aria-label="Completion logic for this item" className="w-full max-w-[340px] rounded-xl border border-hairline bg-surface px-4 py-3 text-xs">
      <p className="text-sm font-semibold text-ink">Completion logic <span className="font-normal text-muted">(this item)</span></p>
      {defs.length ? (<>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-hairline text-sm font-bold text-ink">0/{c.required}</div>
          <ul className="space-y-1">{REQUIREMENT_LEVELS.map(l => <li key={l} className="flex items-center gap-2"><LevelPill level={l} /><span className="text-body">{c[l]} — {LEVEL_MEANING[l].toLowerCase()}</span></li>)}</ul>
        </div>
        <p className="mt-2 text-muted">Only Required items count toward what the item owes. Drafted only — inspections don’t evaluate these yet.</p>
      </>) : <p className="mt-1 text-muted">No company requirements. Today the app’s built-in rules decide what this item owes.</p>}
    </section>
  );
}
