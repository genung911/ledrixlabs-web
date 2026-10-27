'use client';

// Templates — the company's templates, which inspection type uses each, and the way into the template editor.
//
// Roles (DECISIONS 2026-10-19, ruling 8): owners and admins edit DRAFTS; only the owner publishes, renames, deletes
// a live template or changes which template an inspection type uses. Everyone else sees the list. The database
// enforces all of it (lib/templates/api); this page only shows what each role may do and why not.
//
// Until ledger #65 is applied (backend 'local'), templates are read from the server as they are, drafts live in this
// browser, and the actions that need the server (new, duplicate, rename, delete, type assignment) say so.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader, formatWhen } from '@/components/workspace/ui';
import { Banner, Menu, Modal, Pill, btn, field, label } from '@/components/templates/ui';
import { canAuthorTemplates } from '@/lib/templateBuilder/access';
import {
  STOCK_TYPES, TemplateApiError, addInspectionType, assignTemplate, baseLabel, deleteTemplate, detectBackend, listDrafts,
  listInspectionTypes, listTemplates, removeInspectionType, renameTemplate, startNewTemplateDraft, systemCount,
  type Backend, type DraftMeta, type InspectionType, type LiveTemplate,
} from '@/lib/templates/api';

type Data = { backend: Backend; templates: LiveTemplate[]; drafts: DraftMeta[]; types: InspectionType[] };
type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: Data };
type Dialog =
  | { kind: 'rename'; t: LiveTemplate } | { kind: 'delete'; t: LiveTemplate } | { kind: 'addType' } | null;

const NEEDS_SERVER = 'Turns on with the next Ledrix app update.';

