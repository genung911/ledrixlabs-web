'use client';

// Templates — the company's synced templates (company_templates, the table the app's templateSyncService writes)
// and the entry point to the desktop Template Builder (/app/templates/[id]). Owners and admins open a template to
// draft changes with Ledrix in a PRIVATE draft; everyone else sees the list. Nothing here writes a template:
// publishing a draft is a later increment, and inspections keep the snapshot they started with.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader, formatWhen, titleCase } from '@/components/workspace/ui';
import { loadTemplates, type TemplateRow } from '@/lib/workspace/data';
import { canAuthorTemplates } from '@/lib/templateBuilder/access';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; rows: TemplateRow[] };

export default function TemplatesPage() {
  const { access } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const author = canAuthorTemplates(access.role);

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
        {author ? (
          <><span className="font-semibold text-ink">Draft with Ledrix.</span>{' '}
          Open a template to describe changes to one system and review what Ledrix proposes. Changes go to a private draft in this browser: your live template, every inspection and each inspection’s template snapshot stay exactly as they are. Publishing comes in a later update. Guided setup and direct editing stay in the Ledrix app.</>
        ) : (
          <><span className="font-semibold text-ink">Built in the Ledrix app.</span>{' '}
          Company owners and admins draft template changes. Each inspection keeps the template snapshot it started with, so editing a template never changes an inspection already underway.</>
        )}
      </div>
      {state.kind === 'loading' && <Card><Loading /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && (
        <Card title="Synced templates" count={state.rows.length}>
          {state.rows.length === 0 ? <Empty>No company templates have synced yet.</Empty> : (
            <ul className="divide-y divide-hairline">
              {state.rows.map(t => {
                const inner = (
                  <>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{t.name}{t.is_default && <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent-ink">Default</span>}</p>
                      <p className="text-xs text-body">{t.base ? `Based on ${titleCase(t.base)}` : 'Custom'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="hidden text-xs text-muted sm:inline">Updated {formatWhen(t.updated_at)}</span>
                      {author && <span className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink">Open builder</span>}
                    </div>
                  </>
                );
                return (
                  <li key={t.id}>
                    {author
                      ? <Link href={`/app/templates/${encodeURIComponent(t.id)}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink/[0.03] focus:outline-none focus-visible:bg-ink/[0.03]">{inner}</Link>
                      : <div className="flex items-center justify-between gap-3 px-4 py-3">{inner}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </Page>
  );
}
