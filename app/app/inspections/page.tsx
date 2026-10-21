'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader, PhasePill, SyncLine, formatWhen, titleCase } from '@/components/workspace/ui';
import { latestUpdate } from '@/lib/workspace/model';
import { loadFindingCounts, loadInspections, loadMembers } from '@/lib/workspace/data';
import { inspectionPhase, type FindingCounts, type InspectionRow, type Phase } from '@/lib/workspace/model';

type Data = { rows: InspectionRow[]; counts: Record<string, FindingCounts>; names: Record<string, string> };
type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: Data };
const FILTERS: { id: 'all' | Phase; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'in_progress', label: 'In progress' }, { id: 'completed', label: 'Completed' }, { id: 'archived', label: 'Archived' },
];

export default function InspectionsPage() {
  const { access } = useWorkspace();
  const findingsVisible = access.role !== 'office';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | Phase>('all');
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const rows = await loadInspections();
      const [counts, members] = await Promise.all([
        findingsVisible ? loadFindingCounts(rows.map(r => r.id)) : Promise.resolve({}),
        access.companyId ? loadMembers().catch(() => []) : Promise.resolve([]),
      ]);
      const names: Record<string, string> = {};
      for (const m of members) if (m.full_name) names[m.id] = m.full_name;
      if (access.name) names[access.userId] = access.name;
      setState({ kind: 'ready', data: { rows, counts, names } });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Inspections could not load.' });
    }
  }, [findingsVisible, access.companyId, access.name, access.userId]);

  useEffect(() => { load(); }, [load]);

  // "/" focuses search (skipped while typing in another field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) { e.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const needle = q.trim().toLowerCase();
    return state.data.rows.filter(r =>
      (filter === 'all' || inspectionPhase(r) === filter) &&
      (!needle || [r.address, r.inspection_type, r.id].some(v => (v ?? '').toLowerCase().includes(needle))));
  }, [state, q, filter]);

  return (
    <Page>
      <PageHeader title="Inspections" subtitle={access.managesCompany ? 'Your company’s inspections' : 'Inspections you created or are assigned to'} />
      <SyncLine lastSync={state.kind === 'ready' ? latestUpdate(state.data.rows) : undefined} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${filter === f.id ? 'bg-ink text-surface' : 'bg-surface text-body ring-1 ring-hairline hover:text-ink'}`}>{f.label}</button>
          ))}
        </div>
        <input ref={search} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search address or type   /"
          aria-label="Search inspections"
          className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:w-72" />
      </div>

      {state.kind === 'loading' && <Card><Loading /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && (
        <Card>
          {visible.length === 0 ? (
            <Empty>{state.data.rows.length ? 'No inspections match.' : 'No inspections have synced to your account yet.'}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-hairline text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Property</th>
                    <th className="px-4 py-2.5 font-semibold">Type</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    {findingsVisible && <th className="px-4 py-2.5 font-semibold">Findings</th>}
                    <th className="px-4 py-2.5 font-semibold">Inspector</th>
                    <th className="px-4 py-2.5 font-semibold">Last synced</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {visible.map(r => {
                    const c = state.data.counts[r.id];
                    const who = r.assigned_inspector_id ?? r.inspector_id;
                    return (
                      <tr key={r.id} className="hover:bg-ground">
                        <td className="max-w-[18rem] px-4 py-2.5"><a href={`/app/inspections/${encodeURIComponent(r.id)}`} className="block truncate font-medium text-ink hover:underline focus:underline focus:outline-none">{r.address || 'No address'}</a></td>
                        <td className="px-4 py-2.5 text-body">{titleCase(r.inspection_type) || '—'}</td>
                        <td className="px-4 py-2.5"><PhasePill phase={inspectionPhase(r)} /></td>
                        {findingsVisible && (
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-body">
                            {c ? <>{c.confirmed} confirmed{c.proposed ? <span className="ml-2 rounded bg-warn/20 px-1.5 py-0.5 text-ink">{c.proposed} to review</span> : null}</> : '0'}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-body">{(who && state.data.names[who]) || (who ? 'Company member' : '—')}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-body">{formatWhen(r.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </Page>
  );
}
