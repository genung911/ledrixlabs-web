'use client';

// The template editor — systems (left), items or Ask Ledrix (center), the inspector preview (right).
//
// Everything edits ONE private draft (lib/templates/useDraft): hand edits and accepted Ledrix proposals both go
// through template operations, the preview renders the draft, and nothing reaches the live template until the
// OWNER publishes. Publishing never changes an inspection already started — each keeps its own snapshot.
// BUILDING TYPES (2026-10-24) are a second view of the same draft (components/templates/BuildingTypes): which of the
// template's systems each kind of building starts with. Publishing is refused while they have an error.
// /app/templates/new?draft=<id> opens a template that isn't published yet.
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { ErrorBox, Loading } from '@/components/workspace/ui';
import { Banner, Modal, Pill, btn, timeAgo } from '@/components/templates/ui';
import { ItemDrawer, ItemsPanel, SystemsColumn } from '@/components/templates/EditorParts';
import { LedrixPanel } from '@/components/templates/LedrixPanel';
import { PhonePreview } from '@/components/templates/PhonePreview';
import { BuildingTypesPanel, buildingTypeChanges, buildingTypeIssues } from '@/components/templates/BuildingTypes';
import { canAuthorTemplates } from '@/lib/templateBuilder/access';
import type { TemplateOp } from '@/lib/templateBuilder/core/templateOps';
import { applyManual, locate } from '@/lib/templates/editorModel';
import { useDraft } from '@/lib/templates/useDraft';
import { TemplateApiError } from '@/lib/templates/api';

