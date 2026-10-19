'use client';

import { useCallback, useEffect, useState } from 'react';
import { roleLabel, useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader } from '@/components/workspace/ui';
import { loadMembers, type MemberRow } from '@/lib/workspace/data';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; rows: MemberRow[] };

export default function TeamPage() {
  const { companyName, access } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try { setState({ kind: 'ready', rows: await loadMembers() }); }
    catch (e) { setState({ kind: 'error', message: e instanceof Error ? e.message : 'The team could not load.' }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <Page>
      <PageHeader title="Team" subtitle={companyName ?? 'Your company'} />
      {state.kind === 'loading' && <Card><Loading /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && (
        <Card count={state.rows.length} title="Members">
          {state.rows.length === 0 ? <Empty>No members found.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-hairline text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5 font-semibold">Name</th><th className="px-4 py-2.5 font-semibold">Role</th><th className="px-4 py-2.5 font-semibold">Email</th><th className="px-4 py-2.5 font-semibold">Phone</th></tr></thead>
                <tbody className="divide-y divide-hairline">
                  {state.rows.map(m => (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 font-medium text-ink">{m.full_name || '—'}{m.id === access.userId && <span className="ml-2 text-xs text-muted">(you)</span>}</td>
                      <td className="px-4 py-2.5 text-body">{roleLabel(m.role)}</td>
                      <td className="px-4 py-2.5 text-body">{m.email || '—'}</td>
                      <td className="px-4 py-2.5 text-body">{m.phone || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      <p className="mt-6 text-xs text-muted">Invitations and role changes are made in the Ledrix app.</p>
    </Page>
  );
}
