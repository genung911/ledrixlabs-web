'use client';

// Reports — finalized inspections by delivery state (2026-10-21, approved parity mockup). Read-only: reports are
// finalized and delivered from the Ledrix app. "Sent" means the server holds a published version; the same rule the
// dashboard and the phone's "reports to send" use (lib/workspace/model.ts buildReportsList).
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader, Seg, SyncLine, formatWhen, titleCase, useReloadOnFocus } from '@/components/workspace/ui';
import { loadFindingCounts, loadInspections, loadReports, signReportFile } from '@/lib/workspace/data';
import { buildReportsList, latestUpdate, type InspectionRow, type ReportsList } from '@/lib/workspace/model';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; list: ReportsList; lastSync: string | null };

export default function ReportsPage() {
  const { access } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const findingsVisible = access.role !== 'office';     // anomalies RLS is can_write_inspection

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const inspections = await loadInspections();
      const ids = inspections.map(i => i.id);
      const [reports, findings] = await Promise.all([loadReports(ids), findingsVisible ? loadFindingCounts(ids) : Promise.resolve({})]);
      setState({ kind: 'ready', list: buildReportsList(inspections, reports, findings), lastSync: latestUpdate(inspections) });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Reports could not load.' });
    }
  }, [findingsVisible]);
  useEffect(() => { load(); }, [load]);
  useReloadOnFocus(load);
  const [tab, setTab] = useState<'send' | 'review' | 'sent'>('send');

  async function open(path: string | null) {
    if (!path) return;
    setOpening(path); setFailed(null);
    const url = await signReportFile(path);
    setOpening(null);
    if (url) window.open(url, '_blank', 'noopener');
    else setFailed(path);
  }

  const Row = ({ i, right }: { i: InspectionRow; right: React.ReactNode }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <a href={`/app/inspections/${encodeURIComponent(i.id)}#reports`} className="min-w-0 flex-1 hover:underline focus:outline-none focus-visible:underline">
        <p className="truncate text-sm font-medium text-ink">{i.address || 'No address'}</p>
        <p className="truncate text-xs text-muted">{[titleCase(i.inspection_type), i.completed_at ? `Completed ${formatWhen(i.completed_at)}` : null].filter(Boolean).join(' · ')}</p>
      </a>
      <div className="flex items-center gap-3 text-xs text-body">{right}</div>
    </li>
  );

  // Website Apple pass (owner 2026-11-23, mockup CXThxTV8YKrVAaDGGa64to): the three cards are three tabs; no Refresh.
  const n = state.kind === 'ready' ? state.list : null;
  return (
    <Page>
      <PageHeader title="Reports"
        subtitle={n ? `${n.toSend.length} to send · ${n.review.length} waiting on review · ${n.sent.length} sent` : 'Finalized inspections and where their reports stand'} />
      <SyncLine lastSync={state.kind === 'ready' ? state.lastSync : undefined} />
      {state.kind === 'loading' && <Card><Loading label="Loading reports…" /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && (
        <div className="flex flex-col gap-4">
          <Seg label="Report status" value={tab} onChange={setTab} options={[
            { key: 'send', label: `To send · ${state.list.toSend.length}` },
            { key: 'review', label: `Waiting on review · ${state.list.review.length}` },
            { key: 'sent', label: `Sent · ${state.list.sent.length}` },
          ]} />
          {tab === 'send' && (
            <Card>
              {state.list.toSend.length ? (
                <ul className="divide-y divide-hairline">
                  {state.list.toSend.map(i => <Row key={i.id} i={i} right={<span>Deliver from the Ledrix app</span>} />)}
                </ul>
              ) : <Empty>Nothing finalized is waiting to be sent.</Empty>}
            </Card>
          )}
          {tab === 'review' && (
            <Card>
              {!findingsVisible && <p className="border-b border-hairline px-4 py-2.5 text-xs text-muted">Proposed findings aren’t visible to the Office role, so review items don’t appear here.</p>}
              {state.list.review.length ? (
                <ul className="divide-y divide-hairline">
                  {state.list.review.map(i => <Row key={i.id} i={i} right={<span>Findings to review first</span>} />)}
                </ul>
              ) : <Empty>No finalized inspection is waiting on review.</Empty>}
            </Card>
          )}
          {tab === 'sent' && (
            <Card>
              {state.list.sent.length ? (
                <ul className="divide-y divide-hairline">
                  {state.list.sent.map(({ inspection: i, latest, versions }) => (
                    <Row key={i.id} i={i} right={<>
                      <span>{`Version ${latest.version ?? versions}${latest.published_at ? ` · ${formatWhen(latest.published_at)}` : ''}`}</span>
                      {latest.pdf_path && (
                        <button onClick={() => open(latest.pdf_path)} disabled={opening === latest.pdf_path}
                          className="font-semibold text-accent-ink hover:underline disabled:opacity-50">
                          {opening === latest.pdf_path ? 'Opening…' : failed === latest.pdf_path ? 'Try again' : 'Open PDF'}
                        </button>
                      )}
                    </>} />
                  ))}
                </ul>
              ) : <Empty>No reports delivered yet.</Empty>}
            </Card>
          )}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">Reports are finalized and delivered from the Ledrix app. Delivering from here comes later.</p>
    </Page>
  );
}
