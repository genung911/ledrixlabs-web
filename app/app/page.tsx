'use client';

// Company dashboard — every figure is a count of rows the signed-in user's RLS returned. Nothing is
// estimated, sampled or invented; a section with no rows says so.
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader, PhasePill, ReadOnlyNotice, formatDate, formatWhen, titleCase } from '@/components/workspace/ui';
import { loadFindingCounts, loadInspections, loadOrders, loadReports } from '@/lib/workspace/data';
import { addDays, buildDashboard, inspectionPhase, localDate, type Dashboard, type OrderRow } from '@/lib/workspace/model';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; d: Dashboard };

export default function DashboardPage() {
  const { access, companyName } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const findingsVisible = access.role !== 'office';     // anomalies RLS is can_write_inspection

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const today = localDate(new Date());
      const [inspections, orders] = await Promise.all([loadInspections(), loadOrders(today, addDays(today, 14))]);
      const ids = inspections.map(i => i.id);
      const [findings, reports] = await Promise.all([findingsVisible ? loadFindingCounts(ids) : Promise.resolve({}), loadReports(ids)]);
      setState({ kind: 'ready', d: buildDashboard({ inspections, findings, orders, reports, today }) });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'The dashboard could not load.' });
    }
  }, [findingsVisible]);

  useEffect(() => { load(); }, [load]);

  const greeting = access.name ? `Welcome back, ${access.name.split(' ')[0]}` : 'Dashboard';
  const scope = access.managesCompany ? `${companyName ?? 'Your company'} — every inspection your role can see` : 'Inspections you created or are assigned to';

  return (
    <Page>
      <PageHeader title={greeting} subtitle={scope} actions={
        <button onClick={load} className="rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5">Refresh</button>
      } />
      <ReadOnlyNotice />

      {state.kind === 'loading' && <Card><Loading label="Loading your company’s work…" /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card title="Today" count={state.d.today.length}>
            {state.d.today.length ? <OrderList rows={state.d.today} showDate={false} /> : <Empty>Nothing scheduled today.</Empty>}
          </Card>
          <Card title="Next 14 days" count={state.d.upcoming.length}>
            {state.d.upcoming.length ? <OrderList rows={state.d.upcoming} showDate /> : <Empty>Nothing scheduled in the next two weeks.</Empty>}
          </Card>
          <Card title="Needs attention" count={state.d.attention.length}>
            {!findingsVisible && <p className="border-b border-hairline px-4 py-2.5 text-xs text-muted">Proposed findings aren’t visible to the Office role, so review items don’t appear here.</p>}
            {state.d.attention.length ? (
              <ul className="divide-y divide-hairline">
                {state.d.attention.map(a => (
                  <li key={`${a.reason}-${a.inspection.id}`}>
                    <a href={`/app/inspections/${encodeURIComponent(a.inspection.id)}${a.reason === 'review' ? '#review' : ''}`} className="block px-4 py-3 hover:bg-ground focus:bg-ground focus:outline-none">
                      <p className="truncate text-sm font-medium text-ink">{a.inspection.address || 'No address'}</p>
                      <p className="mt-0.5 text-xs text-body">{a.reason === 'review' ? 'Proposed findings awaiting the inspector’s decision' : 'Completed — no report delivered yet'}</p>
                    </a>
                  </li>
                ))}
              </ul>
            ) : <Empty>Nothing waiting on anyone.</Empty>}
          </Card>

          <Card title="In progress" count={state.d.inProgress.length} className="lg:col-span-2">
            {state.d.inProgress.length ? (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2 font-semibold">Property</th><th className="hidden px-4 py-2 font-semibold sm:table-cell">Type</th><th className="px-4 py-2 font-semibold">Last synced</th></tr></thead>
                <tbody className="divide-y divide-hairline">
                  {state.d.inProgress.slice(0, 8).map(i => (
                    <tr key={i.id} className="hover:bg-ground">
                      <td className="max-w-0 px-4 py-2.5"><a href={`/app/inspections/${encodeURIComponent(i.id)}`} className="block truncate font-medium text-ink hover:underline">{i.address || 'No address'}</a></td>
                      <td className="hidden px-4 py-2.5 text-body sm:table-cell">{titleCase(i.inspection_type) || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-body">{formatWhen(i.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No inspections in progress.</Empty>}
            {state.d.inProgress.length > 8 && <a href="/app/inspections" className="block border-t border-hairline px-4 py-2.5 text-sm font-semibold text-accent-ink hover:underline">All inspections</a>}
          </Card>

          <Card title="Recently delivered" count={state.d.delivered.length}>
            {state.d.delivered.length ? (
              <ul className="divide-y divide-hairline">
                {state.d.delivered.slice(0, 6).map(({ inspection, latest }) => (
                  <li key={inspection.id}>
                    <a href={`/app/inspections/${encodeURIComponent(inspection.id)}#reports`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ground">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink">{inspection.address || 'No address'}</span><span className="text-xs text-body">Published {formatWhen(latest.published_at)}</span></span>
                      <PhasePill phase={inspectionPhase(inspection)} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : <Empty>No reports delivered yet.</Empty>}
          </Card>
        </div>
      )}

      <p className="mt-8 text-xs text-muted">New inspections are started in the Ledrix app, where the template snapshot and capture tools live.</p>
    </Page>
  );
}

function OrderList({ rows, showDate }: { rows: OrderRow[]; showDate: boolean }) {
  return (
    <ul className="divide-y divide-hairline">
      {rows.map(o => {
        const body = (
          <>
            <p className="truncate text-sm font-medium text-ink">{o.address || 'No address'}</p>
            <p className="mt-0.5 text-xs text-body">{[showDate ? formatDate(o.order_date, { weekday: 'short', month: 'short', day: 'numeric' }) : null, titleCase(o.status ?? 'scheduled')].filter(Boolean).join(' · ')}</p>
          </>
        );
        return (
          <li key={o.id}>
            {o.inspection_id
              ? <a href={`/app/inspections/${encodeURIComponent(o.inspection_id)}`} className="block px-4 py-3 hover:bg-ground">{body}</a>
              : <div className="px-4 py-3">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}
