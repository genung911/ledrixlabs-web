'use client';

// Company — who this workspace belongs to (2026-10-21, approved parity mockup).
// Website Apple pass (owner 2026-11-23, mockup CXThxTV8YKrVAaDGGa64to; "Company profile editable on the website? — Yes"):
// a System Settings–style grouped list. The name and the logo are EDITABLE here and save as you go — the same two rows
// the phone writes (`companies.name`, owner only; `company_branding`, Company settings), which reports print. Everyone
// else sees the same list read-only. The training switch keeps its card and its plain explanation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CompanyTabs } from '@/components/workspace/CompanyTabs';
import { roleLabel, useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, ErrorBox, FieldRow, Group, Loading, Page, PageHeader, Row } from '@/components/workspace/ui';
import { loadMembers, loadTemplates } from '@/lib/workspace/data';
import { loadCompanyProfile, logoDataUri, saveCompanyLogo, saveCompanyName } from '@/lib/office/companyProfile';
import { TrainingCard } from '@/components/workspace/TrainingCard';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; members: number; templates: number; name: string; logo: string | null };

export default function CompanyPage() {
  const { access, companyName } = useWorkspace();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const isOwner = access.role === 'owner' || access.role === 'ledrix_admin';
  const mayBrand = isOwner || access.role === 'admin';

  const load = useCallback(async () => {
    if (!access.companyId) { setState({ kind: 'ready', members: 0, templates: 0, name: companyName ?? '', logo: null }); return; }
    setState({ kind: 'loading' });
    try {
      const [members, templates, profile] = await Promise.all([loadMembers(), loadTemplates(access.companyId), loadCompanyProfile(access.companyId)]);
      setState({ kind: 'ready', members: members.length, templates: templates.length, name: profile.name || (companyName ?? ''), logo: profile.logo });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'The company could not load.' });
    }
  }, [access.companyId, companyName]);
  useEffect(() => { load(); }, [load]);

  const setLogo = async (dataUri: string | null) => {
    if (!access.companyId) return;
    setLogoBusy(true); setLogoErr(null);
    try { await saveCompanyLogo(access.companyId, dataUri); setState(s => s.kind === 'ready' ? { ...s, logo: dataUri } : s); }
    catch (e) { setLogoErr(e instanceof Error ? e.message : 'The logo was not saved.'); }
    finally { setLogoBusy(false); }
  };

  return (
    <Page>
      <PageHeader title="Company" subtitle={state.kind === 'ready' ? `${state.name || 'Your company'} · ${roleLabel(access.role)}` : undefined} />
      <CompanyTabs />
      {state.kind === 'loading' && <Card><Loading /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {state.kind === 'ready' && (
        <div className="flex max-w-3xl flex-col gap-6">
          <Group heading="Profile" footnote={isOwner ? 'Changes save as you go. Reports and the client’s web report use this name and logo.' : 'The company owner changes the name and logo.'}>
            {isOwner && access.companyId
              ? <FieldRow label="Name" value={state.name} placeholder="Your company name" onSave={v => saveCompanyName(access.companyId!, v)} />
              : <Row label="Name" value={state.name || '—'} />}
            <div className="flex min-h-[44px] items-center gap-3 px-4 py-2">
              <span className="w-40 shrink-0 text-sm text-ink">Logo</span>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                {/* Shown on white — the paper the report prints on. */}
                <span className="grid h-12 w-28 place-items-center overflow-hidden rounded-md border border-hairline bg-white">
                  {state.logo ? <img src={state.logo} alt="Company logo" className="max-h-11 max-w-[6.5rem] object-contain" /> : <span className="text-xs text-muted">No logo</span>}
                </span>
                {logoErr && <span className="text-xs text-safety">{logoErr}</span>}
              </span>
              {mayBrand && (
                <span className="flex shrink-0 items-center gap-4">
                  <button type="button" disabled={logoBusy} onClick={() => file.current?.click()} className="text-sm font-semibold text-accent-ink hover:underline disabled:opacity-50">
                    {logoBusy ? 'Saving…' : state.logo ? 'Change' : 'Upload'}
                  </button>
                  {state.logo && <button type="button" disabled={logoBusy} onClick={() => { if (window.confirm('Remove the logo from your reports?')) void setLogo(null); }} className="text-sm font-semibold text-safety hover:underline disabled:opacity-50">Remove</button>}
                </span>
              )}
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { await setLogo(await logoDataUri(f)); } catch (x) { setLogoErr(x instanceof Error ? x.message : 'That logo could not be used.'); } }} />
            </div>
            <Row label="Your role" value={roleLabel(access.role)} />
          </Group>
          <Group heading="Your company">
            <Row label="Team" value={`${state.members} ${state.members === 1 ? 'member' : 'members'}`} href="/app/team" />
            <Row label="Templates" value={`${state.templates} ${state.templates === 1 ? 'template' : 'templates'}`} href="/app/templates" />
          </Group>
          {access.companyId && <TrainingCard companyId={access.companyId} companyName={state.name || companyName || null} isOwner={access.role === 'owner'} />}
          <p className="px-3 text-xs text-muted">Removing the company is done in the Ledrix app (Settings › Company profile, last row), where it asks you to type the name.</p>
        </div>
      )}
    </Page>
  );
}
