'use client';

// Company — who this workspace belongs to (2026-10-21, approved parity mockup). Read-only first: the profile, branding
// and booking settings are owner-only and edited in the Ledrix app today; this page says so rather than offering
// fields it cannot save.
import { useCallback, useEffect, useState } from 'react';
import { roleLabel, useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, ErrorBox, Loading, Page, PageHeader } from '@/components/workspace/ui';
import { loadMembers, loadTemplates } from '@/lib/workspace/data';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; members: number; templates: number };

export default function CompanyPage() {
  const { access, companyName } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!access.companyId) { setState({ kind: 'ready', members: 0, templates: 0 }); return; }
    setState({ kind: 'loading' });
    try {
      const [members, templates] = await Promise.all([loadMembers(), loadTemplates(access.companyId)]);
      setState({ kind: 'ready', members: members.length, templates: templates.length });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'The company could not load.' });
    }
  }, [access.companyId]);
  useEffect(() => { load(); }, [load]);

  const Fact = ({ label, value, href }: { label: string; value: string; href?: string }) => (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium text-ink">{href ? <a href={href} className="hover:underline">{value}</a> : value}</dd>
    </div>
  );

  return (
    <Page>
      <PageHeader title="Company" subtitle={companyName ?? 'Your company'} />
      {state.kind === 'loading' && <Card><Loading /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && (
        <Card title="Profile">
          <dl className="divide-y divide-hairline">
            <Fact label="Company" value={companyName ?? '—'} />
            <Fact label="Your role" value={roleLabel(access.role)} />
            <Fact label="Team" value={`${state.members} ${state.members === 1 ? 'member' : 'members'}`} href="/app/team" />
            <Fact label="Templates" value={`${state.templates} ${state.templates === 1 ? 'template' : 'templates'}`} href="/app/templates" />
          </dl>
        </Card>
      )}
      <p className="mt-6 text-xs text-muted">
        {access.role === 'owner'
          ? 'Your company profile, branding and booking settings are edited in the Ledrix app (Company › Company profile). Editing here comes later.'
          : 'The company profile, branding and booking settings are managed by the company owner.'}
      </p>
    </Page>
  );
}
