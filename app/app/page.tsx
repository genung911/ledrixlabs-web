'use client';

// Company dashboard — every figure is a count of rows the signed-in user's RLS returned. Nothing is
// estimated, sampled or invented; a section with no rows says so.
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { NewInspectionButton } from '@/components/office/NewInspectionButton';
import { Card, Empty, ErrorBox, Group, Loading, Page, PageHeader, Row, SyncLine, formatDate, formatWhen, titleCase, useReloadOnFocus } from '@/components/workspace/ui';
import { loadFindingCounts, loadInspections, loadOrders, loadReports } from '@/lib/workspace/data';
import { addDays, buildDashboard, latestUpdate, localDate, type Dashboard, type OrderRow } from '@/lib/workspace/model';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; d: Dashboard; lastSync: string | null };

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
      setState({ kind: 'ready', d: buildDashboard({ inspections, findings, orders, reports, today }), lastSync: latestUpdate(inspections) });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'The dashboard could not load.' });
    }
  }, [findingsVisible]);

  useEffect(() => { load(); }, [load]);
  useReloadOnFocus(load);

  // Website Apple pass (owner 2026-11-23, mockup CXThxTV8YKrVAaDGGa64to): the phone's Home on a wider screen — Today on
  // the left, Needs attention on the right, as grouped rows; In progress and Recently delivered are rows in those two
  // groups' columns, not cards of their own. No Refresh: the page reloads when you come back to it. One button: New inspection.
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greeting = access.name ? `${hello}, ${access.name.split(' ')[0]}` : hello;
  const dateLine = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const todayN = state.kind === 'ready' ? state.d.today.length : null;
  const scope = access.managesCompany ? (companyName ?? 'Your company') : 'Inspections you created or are assigned to';

  return (
    <Page>
      <PageHeader title={greeting}
        subtitle={[dateLine, todayN === null ? null : `${todayN} ${todayN === 1 ? 'job' : 'jobs'} today`, scope].filter(Boolean).join(' · ')}
        actions={<NewInspectionButton />} />
      <SyncLine lastSync={state.kind === 'ready' ? state.lastSync : undefined} />

      {state.kind === 'loading' && <Card><Loading label="Loading your company’s work…" /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <Group heading={`Today · ${state.d.today.length}`}>
              {state.d.today.length ? state.d.today.map(o => <OrderRowItem key={o.id} o={o} showDate={false} />) : <Empty>Nothing scheduled today.</Empty>}
            </Group>
            <Group heading={`Next 14 days · ${state.d.upcoming.length}`}>
              {state.d.upcoming.length ? state.d.upcoming.map(o => <OrderRowItem key={o.id} o={o} showDate />) : <Empty>Nothing scheduled in the next two weeks.</Empty>}
            </Group>
            <Group heading={`In progress · ${state.d.inProgress.length}`}
              footnote={state.d.inProgress.length > 8 ? <a href="/app/inspections" className="font-semibold text-accent-ink hover:underline">All inspections ›</a> : null}>
              {state.d.inProgress.length ? state.d.inProgress.slice(0, 8).map(i => (
                <Row key={i.id} href={`/app/inspections/${encodeURIComponent(i.id)}`} label={i.address || 'No address'}
                  sub={titleCase(i.inspection_type) || undefined} value={`synced ${formatWhen(i.updated_at)}`} />
              )) : <Empty>No inspections in progress.</Empty>}
            </Group>
          </div>
          <div className="flex flex-col gap-6">
            <Group heading={`Needs attention · ${state.d.attention.length}`}
              footnote={!findingsVisible ? 'Proposed findings aren’t visible to the Office role, so review items don’t appear here.' : null}>
              {state.d.attention.length ? state.d.attention.map(a => (
                <Row key={`${a.reason}-${a.inspection.id}`}
                  href={`/app/inspections/${encodeURIComponent(a.inspection.id)}${a.reason === 'review' ? '#review' : ''}`}
                  label={a.inspection.address || 'No address'}
                  sub={a.reason === 'review' ? 'Findings to review' : 'Completed — report not sent'} valueTone="need" value="•" />
              )) : <Empty>Nothing waiting on anyone.</Empty>}
            </Group>
            <Group heading={`Recently delivered · ${state.d.delivered.length}`}>
              {state.d.delivered.length ? state.d.delivered.slice(0, 6).map(({ inspection, latest }) => (
                <Row key={inspection.id} href={`/app/inspections/${encodeURIComponent(inspection.id)}#reports`}
                  label={inspection.address || 'No address'} sub={`Published ${formatWhen(latest.published_at)}`} />
              )) : <Empty>No reports delivered yet.</Empty>}
            </Group>
            <p className="px-3 text-xs text-muted">Start a job here or in the Ledrix app — both make the same inspection, and it reaches the inspector’s phone at the next sync.</p>
          </div>
        </div>
      )}
    </Page>
  );
}

function OrderRowItem({ o, showDate }: { o: OrderRow; showDate: boolean }) {
  const sub = [showDate ? formatDate(o.order_date, { weekday: 'short', month: 'short', day: 'numeric' }) : null, titleCase(o.status ?? 'scheduled')].filter(Boolean).join(' · ');
  return <Row label={o.address || 'No address'} sub={sub} href={o.inspection_id ? `/app/inspections/${encodeURIComponent(o.inspection_id)}` : undefined} />;
}
