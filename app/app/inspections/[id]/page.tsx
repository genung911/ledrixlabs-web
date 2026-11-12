'use client';

// One inspection, desktop layout: section rail · record list · evidence panel.
//
// HITL: a PROPOSED finding is shown as a proposal, with Ledrix's original wording beside it, and only a person
// confirms, adjusts or rejects it — in the app, or here (2026-11-02, components/workspace/FindingEditor.tsx) under the
// app's own rules: the job's lead or the finding's inspector, holding the job's edit lock, through versioned saves.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { ConflictsCard } from '@/components/workspace/ConflictsCard';
import { FindingEditor, phoneHolderOf, useEditLock } from '@/components/workspace/FindingEditor';
import dynamic from 'next/dynamic';
// Loaded only when Scope is opened: it carries the Ledrix core pack the checklist's keys are decided from.
// Loaded only when Seal & send is opened (10c): it asks the server to assemble and check the job.
const SealPanel = dynamic(() => import('@/components/workspace/SealPanel').then(m => m.SealPanel), { ssr: false, loading: () => <Card className="xl:col-span-2"><Loading label="Checking this report…" /></Card> });
const ScopePanel = dynamic(() => import('@/components/workspace/ScopePanel').then(m => m.ScopePanel), { ssr: false, loading: () => <Card className="xl:col-span-2"><Loading label="Loading the checklist…" /></Card> });
import { Card, Empty, ErrorBox, Loading, Page, PhasePill, PriorityPill, SyncLine, formatDate, formatWhen, titleCase } from '@/components/workspace/ui';
import {
  loadFindings, loadInspection, loadItemLabels, loadMembers, loadPhotos, loadPortalLink, loadReports, loadSeals, loadSpecs, signEvidence, signReportFile,
  type FindingRow, type PhotoRow, type SealRow, type SpecRow,
} from '@/lib/workspace/data';
import { eventLine, loadJobTeam, loadLeaseEvents, teamStrip, type JobTeam, type LeaseEvent } from '@/lib/workspace/team';
import { inspectionPhase, isPriorityUnset, isPrioritySuggested, normalizeFindingStatus, parseSeverity, photoRef, SEVERITIES_IN_ORDER, type InspectionRow, type ReportRow } from '@/lib/workspace/model';

type Section = 'review' | 'findings' | 'rejected' | 'scope' | 'specs' | 'photos' | 'reports' | 'seal';
type Data = {
  inspection: InspectionRow;
  findings: FindingRow[];
  specs: SpecRow[];
  reports: ReportRow[];
  seals: SealRow[];
  portal: string | null;
  names: Record<string, string>;
  photos: PhotoRow[];
  labels: Record<string, string>;
  team: JobTeam | null;
  events: LeaseEvent[];
};
type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error'; message: string } | { kind: 'ready'; data: Data };

