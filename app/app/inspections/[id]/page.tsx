'use client';

// One inspection, desktop layout: section rail · record list · evidence panel.
//
// HITL is preserved by omission: a PROPOSED finding is shown as a proposal, with Ledrix's original
// wording beside it, and there is no control here that confirms, rejects or edits it. That decision
// is made by the inspector in the app (findingConfirmation.ts), whose record is authoritative until
// versioned two-way sync exists.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PhasePill, PriorityPill, SyncLine, formatDate, formatWhen, titleCase } from '@/components/workspace/ui';
import {
  loadFindings, loadInspection, loadItemLabels, loadMembers, loadPhotos, loadPortalLink, loadReports, loadSeals, loadSpecs, signEvidence, signReportFile,
  type FindingRow, type PhotoRow, type SealRow, type SpecRow,
} from '@/lib/workspace/data';
import { inspectionPhase, isPriorityUnset, normalizeFindingStatus, parseSeverity, photoRef, SEVERITIES_IN_ORDER, type InspectionRow, type ReportRow } from '@/lib/workspace/model';

type Section = 'review' | 'findings' | 'rejected' | 'specs' | 'photos' | 'reports';
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

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const inspection = await loadInspection(id);
      if (!inspection || inspection.deleted_at) { setState({ kind: 'missing' }); return; }
      const [findings, specs, reports, seals, portal, members, photos, labels] = await Promise.all([
        findingsVisible ? loadFindings(id) : Promise.resolve([]),
        findingsVisible ? loadSpecs(id) : Promise.resolve([]),
        loadReports([id]),
        loadSeals(id),
        loadPortalLink(id).catch(() => null),
        access.companyId ? loadMembers().catch(() => []) : Promise.resolve([]),
        findingsVisible ? loadPhotos(id).catch(() => [] as PhotoRow[]) : Promise.resolve([] as PhotoRow[]),
        findingsVisible ? loadItemLabels(id).catch(() => ({} as Record<string, string>)) : Promise.resolve({} as Record<string, string>),
      ]);
      const names: Record<string, string> = {};
      for (const m of members) if (m.full_name) names[m.id] = m.full_name;
      if (access.name) names[access.userId] = access.name;
      setState({ kind: 'ready', data: { inspection, findings, specs, reports, seals, portal, names, photos, labels } });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'This inspection could not load.' });
    }
  }, [id, findingsVisible, access.companyId, access.name, access.userId]);

  useEffect(() => { load(); }, [load]);

  // Deep links from the dashboard (#review, #reports).
  useEffect(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (h === 'review' || h === 'findings' || h === 'specs' || h === 'photos' || h === 'reports' || h === 'rejected') setSection(h);
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

  const { inspection, specs, reports, seals, portal, names, photos, labels } = state.data;
  const phase = inspectionPhase(inspection);
  const assignee = inspection.assigned_inspector_id ?? inspection.inspector_id;
  const rail: { id: Section; label: string; count?: number; show: boolean }[] = [
    { id: 'review', label: 'Review queue', count: groups.review.length, show: findingsVisible },
    { id: 'findings', label: 'Confirmed findings', count: groups.findings.length, show: findingsVisible },
    { id: 'rejected', label: 'Rejected', count: groups.rejected.length, show: findingsVisible && groups.rejected.length > 0 },
    { id: 'specs', label: 'Specs', count: specs.length, show: findingsVisible },
    { id: 'photos', label: 'Photos', count: photos.length, show: findingsVisible },
    { id: 'reports', label: 'Reports & delivery', count: reports.length, show: true },
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
      <p className="-mt-3 mb-6 text-xs text-muted">Scope checklists, limitations, notes and intake details are kept on the phone and aren’t shown here yet. Photos are. Findings are confirmed, adjusted or rejected in the Ledrix app.</p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_22rem]">
        <nav aria-label="Inspection sections" className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {rail.filter(r => r.show).map(r => (
            <button key={r.id} onClick={() => { setSection(r.id); setSelected(null); }} aria-current={activeSection === r.id ? 'true' : undefined}
              className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${activeSection === r.id ? 'bg-accent/10 text-accent-ink' : 'text-body hover:bg-ink/5 hover:text-ink'}`}>
              {r.label}{typeof r.count === 'number' && <span className="font-mono text-xs">{r.count}</span>}
            </button>
          ))}
          {!findingsVisible && <p className="px-3 py-2 text-xs text-muted">Findings and specs aren’t visible to the Office role.</p>}
        </nav>

        {(activeSection === 'review' || activeSection === 'findings' || activeSection === 'rejected') && (
          <>
            <Card title={activeSection === 'review' ? 'Proposed — awaiting the inspector' : activeSection === 'findings' ? 'Confirmed findings' : 'Rejected'} count={list.length}>
              {activeSection === 'review' && <p className="border-b border-hairline px-4 py-2.5 text-xs text-body">Ledrix proposes; the inspector confirms, adjusts or rejects in the app. Nothing here becomes a finding until they do.</p>}
              {list.length === 0 ? <Empty>{activeSection === 'review' ? 'No proposals waiting.' : activeSection === 'findings' ? 'No confirmed findings yet.' : 'None.'}</Empty> : (
                <ul role="listbox" aria-label="Findings" className="divide-y divide-hairline">
                  {list.map(r => (
                    <li key={r.id} role="option" aria-selected={current?.id === r.id}>
                      <button onClick={() => setSelected(r.id)} className={`block w-full px-4 py-3 text-left focus:outline-none focus-visible:bg-ground ${current?.id === r.id ? 'bg-accent/5' : 'hover:bg-ground'}`}>
                        <div className="flex items-center gap-2"><PriorityPill severity={r.severity} unset={isPriorityUnset(r)} />{r.is_safety && <span className="rounded-full bg-safety/10 px-2 py-0.5 text-[11px] font-semibold text-safety">SAFETY</span>}</div>
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink">{r.description || r.ai_description || 'No description'}</p>
                        <p className="mt-1 truncate text-xs text-muted">{uniq([r.room, r.location, titleCase(r.component)]).join(' · ') || 'No location'}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="lg:col-span-2 xl:col-span-1"><EvidencePanel finding={current} /></div>
          </>
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

function EvidencePanel({ finding }: { finding: FindingRow | null }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const refs = useMemo(() => {
    if (!finding) return [];
    return [finding.image_uri, ...(Array.isArray(finding.evidence) ? finding.evidence : [])].map(photoRef).filter((r): r is NonNullable<typeof r> => !!r);
  }, [finding]);

  useEffect(() => {
    let live = true;
    const paths = refs.flatMap(r => r.kind === 'storage' ? [r.path] : []);
    setUrls({});
    if (paths.length) signEvidence(paths).then(u => { if (live) setUrls(u); }).catch(() => {});
    return () => { live = false; };
  }, [refs]);

  if (!finding) return <Card title="Evidence"><Empty>Select a finding to see its photos and history.</Empty></Card>;
  const status = normalizeFindingStatus(finding.status);
  const aiDiffers = !!finding.ai_description && finding.ai_description !== finding.description;

  return (
    <Card title="Evidence" className="xl:sticky xl:top-6">
      <div className="space-y-4 p-4">
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

        <dl className="space-y-3 text-sm">
          <Field label="Status">{status === 'confirmed' ? 'Confirmed by the inspector' : status === 'rejected' ? `Rejected${finding.rejected_at ? ` ${formatWhen(finding.rejected_at)}` : ''}` : 'Proposed — awaiting the inspector'}</Field>
          <Field label="Description">{finding.description || '—'}</Field>
          {finding.inspector_notes && <Field label="Inspector notes">{finding.inspector_notes}</Field>}
          {aiDiffers && <Field label="Ledrix’s original proposal">{finding.ai_description}{finding.ai_severity && finding.ai_severity !== finding.severity ? ` (${titleCase(finding.ai_severity)})` : ''}</Field>}
          <Field label="Location">{uniq([finding.room, finding.location]).join(' · ') || '—'}</Field>
          {finding.defect_type && <Field label="Defect type">{titleCase(finding.defect_type)}</Field>}
          <Field label="Captured">{formatWhen(finding.created_at)}</Field>
        </dl>
      </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt><dd className="mt-0.5 whitespace-pre-wrap text-ink">{children}</dd></div>;
}

function ReportsPanel({ reports, seals, portal, phase }: { reports: ReportRow[]; seals: SealRow[]; portal: string | null; phase: string }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function open(path: string | null) {
    if (!path) return;
    setOpening(path); setFailed(null);
    const url = await signReportFile(path);
    setOpening(null);
    if (url) window.open(url, '_blank', 'noopener');
    else setFailed(path);
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
