'use client';

// Templates — discoverability only. Lists the company's synced templates (company_templates, the
// table the app's templateSyncService already writes) and points to the Template Builder, which
// lives in the Ledrix app (TemplatesScreen / TemplateEditorScreen / TemplateSetupScreen). No tree is
// loaded and nothing is editable here: there must be one template system, not two.
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader, formatWhen, titleCase } from '@/components/workspace/ui';
import { loadTemplates, type TemplateRow } from '@/lib/workspace/data';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; rows: TemplateRow[] };

export default function TemplatesPage() {
  const { access } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!access.companyId) { setState({ kind: 'ready', rows: [] }); return; }
    setState({ kind: 'loading' });
    try { setState({ kind: 'ready', rows: await loadTemplates(access.companyId) }); }
    catch (e) { setState({ kind: 'error', message: e instanceof Error ? e.message : 'Templates could not load.' }); }
  }, [access.companyId]);
  useEffect(() => { load(); }, [load]);

  return (
    <Page>
      <PageHeader title="Templates" subtitle="Your company’s inspection templates" />
      <div className="mb-6 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-body">
        <span className="font-semibold text-ink">Built in the Ledrix app.</span>{' '}
        Open <span className="font-medium text-ink">Templates</span> in the app to build, edit or set up a template with Ledrix. Each inspection keeps the template snapshot it started with, so editing a template never changes an inspection already underway.
      </div>
      {state.kind === 'loading' && <Card><Loading /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && (
        <Card title="Synced templates" count={state.rows.length}>
          {state.rows.length === 0 ? <Empty>No company templates have synced yet.</Empty> : (
            <ul className="divide-y divide-hairline">
              {state.rows.map(t => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{t.name}{t.is_default && <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent-ink">Default</span>}</p>
                    <p className="text-xs text-body">{t.base ? `Based on ${titleCase(t.base)}` : 'Custom'}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">Updated {formatWhen(t.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </Page>
  );
}