type Sel = { systemId: string | null; nodeId: string | null };

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
  const [tab, setTab] = useState<'items' | 'ledrix'>('items');
  const [drawer, setDrawer] = useState<string | null>(null);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [area, setArea] = useState<'systems' | 'buildings'>('systems');
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
    if (drawer && !locate(tree, drawer)) setDrawer(null);
  }, [tree, sel, drawer]);

  const readOnly = d.conflict === 'draft' ? 'This draft was saved somewhere else. Reload it to keep editing.'
    : d.conflict === 'base' ? 'The live template changed (for example on a phone) before your first change was saved. Reload to start from the newest version — your unsaved change is not kept.'
    : d.conflict === 'gone' ? 'This draft no longer exists.' : null;

  const onOps = useCallback((o: TemplateOp[]): boolean => {
    if (!m || readOnly) return false;
    const r = applyManual(m.core, o, me, Date.now());
    if (!r.ok) { setProblem(r.error); return false; }
    setProblem(null); d.change(r.draft); return true;
  }, [m, readOnly, me, d]);

  const select = useCallback((s: Sel) => { setSel(s); if (!s.nodeId) setDrawer(null); }, []);
  const system = tree && sel.systemId ? tree.systems.find(s => s.id === sel.systemId) ?? null : null;
  const drawerLoc = tree && drawer ? locate(tree, drawer) : null;
  const drawerPath = useMemo(() => {
    if (!tree || !drawer) return '';
    const parts: string[] = []; let cur = locate(tree, drawer);
    while (cur && cur.parent) { parts.unshift(cur.parent.label); cur = locate(tree, cur.parent.id); }
    return parts.join(' › ');
  }, [tree, drawer]);

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
  const publishBlock = !server ? 'Publishing turns on with the next Ledrix app update.' : !owner ? 'Only the company owner can publish.'
    : bIssues.errors.length ? `Fix the building types first: ${bIssues.errors[0].message}` : null;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      {/* top bar */}
      <div className="border-b border-hairline bg-surface px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/app/templates" className={btn.ghost} aria-label="Back to templates">← Templates</Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight text-ink">{m.core.name}</h1>
            <p className="truncate text-xs text-muted" aria-live="polite">{status}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(m.hasDraft || d.save.kind !== 'clean') && <button className={btn.secondary} disabled={busy} onClick={() => setDialog('discard')}>Discard draft</button>}
            <button className={btn.secondary} disabled={busy || !!readOnly || d.save.kind === 'clean' || d.save.kind === 'saved' || d.save.kind === 'saving'} onClick={() => d.flush()}>Save draft</button>
            <button className={btn.primary} disabled={!!publishBlock || busy || !!readOnly || (!m.hasDraft && d.save.kind === 'clean')} title={publishBlock ?? undefined} onClick={() => setDialog('publish')}>Publish</button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          Save draft keeps changes private{server ? ' and shared with your owner and admins' : ' in this browser'}. Only Publish changes the live template — for new inspections only.
          {publishBlock && <> {publishBlock}</>}
        </p>
      </div>

      <div className="space-y-2 px-4 pt-3 lg:px-6">
        {!server && <Banner title="Draft in this browser.">Shared drafts, publishing and inspection-type assignments turn on with the next Ledrix app update. Your draft never reaches inspectors until then.</Banner>}
        {readOnly && <Banner tone="error" title={readOnly} actions={<button className={btn.secondary} onClick={d.reload}>Reload draft</button>} />}
        {d.liveMoved && !readOnly && <Banner tone="warn" title="The live template changed after this draft started."
          actions={<><button className={btn.secondary} onClick={() => setDialog('discard')}>Start over from live</button></>}>
          Publishing now would replace those changes — you’ll be asked first.</Banner>}
        {d.save.kind === 'error' && !readOnly && <Banner tone="error" title={d.save.message} actions={<button className={btn.secondary} onClick={() => d.flush()}>Try again</button>} />}
        {problem && <Banner tone="warn" title={problem} actions={<button className={btn.ghost} onClick={() => setProblem(null)}>Dismiss</button>} />}
      </div>

      <div className="px-4 pt-3 lg:px-6">
        <div role="tablist" aria-label="Template" className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
          {([['systems', 'Systems & items'], ['buildings', 'Building types']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={area === k} onClick={() => setArea(k)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${area === k ? 'bg-ink text-surface' : 'text-body hover:text-ink'}`}>
              {l}{k === 'buildings' && bIssues.errors.length > 0 && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-safety" aria-label="needs attention" />}
            </button>
          ))}
        </div>
      </div>

      {area === 'buildings' ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 py-4 lg:px-6">
          <BuildingTypesPanel tree={tree} live={m.live?.tree ?? null} onOps={onOps} disabled={!!readOnly}
            onOpenSystem={id => { select({ systemId: id, nodeId: null }); setTab('items'); setArea('systems'); }} />
        </div>
      ) : (<>
      {/* narrow screens: one of edit / preview */}
      <div className="px-4 pt-3 xl:hidden">
        <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-hairline bg-ground p-0.5">
          {(['edit', 'preview'] as const).map(v => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${view === v ? 'bg-surface text-ink shadow-sm' : 'text-body'}`}>{v === 'edit' ? 'Edit template' : 'Inspector preview'}</button>)}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 px-4 py-4 lg:px-6 xl:grid-cols-[220px_minmax(0,1fr)_360px]">
        <div className={`${view === 'edit' ? 'grid' : 'hidden'} min-h-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:contents`}>
          <SystemsColumn tree={tree} sel={sel} onSelect={select} onOps={onOps} disabled={!!readOnly} />

          <section className="relative flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-hairline bg-surface xl:min-h-0">
            <div role="tablist" aria-label="Editor" className="flex border-b border-hairline px-2">
              {(['items', 'ledrix'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t ? 'border-accent text-ink' : 'border-transparent text-body hover:text-ink'}`}>
                {t === 'items' ? 'Items' : <>Ask Ledrix <Pill tone="accent">AI</Pill></>}</button>)}
            </div>
            <div className={`min-h-0 flex-1 overflow-y-auto ${tab === 'items' ? '' : 'hidden'}`}>
              {system
                ? <ItemsPanel tree={tree} system={system} sel={sel} onSelect={select} onOps={onOps} onOpen={setDrawer} disabled={!!readOnly} />
                : <p className="px-4 py-6 text-sm text-muted">{tree.systems.length ? 'Pick a system.' : 'Add a system to start.'}</p>}
            </div>
            <div className={`min-h-0 flex-1 ${tab === 'ledrix' ? 'flex flex-col' : 'hidden'}`}>
              <LedrixPanel core={m.core} change={d.change} selection={sel} onSelect={select} author={me} readOnly={readOnly}
                target={m.live ? { templateId: m.live.id } : { draftId: m.server!.id }} />
            </div>
            {drawerLoc && drawerLoc.depth > 0 && (
              <div className="absolute inset-0 z-20 flex flex-col bg-surface shadow-xl">
                <ItemDrawer node={drawerLoc.node} path={drawerPath} onOps={onOps} onClose={() => setDrawer(null)} disabled={!!readOnly} />
              </div>
            )}
          </section>
        </div>

        <aside aria-label="Inspector preview" className={`${view === 'preview' ? 'flex' : 'hidden'} min-h-0 justify-center xl:flex`}>
          <PhonePreview tree={tree} selection={sel} onSelect={s => { select(s); if (s.nodeId) { setTab('items'); } }} />
        </aside>
      </div>
      </>)}

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