export default function InspectionPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ''));
  const { access } = useWorkspace();
  const findingsVisible = access.role !== 'office';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [section, setSection] = useState<Section>('review');
  const [selected, setSelected] = useState<string | null>(null);
  // Seal & send → Scope at one item (owner 2026-11-04). `n` makes a second click on the same item scroll to it again.
  const [scopeFocus, setScopeFocus] = useState<{ nodeId: string; n: number } | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const inspection = await loadInspection(id);
      if (!inspection || inspection.deleted_at) { setState({ kind: 'missing' }); return; }
      const [findings, specs, reports, seals, portal, members, photos, labels, team, events] = await Promise.all([
        findingsVisible ? loadFindings(id) : Promise.resolve([]),
        findingsVisible ? loadSpecs(id) : Promise.resolve([]),
        loadReports([id]),
        loadSeals(id),
        loadPortalLink(id).catch(() => null),
        access.companyId ? loadMembers().catch(() => []) : Promise.resolve([]),
        findingsVisible ? loadPhotos(id).catch(() => [] as PhotoRow[]) : Promise.resolve([] as PhotoRow[]),
        findingsVisible ? loadItemLabels(id).catch(() => ({} as Record<string, string>)) : Promise.resolve({} as Record<string, string>),
        // Team inspections (#81): read only, and never a reason for the page to fail.
        loadJobTeam(id).catch(() => null),
        loadLeaseEvents(id).catch(() => [] as LeaseEvent[]),
      ]);
      const names: Record<string, string> = {};
      for (const m of members) if (m.full_name) names[m.id] = m.full_name;
      if (access.name) names[access.userId] = access.name;
      for (const p of team?.people ?? []) if (p.name && !names[p.user_id]) names[p.user_id] = p.name;
      setState({ kind: 'ready', data: { inspection, findings, specs, reports, seals, portal, names, photos, labels, team, events } });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'This inspection could not load.' });
    }
  }, [id, findingsVisible, access.companyId, access.name, access.userId]);

  useEffect(() => { load(); }, [load]);

  // One edit lock for the page, taken at the first save (FindingEditor). A finding saved here replaces its row.
  const lock = useEditLock(id, phoneHolderOf(state.kind === 'ready' ? state.data.team : null));
  const onSaved = useCallback((row: FindingRow) => {
    setState(s => s.kind === 'ready' ? { kind: 'ready', data: { ...s.data, findings: s.data.findings.map(f => f.id === row.id ? row : f) } } : s);
  }, []);

  // Deep links from the dashboard (#review, #reports).
  useEffect(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (h === 'review' || h === 'findings' || h === 'scope' || h === 'specs' || h === 'photos' || h === 'reports' || h === 'rejected' || h === 'seal') setSection(h);
  }, []);

  const groups = useMemo(() => {
    const f = state.kind === 'ready' ? state.data.findings : [];
    const by = { review: [] as FindingRow[], findings: [] as FindingRow[], rejected: [] as FindingRow[] };
    for (const r of f) {
      const s = normalizeFindingStatus(r.status);
      (s === 'confirmed' ? by.findings : s === 'rejected' ? by.rejected : by.review).push(r);
    }
    const rank = (r: FindingRow) => { const s = parseSeverity(r.severity); return s ? SEVERITIES_IN_ORDER.indexOf(s) : 99; };
    by.findings.sort((a, b) => rank(a) - rank(b));
    return by;
  }, [state]);

  const list: FindingRow[] = section === 'review' ? groups.review : section === 'findings' ? groups.findings : section === 'rejected' ? groups.rejected : [];
  const current = list.find(r => r.id === selected) ?? list[0] ?? null;

  // j / k (or ↓ / ↑) walk the list; the evidence panel follows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!list.length) return;
      const i = Math.max(0, list.findIndex(r => r.id === current?.id));
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setSelected(list[Math.min(list.length - 1, i + 1)].id); }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setSelected(list[Math.max(0, i - 1)].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list, current]);

  if (state.kind === 'loading') return <Page><Card><Loading label="Loading inspection…" /></Card></Page>;
  if (state.kind === 'error') return <Page><ErrorBox message={state.message} onRetry={load} /></Page>;
  if (state.kind === 'missing') return (
    <Page>
      <Card><Empty>This inspection isn’t available to your account. It may not have synced yet, may have been deleted, or may belong to another company.</Empty></Card>
      <a href="/app/inspections" className="mt-4 inline-block text-sm font-semibold text-accent-ink hover:underline">Back to inspections</a>
    </Page>
  );

  const { inspection, specs, reports, seals, portal, names, photos, labels, team, events } = state.data;
  // A team of one (or a server without #81) shows nothing: that is today's job.
  const teamInfo = team && team.people.length > 1 ? teamStrip(team, labels) : null;
  // The Scope section's FINDING / PHOTO tags: per checklist item, findings not rejected and photos on file.
  const scopeCounts = { findings: {} as Record<string, number>, photos: {} as Record<string, number> };
  for (const f of state.data.findings) if (f.node_id && normalizeFindingStatus(f.status) !== 'rejected') scopeCounts.findings[f.node_id] = (scopeCounts.findings[f.node_id] ?? 0) + 1;
  for (const ph of photos) if (ph.node_id) scopeCounts.photos[ph.node_id] = (scopeCounts.photos[ph.node_id] ?? 0) + 1;
  const phase = inspectionPhase(inspection);
  const assignee = inspection.assigned_inspector_id ?? inspection.inspector_id;
  const rail: { id: Section; label: string; count?: number; show: boolean }[] = [
    { id: 'review', label: 'Review queue', count: groups.review.length, show: findingsVisible },
    { id: 'findings', label: 'Confirmed findings', count: groups.findings.length, show: findingsVisible },
    { id: 'rejected', label: 'Rejected', count: groups.rejected.length, show: findingsVisible && groups.rejected.length > 0 },
    { id: 'scope', label: 'Scope', show: findingsVisible },
    { id: 'specs', label: 'Specs', count: specs.length, show: findingsVisible },
    { id: 'photos', label: 'Photos', count: photos.length, show: findingsVisible },
    { id: 'reports', label: 'Reports & delivery', count: reports.length, show: true },
    { id: 'seal', label: 'Seal & send', show: true },
  ];
  const activeSection: Section = rail.find(r => r.id === section && r.show) ? section : 'reports';

  return (
    <Page>
      <a href="/app/inspections" className="text-sm font-medium text-body hover:text-ink">← Inspections</a>
      <div className="mb-5 mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{inspection.address || 'No address'}</h1>
          <p className="mt-1 text-sm text-body">
            {[titleCase(inspection.inspection_type), assignee ? (names[assignee] ?? 'Company member') : null,
              inspection.started_at ? `Started ${formatDate(inspection.started_at, { month: 'short', day: 'numeric', year: 'numeric' })}` : null,
              inspection.completed_at ? `Completed ${formatDate(inspection.completed_at, { month: 'short', day: 'numeric', year: 'numeric' })}` : null,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PhasePill phase={phase} />
          <button onClick={load} className="rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm font-semibold text-ink hover:bg-ink/5">Refresh</button>
        </div>
      </div>
      <SyncLine lastSync={inspection.updated_at ?? null} />
      {teamInfo && (
        <div role="status" className="mb-5 rounded-xl border border-hairline bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
            <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-muted">TEAM{teamInfo.live ? ` · ${teamInfo.live} EDITING NOW` : ''}</span>
            {teamInfo.unsent.length > 0 && (
              <span className="flex flex-wrap gap-1.5">
                {teamInfo.unsent.map(u => (
                  <span key={u.user_id} className="rounded-full bg-amber-600/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-700 dark:text-amber-400">{u.first.toUpperCase()} · {u.count} NOT SENT</span>
                ))}
              </span>
            )}
          </div>
          <ul className="flex flex-wrap gap-2 px-4 py-3">
            {teamInfo.chips.map(c => (
              <li key={c.user_id} className="flex items-center gap-2 rounded-full border border-hairline bg-ground py-1 pl-1 pr-3 text-sm text-ink">
                <span aria-hidden className={`grid h-7 w-7 place-items-center rounded-full font-mono text-[10px] font-bold ${c.live ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' : 'bg-accent/10 text-accent-ink'}`}>{c.initials}</span>
                <span className="font-medium">{c.first}</span>
                {c.is_lead && <span className="font-mono text-[9px] font-bold tracking-wider text-amber-700 dark:text-amber-400">LEAD</span>}
                <span className="text-xs text-muted">· {c.detail}</span>
              </li>
            ))}
          </ul>
          {events.length > 0 && (
            <details className="border-t border-hairline px-4 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-accent-ink">Editing history</summary>
              <ul className="mt-2 space-y-1">
                {events.slice(0, 15).map((e, i) => (
                  <li key={i} className="text-xs text-body"><span className="font-mono text-muted">{formatWhen(e.at)}</span> — {eventLine(e, names, labels)}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="border-t border-hairline px-4 py-2 text-xs text-muted">The lead assigns sections on the phone. Editing inspections on the website comes later.</p>
        </div>
      )}
      {/* When two devices disagree (2026-11-03): only when something does; the job's team settles it. */}
      <ConflictsCard inspectionId={id} lock={lock} canEdit={!!team && team.people.some(p => p.user_id === team.me)} onSettled={load} />
      <p className="-mt-3 mb-6 text-xs text-muted">Scope checklists, limitations, notes and intake details are kept on the phone and aren’t shown here yet. Photos are. Findings are confirmed, adjusted or rejected here or in the Ledrix app.</p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_22rem]">
        <nav aria-label="Inspection sections" className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {rail.filter(r => r.show).map(r => (
            <button key={r.id} onClick={() => { setSection(r.id); setSelected(null); setScopeFocus(null); }} aria-current={activeSection === r.id ? 'true' : undefined}
              className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeSection === r.id ? 'bg-accent/10 text-accent-ink' : 'text-body hover:bg-ink/5 hover:text-ink'}`}>
              {r.label}{typeof r.count === 'number' && <span className="font-mono text-xs">{r.count}</span>}
            </button>
          ))}
          {!findingsVisible && <p className="px-3 py-2 text-xs text-muted">Findings and specs aren’t visible to the Office role.</p>}
        </nav>

        {(activeSection === 'review' || activeSection === 'findings' || activeSection === 'rejected') && (
          <>
            <Card title={activeSection === 'review' ? 'Proposed — awaiting the inspector' : activeSection === 'findings' ? 'Confirmed findings' : 'Rejected'} count={list.length}>
              {activeSection === 'review' && <p className="border-b border-hairline px-4 py-2.5 text-xs text-body">Ledrix proposes; the inspector confirms, adjusts or rejects, in the app or here. Nothing becomes a finding until they do.</p>}
              {list.length === 0 ? <Empty>{activeSection === 'review' ? 'No proposals waiting.' : activeSection === 'findings' ? 'No confirmed findings yet.' : 'None.'}</Empty> : (
                <ul role="listbox" aria-label="Findings" className="divide-y divide-hairline">
                  {list.map(r => (
                    <li key={r.id} role="option" aria-selected={current?.id === r.id}>
                      <button onClick={() => setSelected(r.id)} className={`block w-full px-4 py-3 text-left focus:outline-none focus-visible:bg-ground ${current?.id === r.id ? 'bg-accent/5' : 'hover:bg-ground'}`}>
                        <div className="flex items-center gap-2"><PriorityPill severity={r.severity} unset={isPriorityUnset(r)} suggested={isPrioritySuggested(r)} />{r.is_safety && <span className="rounded-full bg-safety/10 px-2 py-0.5 text-[11px] font-semibold text-safety">SAFETY</span>}</div>
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink">{r.description || r.ai_description || 'No description'}</p>
                        <p className="mt-1 truncate text-xs text-muted">{uniq([r.room, r.location, titleCase(r.component)]).join(' · ') || 'No location'}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="lg:col-span-2 xl:col-span-1"><EvidencePanel finding={current} team={team} names={names} lock={lock} onSaved={onSaved} /></div>
          </>
        )}

        {activeSection === 'scope' && (
          <ScopePanel inspectionId={id} team={team} names={names} lock={lock} counts={scopeCounts}
            onOpenFindings={() => { setSection('findings'); setSelected(null); }} onOpenPhotos={() => { setSection('photos'); setSelected(null); }}
            focus={scopeFocus} onBackToSeal={scopeFocus ? () => { setScopeFocus(null); setSection('seal'); } : undefined} />
        )}

        {activeSection === 'photos' && <PhotosPanel photos={photos} labels={labels} />}

        {activeSection === 'specs' && (
          <Card title="Specs" count={specs.length} className="xl:col-span-2">
            {specs.length === 0 ? <Empty>No specs have synced.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-hairline text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5 font-semibold">System</th><th className="px-4 py-2.5 font-semibold">Item</th><th className="px-4 py-2.5 font-semibold">Detail</th><th className="px-4 py-2.5 font-semibold">Status</th></tr></thead>
                  <tbody className="divide-y divide-hairline">
                    {[...specs].sort((a, b) => (a.system ?? '').localeCompare(b.system ?? '')).map(s => (
                      <tr key={s.id}>
                        <td className="px-4 py-2.5 text-body">{titleCase(s.system) || '—'}</td>
                        <td className="px-4 py-2.5 font-medium text-ink">{[titleCase(s.category), s.instance_label].filter(Boolean).join(' — ') || '—'}</td>
                        <td className="px-4 py-2.5 text-body">{specDetail(s)}</td>
                        <td className="px-4 py-2.5 text-body">{titleCase(s.status) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {activeSection === 'seal' && <SealPanel inspectionId={id} lock={lock} onOpenItem={nodeId => { setScopeFocus({ nodeId, n: Date.now() }); setSection('scope'); setSelected(null); }} />}

        {activeSection === 'reports' && <ReportsPanel reports={reports} seals={seals} portal={portal} phase={phase} />}
      </div>
    </Page>
  );
}

/** Room and location are often the same word ("Garage · Garage"); show each once. */
function uniq(parts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  return parts.filter((p): p is string => {
    const k = (p ?? '').trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function specDetail(s: SpecRow): string {
  const parts: string[] = [];
  if (s.material) parts.push(s.material);
  if (s.attributes && typeof s.attributes === 'object') {
    for (const [k, v] of Object.entries(s.attributes)) {
      if (v == null || v === '' || typeof v === 'object') continue;
      parts.push(`${titleCase(k)}: ${String(v)}`);
      if (parts.length >= 4) break;
    }
  }
  return parts.join(' · ') || '—';
}

function EvidencePanel({ finding, team, names, lock, onSaved }: {
  finding: FindingRow | null; team: JobTeam | null; names: Record<string, string>; lock: ReturnType<typeof useEditLock>; onSaved: (row: FindingRow) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const refs = useMemo(() => {
    if (!finding) return [];
    return [finding.image_uri, ...(Array.isArray(finding.evidence) ? finding.evidence : [])].map(photoRef).filter((r): r is NonNullable<typeof r> => !!r);
  }, [finding?.id, finding?.image_uri, finding?.evidence]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    const paths = refs.flatMap(r => r.kind === 'storage' ? [r.path] : []);
    setUrls({});
    if (paths.length) signEvidence(paths).then(u => { if (live) setUrls(u); }).catch(() => {});
    return () => { live = false; };
  }, [refs]);

  if (!finding) return <Card title="Finding"><Empty>Select a finding to see its photos and change it.</Empty></Card>;

  const photos = (
    <>
      {refs.length === 0 && <p className="text-sm text-muted">No photo on this finding.</p>}
      <div className="grid grid-cols-2 gap-2">
        {refs.map((r, i) => {
          if (r.kind === 'device') return <div key={i} className="flex aspect-[4/3] items-center justify-center rounded-lg bg-ground p-2 text-center text-xs text-muted">Photo is still on the phone</div>;
          const src = r.kind === 'url' ? r.url : urls[r.path];
          return src
            ? <a key={i} href={src} target="_blank" rel="noreferrer" className={i === 0 ? 'col-span-2' : ''}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={src} alt={`Evidence ${i + 1}`} className="aspect-[4/3] w-full rounded-lg bg-ground object-cover" /></a>
            : <div key={i} className={`flex aspect-[4/3] items-center justify-center rounded-lg bg-ground text-xs text-muted ${i === 0 ? 'col-span-2' : ''}`}>Photo unavailable</div>;
        })}
      </div>
    </>
  );

  return (
    <Card title="Finding" className="xl:sticky xl:top-6">
      <FindingEditor finding={finding} team={team} names={names} lock={lock} onSaved={onSaved} photos={photos} />
    </Card>
  );
}

/** Every photo of the inspection, by item (PLAN_2026-10-28_photos_to_server P5). Signed for 10 minutes as the viewer —
 *  the storage policies decide; a photo the viewer may not see simply does not load. Click to open full size. */
function PhotosPanel({ photos, labels }: { photos: PhotoRow[]; labels: Record<string, string> }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    if (photos.length) signEvidence(photos.map(p => p.storage_path)).then(u => { if (live) setUrls(u); }).catch(() => {});
    return () => { live = false; };
  }, [photos]);
  const name = (id: string | null) => (id ? labels[id] ?? titleCase(id.replace(/_/g, ' ')) : null);
  const groups = useMemo(() => {
    const m = new Map<string, PhotoRow[]>();
    for (const p of photos) { const k = name(p.node_id ?? p.limitation_node_id) ?? 'General coverage'; m.set(k, [...(m.get(k) ?? []), p]); }
    return [...m.entries()].sort((a, b) => (a[0] === 'General coverage' ? 1 : b[0] === 'General coverage' ? -1 : a[0].localeCompare(b[0])));
  }, [photos, labels]);
  if (!photos.length) return <Card title="Photos" className="xl:col-span-2"><Empty>No photos have synced yet. Photos upload from the phone in the background.</Empty></Card>;
  return (
    <Card title="Photos" count={photos.length} className="xl:col-span-2">
      <div className="space-y-6">
        {groups.map(([item, ps]) => (
          <section key={item} aria-label={item}>
            <h3 className="mb-2 text-sm font-semibold text-ink">{item} <span className="font-normal text-muted">· {ps.length}</span></h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ps.map(p => {
                const tags = [p.anomaly_id ? 'Finding' : null, p.limitation_node_id ? 'Limitation' : null,
                  p.proof_of ? `Proof — ${titleCase(p.proof_of.replace(/^reading:/, '').replace(/_/g, ' '))}` : null, p.room].filter(Boolean);
                return (
                  <li key={p.id} className="overflow-hidden rounded-xl border border-hairline bg-ground">
                    <a href={urls[p.storage_path]} target="_blank" rel="noreferrer" aria-label={`Open photo ${p.id}`} className="block aspect-[4/3] bg-ink/5">
                      {urls[p.storage_path]
                        ? <img src={urls[p.storage_path]} alt={item} loading="lazy" className="h-full w-full object-cover" />
                        : <span className="flex h-full items-center justify-center text-xs text-muted">Loading…</span>}
                    </a>
                    <div className="px-2.5 py-2 text-xs">
                      <p className="text-muted">{formatWhen(p.taken_at)}</p>
                      {tags.length > 0 && <p className="mt-0.5 truncate text-body">{tags.join(' · ')}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

function ReportsPanel({ reports, seals, portal, phase }: { reports: ReportRow[]; seals: SealRow[]; portal: string | null; phase: string }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function open(path: string | null) {
    if (!path) return;
    setOpening(path); setFailed(null);
    const url = await signReportFile(path);
    if (!url) { setOpening(null); setFailed(path); return; }
    // THE WEB REPORT OPENS AS A PAGE (owner 2026-11-12: it showed raw HTML with "â€”" for every dash). Storage serves
    // the stored .html as plain text with no charset, so the browser printed its source. It is fetched and opened as
    // a UTF-8 page instead; the PDF opens as before.
    if (/\.html?$/i.test(path)) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const page = new Blob([await res.arrayBuffer()], { type: 'text/html;charset=utf-8' });
        setOpening(null);
        window.open(URL.createObjectURL(page), '_blank', 'noopener');
      } catch { setOpening(null); setFailed(path); }
      return;
    }
    setOpening(null);
    window.open(url, '_blank', 'noopener');
  }

  return (
    <div className="space-y-5 xl:col-span-2">
      <Card title="Published reports" count={reports.length}>
        {reports.length === 0 ? (
          <Empty>{phase === 'completed' ? 'Finalized, but no report has been delivered from the app yet.' : 'Reports are finalized and delivered from the app once the inspection is complete.'}</Empty>
        ) : (
          <ul className="divide-y divide-hairline">
            {reports.map((r, i) => (
              <li key={r.version ?? i} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">{i === 0 ? 'Current report' : 'Earlier version'}<span className="ml-2 font-mono text-xs text-muted">{r.version}</span></p>
                  <p className="text-xs text-body">Published {formatWhen(r.published_at)}</p>
                </div>
                <div className="flex gap-2">
                  {r.pdf_path && <button onClick={() => open(r.pdf_path)} disabled={opening === r.pdf_path} className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5 disabled:opacity-50">{opening === r.pdf_path ? 'Opening…' : 'Open PDF'}</button>}
                  {r.html_path && <button onClick={() => open(r.html_path)} disabled={opening === r.html_path} className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5 disabled:opacity-50">{opening === r.html_path ? 'Opening…' : 'Web report'}</button>}
                </div>
                {(failed === r.pdf_path || failed === r.html_path) && <p className="text-xs text-safety sm:basis-full">That file is no longer in storage or your account can’t open it.</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card title="Client Home Portal">
          <div className="p-4 text-sm">
            {portal ? (
              <>
                <p className="text-body">The client’s living record of this home.</p>
                <a href={portal} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-xs font-semibold text-surface hover:bg-ink/85">Open portal</a>
              </>
            ) : <p className="text-muted">No portal link is available to your account for this inspection.</p>}
          </div>
        </Card>
        <Card title="Report seals" count={seals.length}>
          <div className="p-4 text-sm">
            {seals.length ? (
              <>
                <p className="text-body">Each finalized version is hashed and chained to the one before it.</p>
                <p className="mt-2 font-mono text-xs text-ink">Latest {seals[0].hash.slice(0, 16)}…</p>
                <p className="text-xs text-muted">Sealed {formatWhen(seals[0].created_at)}</p>
              </>
            ) : <p className="text-muted">No seal recorded.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