export default function TemplatesPage() {
  const { access } = useWorkspace();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const author = canAuthorTemplates(access.role);
  const owner = access.role === 'owner';

  const load = useCallback(async () => {
    if (!access.companyId) { setState({ kind: 'ready', data: { backend: 'local', templates: [], drafts: [], types: [] } }); return; }
    setState({ kind: 'loading' });
    try {
      const backend = await detectBackend();
      const templates = await listTemplates(access.companyId, backend);
      const [drafts, types] = backend === 'server'
        ? await Promise.all([author ? listDrafts(access.companyId) : Promise.resolve([]), listInspectionTypes(access.companyId)])
        : [[], STOCK_TYPES.map(name => ({ id: null, name, templateId: null, rowVersion: null, stock: true }))];
      setState({ kind: 'ready', data: { backend, templates, drafts, types } });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Templates could not be loaded.' });
    }
  }, [access.companyId, author]);
  useEffect(() => { load(); }, [load]);

  const run = useCallback(async (f: () => Promise<void>, done?: string) => {
    setBusy(true); setNotice(null);
    try { await f(); setDialog(null); if (done) setNotice(done); await load(); }
    catch (e) { setNotice(e instanceof TemplateApiError || e instanceof Error ? e.message : 'That did not work.'); }
    finally { setBusy(false); }
  }, [load]);

  const data = state.kind === 'ready' ? state.data : null;
  const server = data?.backend === 'server';
  const usedFor = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of data?.types ?? []) if (t.templateId) m.set(t.templateId, [...(m.get(t.templateId) ?? []), t.name]);
    return m;
  }, [data]);
  const draftOf = useMemo(() => new Map((data?.drafts ?? []).filter(d => d.templateId).map(d => [d.templateId as string, d])), [data]);
  const newDrafts = (data?.drafts ?? []).filter(d => !d.templateId);
  const unassigned = (data?.types ?? []).filter(t => !t.templateId).length;

  return (
    <Page>
      <PageHeader title="Templates" subtitle="Your company’s inspection templates"
        actions={author && (
          server
            ? <Link className={btn.primary} href="/app/templates/create"><span aria-hidden>+</span> New template</Link>
            : <button className={btn.primary} disabled title={NEEDS_SERVER}><span aria-hidden>+</span> New template</button>
        )} />

      {data && !server && author && (
        <div className="mb-4">
          <Banner title="Waiting on the next Ledrix app update.">
            You can open any template, edit it with Ledrix and try it in the inspector preview. Your draft stays in this browser for now.
            Publishing, new templates, deleting and inspection-type assignments turn on once the app update that syncs template versions is out.
          </Banner>
        </div>
      )}
      {notice && <div className="mb-4"><Banner tone="warn" title={notice} actions={<button className={btn.ghost} onClick={() => setNotice(null)}>Dismiss</button>} /></div>}

      {state.kind === 'loading' && <Card><Loading /></Card>}
      {state.kind === 'error' && <ErrorBox message={state.message} onRetry={load} />}
      {data && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Live templates" value={data.templates.length} />
            <Stat label="Inspection types" value={data.types.length} />
            <Stat label="Types without a template" value={server ? unassigned : '—'} warn={server && unassigned > 0} />
          </div>

          <Card title="Templates" count={data.templates.length + newDrafts.length} className="mb-6">
            {data.templates.length + newDrafts.length === 0 ? <Empty>No company templates have synced yet.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted">
                    <tr className="border-b border-hairline">
                      <th className="px-4 py-2 font-semibold">Name</th><th className="px-4 py-2 font-semibold">Based on</th>
                      <th className="px-4 py-2 font-semibold">Used for</th><th className="px-4 py-2 font-semibold">Systems</th>
                      <th className="px-4 py-2 font-semibold">Status</th><th className="px-4 py-2 font-semibold">Updated</th><th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {data.templates.map(t => {
                      const draft = draftOf.get(t.id);
                      const uses = usedFor.get(t.id) ?? [];
                      return (
                        <tr key={t.id} className="hover:bg-ink/[0.02]">
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {author ? <Link href={`/app/templates/${encodeURIComponent(t.id)}`} className="font-medium text-ink hover:underline">{t.name}</Link>
                                : <span className="font-medium text-ink">{t.name}</span>}
                              {draft && <Pill tone="accent">Draft in progress</Pill>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-body">{baseLabel(t.base)}</td>
                          <td className="px-4 py-3 text-body">{uses.length ? uses.join(', ') : <span className="text-muted">—</span>}</td>
                          <td className="px-4 py-3 font-mono text-body">{systemCount(t.tree)}</td>
                          <td className="px-4 py-3"><Pill tone="ok">Live{t.rowVersion != null ? ` · v${t.rowVersion}` : ''}</Pill></td>
                          <td className="px-4 py-3 text-xs text-muted">{formatWhen(t.updatedAt)}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-1">
                              {author && <Link href={`/app/templates/${encodeURIComponent(t.id)}`} className={btn.secondary + ' px-3 py-1.5 text-xs'}>Edit</Link>}
                              {author && <Menu label={`More actions for ${t.name}`} items={[
                                { label: 'Duplicate', disabled: !server && NEEDS_SERVER, onSelect: () => run(async () => {
                                    if (!t.tree) throw new Error('This template has no systems to copy.');
                                    const d = await startNewTemplateDraft(access.companyId!, { name: `Copy of ${t.name}`, base: t.base, tree: t.tree });
                                    router.push(`/app/templates/new?draft=${encodeURIComponent(d.id)}`);
                                  }) },
                                { label: 'Rename', disabled: !server ? NEEDS_SERVER : !owner && 'Only the company owner can rename a live template.', onSelect: () => setDialog({ kind: 'rename', t }) },
                                { label: 'Delete', danger: true, disabled: !server ? NEEDS_SERVER : !owner && 'Only the company owner can delete a template.', onSelect: () => setDialog({ kind: 'delete', t }) },
                              ]} />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {newDrafts.map(d => (
                      <tr key={d.id}>
                        <td className="px-4 py-3"><div className="flex items-center gap-2">
                          <Link href={`/app/templates/new?draft=${encodeURIComponent(d.id)}`} className="font-medium text-ink hover:underline">{d.name}</Link>
                          <Pill tone="accent">New · not published</Pill></div></td>
                        <td className="px-4 py-3 text-muted">—</td><td className="px-4 py-3 text-muted">—</td><td className="px-4 py-3 text-muted">—</td>
                        <td className="px-4 py-3"><Pill>Draft</Pill></td>
                        <td className="px-4 py-3 text-xs text-muted">{formatWhen(d.updatedAt)}</td>
                        <td className="px-2 py-2 text-right"><Link href={`/app/templates/new?draft=${encodeURIComponent(d.id)}`} className={btn.secondary + ' px-3 py-1.5 text-xs'}>Edit</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Inspection types" count={data.types.length}>
            <ul className="divide-y divide-hairline">
              {data.types.map(t => (
                <li key={t.id ?? t.name} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{t.name}</p>
                    {server && !t.templateId && <p className="text-xs text-ink"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />No template — new inspections of this type can’t start from one.</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {server ? (
                      <select aria-label={`Template for ${t.name}`} disabled={!owner || busy} value={t.templateId ?? ''}
                        title={owner ? undefined : 'Only the company owner can change this.'}
                        onChange={e => run(() => assignTemplate(access.companyId!, t, e.target.value || null))}
                        className={`${field} w-56 py-1.5`}>
                        <option value="">— choose a template —</option>
                        {data.templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    ) : <span className="text-xs text-muted">Set in the Ledrix app for now</span>}
                    {server && owner && !t.stock && t.id && (
                      <button className={btn.icon} aria-label={`Remove ${t.name}`} onClick={() => run(() => removeInspectionType(t))}>×</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-hairline px-4 py-3">
              {server && owner
                ? <button className={btn.ghost} onClick={() => setDialog({ kind: 'addType' })}>+ Add inspection type</button>
                : <p className="text-xs text-muted">{server ? 'Only the company owner can add inspection types or change which template each one uses.' : NEEDS_SERVER}</p>}
            </div>
          </Card>
          <p className="mt-4 text-xs text-muted">Only the owner can publish, delete, or change which template a type uses. Inspections already underway keep the template they started with.</p>
        </>
      )}

      {dialog?.kind === 'rename' && <RenameDialog t={dialog.t} busy={busy} onClose={() => setDialog(null)}
        onRename={name => run(() => renameTemplate(dialog.t, name), `Renamed to ${name}.`)} />}
      {data && dialog?.kind === 'delete' && <DeleteDialog t={dialog.t} uses={usedFor.get(dialog.t.id) ?? []} busy={busy} onClose={() => setDialog(null)}
        onDelete={() => run(() => deleteTemplate(dialog.t), `${dialog.t.name} was deleted.`)} />}
      {data && dialog?.kind === 'addType' && <AddTypeDialog templates={data.templates} busy={busy} onClose={() => setDialog(null)}
        onAdd={(name, templateId) => run(() => addInspectionType(access.companyId!, name, templateId, data.types.length), `Added ${name}.`)} />}
    </Page>
  );
}

function Stat({ label: l, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{l}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? 'text-ink' : 'text-ink'}`}>{value}{warn && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-warn align-middle" />}</p>
    </div>
  );
}

function RenameDialog({ t, busy, onClose, onRename }: { t: LiveTemplate; busy: boolean; onClose: () => void; onRename: (name: string) => void }) {
  const [name, setName] = useState(t.name);
  return (
    <Modal open title={`Rename ${t.name}`} onClose={onClose} footer={<>
      <button className={btn.secondary} onClick={onClose}>Cancel</button>
      <button className={btn.primary} disabled={!name.trim() || name.trim() === t.name || busy} onClick={() => onRename(name.trim())}>Rename</button>
    </>}>
      <label className={label} htmlFor="tpl-rename">Name</label>
      <input id="tpl-rename" className={field} value={name} onChange={e => setName(e.target.value)} maxLength={120} />
      <p className="mt-3 text-xs text-muted">Renames the live template right away. Inspections already started keep the name they started with.</p>
    </Modal>
  );
}

function DeleteDialog({ t, uses, busy, onClose, onDelete }: { t: LiveTemplate; uses: string[]; busy: boolean; onClose: () => void; onDelete: () => void }) {
  return (
    <Modal open title={uses.length ? `${t.name} is in use` : `Delete ${t.name}?`} onClose={onClose} footer={uses.length
      ? <button className={btn.primary} onClick={onClose}>OK</button>
      : <><button className={btn.secondary} onClick={onClose}>Cancel</button><button className={btn.danger} disabled={busy} onClick={onDelete}>{busy ? 'Deleting…' : 'Delete'}</button></>}>
      {uses.length
        ? <p>{t.name} is used for <span className="font-semibold text-ink">{uses.join(', ')}</span>. Choose another template for {uses.length === 1 ? 'that type' : 'those types'} first.</p>
        : <p>New inspections can’t use {t.name} after this. Inspections that already used it keep their copy, and phones that still have it won’t bring it back.</p>}
    </Modal>
  );
}

function AddTypeDialog({ templates, busy, onClose, onAdd }: { templates: LiveTemplate[]; busy: boolean; onClose: () => void; onAdd: (name: string, templateId: string | null) => void }) {
  const [name, setName] = useState('');
  const [tpl, setTpl] = useState('');
  return (
    <Modal open title="Add inspection type" onClose={onClose} footer={<>
      <button className={btn.secondary} onClick={onClose}>Cancel</button>
      <button className={btn.primary} disabled={!name.trim() || busy} onClick={() => onAdd(name.trim(), tpl || null)}>Add</button>
    </>}>
      <label className={label} htmlFor="type-name">Name</label>
      <input id="type-name" className={field} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Construction" maxLength={80} />
      <label className={`${label} mt-4`} htmlFor="type-tpl">Template</label>
      <select id="type-tpl" className={field} value={tpl} onChange={e => setTpl(e.target.value)}>
        <option value="">— choose later —</option>
        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </Modal>
  );
}
