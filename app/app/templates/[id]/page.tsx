'use client';

// Template Builder (desktop) — "Draft with Ledrix" for one company template.
//
// The same flow and the same pure core as the app's TemplateDraftScreen (lib/templateBuilder/core is a
// byte-identical copy): pick a system, say what should change, review Ledrix's proposals (accept, decline, edit,
// accept all content), apply the accepted ones to a PRIVATE draft, undo any applied change.
//
// Isolation: the live template is read once (company_templates, SELECT only) and copied into a draft kept in this
// browser. Nothing here writes company_templates, an inspection, or an inspection's template snapshot, and there
// is no publish. Owners and admins only (the server route enforces it too).
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/components/workspace/WorkspaceShell';
import { Card, Empty, ErrorBox, Loading, Page, PageHeader, formatWhen } from '@/components/workspace/ui';
import { loadTemplateTree } from '@/lib/workspace/data';
import { canAuthorTemplates } from '@/lib/templateBuilder/access';
import { createDraftStore } from '@/lib/templateBuilder/draftStore';
import { createBuilderSession, type Author } from '@/lib/templateBuilder/session';
import { callTemplateAuthoring } from '@/lib/templateBuilder/remote';
import { editableOf, withEdit } from '@/lib/templateBuilder/edit';
import { draftHistory, type TemplateDraft } from '@/lib/templateBuilder/core/templateDraft';
import { summarizeChangeSet, type EntrySummary } from '@/lib/templateBuilder/core/templateOpSummary';
import { acceptedProblems, type ChangeEntry, type RefusedProposal } from '@/lib/templateBuilder/core/templateChangeSets';
import type { InspectionTemplate, TemplateNode } from '@/lib/templateBuilder/core/InspectionTemplate';

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'denied' } | { kind: 'ready' };
type Notice = { tone: 'ok' | 'bad'; text: string } | null;

const btnPrimary = 'rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const btnPlain = 'rounded-full border border-hairline bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const btnSmall = 'rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5 disabled:opacity-50';
const field = 'w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

const STATUS_WORD: Record<string, string> = { proposed: 'Proposed', accepted: 'Accepted', edited: 'Edited', declined: 'Declined' };

function isTree(x: unknown): x is InspectionTemplate {
  return !!x && typeof x === 'object' && Array.isArray((x as InspectionTemplate).systems);
}

export default function TemplateBuilderPage() {
  const { access } = useWorkspace();
  const params = useParams<{ id: string }>();
  const templateId = decodeURIComponent(String(params?.id ?? ''));
  const author = canAuthorTemplates(access.role);
  const companyId = access.companyId;

  const session = useMemo(() => (companyId && templateId
    ? createBuilderSession({ companyId, templateId, store: createDraftStore(), call: callTemplateAuthoring })
    : null), [companyId, templateId]);
  const who: Author = useMemo(() => ({ userId: access.userId, role: access.role }), [access.userId, access.role]);

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [liveChanged, setLiveChanged] = useState(false);
  const [liveUpdated, setLiveUpdated] = useState<string | null>(null);
  const [systemId, setSystemId] = useState<string>('');
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [openSys, setOpenSys] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [refusedNow, setRefusedNow] = useState<RefusedProposal[]>([]);

  const start = useCallback(async () => {
    if (!author) { setLoad({ kind: 'denied' }); return; }
    if (!companyId || !session) { setLoad({ kind: 'error', message: 'Your account is not part of a company, so there are no company templates to draft.' }); return; }
    setLoad({ kind: 'loading' });
    try {
      const row = await loadTemplateTree(companyId, templateId);
      if (!row) { setLoad({ kind: 'error', message: 'This template is not one your account can see.' }); return; }
      if (!isTree(row.template)) { setLoad({ kind: 'error', message: 'This template has not synced its systems from the app yet. Open it in the Ledrix app once, then try again.' }); return; }
      const live = { ...row.template, name: row.template.name || row.name };
      const r = session.startOrResume(live);
      setDraft(r.draft); setLiveChanged(r.liveChanged); setLiveUpdated(row.updated_at);
      setSystemId(s => s || r.draft.pending?.ai?.systemId || r.draft.tree.systems[0]?.id || '');
      setLoad({ kind: 'ready' });
    } catch (e) {
      setLoad({ kind: 'error', message: e instanceof Error ? e.message : 'The draft could not be opened.' });
    }
  }, [author, companyId, session, templateId]);
  useEffect(() => { start(); }, [start]);

  const summaries: EntrySummary[] = useMemo(() => (draft?.pending ? summarizeChangeSet(draft.pending, draft.tree) : []), [draft]);
  const problems = useMemo(() => (draft?.pending ? acceptedProblems(draft.pending, draft.tree) : new Map<string, string>()), [draft]);
  const groups = useMemo(() => {
    const m = new Map<string, EntrySummary[]>();
    for (const s of summaries) { const k = s.section.join(' › ') || 'Template'; m.set(k, [...(m.get(k) ?? []), s]); }
    return Array.from(m.entries());
  }, [summaries]);
  const history = useMemo(() => (draft ? draftHistory(draft) : []), [draft]);

  /** Every action: run, show the result, never lose the last good state. */
  const run = useCallback(async <T,>(f: () => T | Promise<T>): Promise<T | null> => {
    setBusy(true); setNotice(null);
    try { return await f(); }
    catch (e) { setNotice({ tone: 'bad', text: e instanceof Error ? e.message : 'The draft could not be saved. Your last saved state is unchanged.' }); return null; }
    finally { setBusy(false); }
  }, []);

  if (load.kind === 'denied') {
    return (
      <Page>
        <PageHeader title="Template Builder" />
        <ErrorBox message="Only a company owner or admin can draft template changes." />
        <p className="mt-4 text-sm"><Link href="/app/templates" className="font-semibold text-accent-ink hover:underline">Back to templates</Link></p>
      </Page>
    );
  }
  if (load.kind === 'error') {
    return (
      <Page>
        <PageHeader title="Template Builder" />
        <ErrorBox message={load.message} onRetry={start} />
        <p className="mt-4 text-sm"><Link href="/app/templates" className="font-semibold text-accent-ink hover:underline">Back to templates</Link></p>
      </Page>
    );
  }
  if (load.kind === 'loading' || !draft || !session) return <Page><PageHeader title="Template Builder" /><Card><Loading label="Opening the draft…" /></Card></Page>;

  const pending = draft.pending;
  const appliedCount = draft.log.filter(c => c.source !== 'rollback').reduce((n, c) => n + c.entries.filter(e => e.status === 'applied').length, 0);
  const sysLabel = (id: string | undefined) => draft.tree.systems.find(s => s.id === id)?.label ?? '';

  // ── actions ──────────────────────────────────────────────────────────────────────────────────────────────
  const ask = async () => {
    if (!systemId || !request.trim()) return;
    const r = await run(() => session.propose({ systemId, request, author: who }));
    if (!r) return;
    if (!r.ok) { setRefusedNow(r.refused); setNotice({ tone: 'bad', text: r.error }); return; }
    setRefusedNow([]); setDraft(r.draft); setRequest(''); setOpenEntry(null);
    setNotice({ tone: 'ok', text: `Ledrix proposed ${r.cs.entries.length} change${r.cs.entries.length === 1 ? '' : 's'}. Nothing applies until you accept it.` });
  };
  const decide = async (entryId: string, d: 'accepted' | 'declined' | 'proposed') => {
    const r = await run(() => session.decide(entryId, d));
    if (!r) return;
    if (r.ok) setDraft(r.draft); else setNotice({ tone: 'bad', text: r.error });
  };
  const edit = async (entryId: string, op: unknown) => {
    const r = await run(() => session.edit(entryId, op));
    if (!r) return;
    if (r.ok) { setDraft(r.draft); setNotice({ tone: 'ok', text: 'Edit saved and accepted.' }); } else setNotice({ tone: 'bad', text: `Edit not saved: ${r.error}` });
  };
  const acceptSection = async (section?: string) => {
    const r = await run(() => session.acceptContent(section ? (e: ChangeEntry) => summaries.find(s => s.entry.id === e.id)?.section.join(' › ') === section : undefined));
    if (!r) return;
    if (!r.ok) { setNotice({ tone: 'bad', text: r.error }); return; }
    setDraft(r.draft);
    if (r.skipped?.length) {
      const why = r.skipped.map(x => `${summaries.find(s => s.entry.id === x.entryId)?.title ?? x.entryId}: ${x.reason}`).join(' · ');
      setNotice({ tone: 'bad', text: `${r.skipped.length} not accepted because they cannot apply yet — ${why}` });
    }
  };
  const apply = async (recheck = false) => {
    const r = await run(() => session.apply({ recheck }));
    if (!r) return;
    if (r.ok) { setDraft(r.draft); setOpenEntry(null); setNotice({ tone: 'ok', text: 'Applied to your private draft. Your live template is unchanged.' }); return; }
    if (r.code === 'stale_draft' && !recheck) {
      if (window.confirm(`${r.error}\n\nCheck each accepted change against the draft as it is now?`)) apply(true);
      return;
    }
    const which = r.entryId ? summaries.find(s => s.entry.id === r.entryId)?.title : null;
    setNotice({ tone: 'bad', text: `Nothing was applied. ${which ? `${which}: ` : ''}${r.error}` });
  };
  const undo = async (id: string) => {
    if (!window.confirm('Undo this change in the draft? If something you changed later depends on it, the undo is refused.')) return;
    const r = await run(() => session.undo(id, who));
    if (!r) return;
    if (r.ok) { setDraft(r.draft); setNotice({ tone: 'ok', text: 'Undone in the draft.' }); } else setNotice({ tone: 'bad', text: `Not undone: ${r.error}` });
  };
  const dismiss = async () => {
    if (!window.confirm('Dismiss these proposals? Nothing has been applied. Your decisions on them are dropped.')) return;
    const r = await run(() => session.dismiss());
    if (r?.ok) { setDraft(r.draft); setOpenEntry(null); }
  };
  const discard = async () => {
    if (!window.confirm('Discard this draft? Every change in it is removed. Your live template is not affected.')) return;
    const r = await run(() => { session.discard(); return true; });
    if (r) await start();
  };

  const nAccepted = pending ? pending.entries.filter(e => e.status === 'accepted' || e.status === 'edited').length : 0;
  const nPolicyWaiting = pending ? pending.entries.filter(e => e.class === 'policy' && e.status === 'proposed').length : 0;
  const refused = pending?.refused ?? [];

  return (
    <Page>
      <p className="mb-2 text-sm"><Link href="/app/templates" className="font-semibold text-accent-ink hover:underline">← Templates</Link></p>
      <PageHeader
        title={draft.name}
        subtitle={<>Private draft · {appliedCount} change{appliedCount === 1 ? '' : 's'} applied · not published</>}
        actions={<button onClick={discard} disabled={busy} className={btnPlain}>Discard draft</button>}
      />

      <div className="mb-4 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-body">
        <span className="font-semibold text-ink">Not used by inspections.</span>{' '}
        This draft lives in this browser only. Your live template, every inspection and each inspection’s template snapshot are unchanged. Publishing comes in a later update.
      </div>
      {liveChanged && (
        <div className="mb-4 rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm text-ink">
          Your live template changed after this draft was made{liveUpdated ? ` (last synced ${formatWhen(liveUpdated)})` : ''}. New proposals are checked against the draft; nothing is merged automatically.
        </div>
      )}
      <div aria-live="polite">
        {notice && (
          <div role={notice.tone === 'bad' ? 'alert' : 'status'} className={`mb-4 rounded-xl border px-4 py-3 text-sm text-ink ${notice.tone === 'bad' ? 'border-safety/30 bg-safety/5' : 'border-ok/30 bg-ok/5'}`}>
            {notice.text}
            {refusedNow.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-body">
                {refusedNow.slice(0, 5).map(x => <li key={x.index}>{x.rationale ? `${x.rationale} — ` : ''}{x.error}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ── Right on desktop, first on a phone: ask or review ── */}
        <div className="min-w-0 space-y-6 lg:order-2 lg:col-span-7">
          {!pending && (
            <Card title="Ask Ledrix">
              <div className="space-y-4 p-4">
                <div>
                  <label htmlFor="tb-system" className="block text-xs font-semibold uppercase tracking-wide text-muted">System</label>
                  <select id="tb-system" value={systemId} onChange={e => setSystemId(e.target.value)} className={`mt-1.5 ${field}`}>
                    {draft.tree.systems.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="tb-request" className="block text-xs font-semibold uppercase tracking-wide text-muted">What should change?</label>
                  <textarea id="tb-request" value={request} onChange={e => setRequest(e.target.value)} maxLength={2000} rows={6}
                    placeholder="e.g. Ask first whether it's Crawlspace, Basement or Slab. Crawlspace loads walls, floor and vents, each its own card…"
                    className={`mt-1.5 ${field} leading-relaxed`} />
                  <p className="mt-1 text-xs text-muted">Ledrix proposes changes to this system only. Nothing applies until you accept it. {request.length}/2000</p>
                </div>
                <div className="flex justify-end">
                  <button onClick={ask} disabled={busy || !systemId || !request.trim()} className={btnPrimary}>{busy ? 'Ledrix is drafting…' : 'Draft changes'}</button>
                </div>
              </div>
            </Card>
          )}

          {pending && (
            <Card title={`${pending.entries.length} proposed change${pending.entries.length === 1 ? '' : 's'}`}>
              <div className="space-y-3 border-b border-hairline p-4">
                <p className="text-sm text-body">
                  {pending.source === 'onboarding' ? 'From the app’s guided setup' : `${sysLabel(pending.ai?.systemId)} · from Ledrix`}
                  {pending.ai?.request ? <> — “{pending.ai.request}”</> : null}
                </p>
                {pending.ai?.summary && <p className="text-sm text-ink">{pending.ai.summary}</p>}
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold tracking-wide">
                  <span className="rounded-full bg-warn/20 px-2 py-0.5 text-ink">{pending.entries.filter(e => e.class === 'policy').length} POLICY · decide each</span>
                  <span className="rounded-full bg-ok/15 px-2 py-0.5 text-ink">{pending.entries.filter(e => e.class === 'content').length} CONTENT</span>
                  {refused.length > 0 && <span className="rounded-full bg-safety/10 px-2 py-0.5 text-ink">{refused.length} CAN’T APPLY</span>}
                </div>
              </div>

              {groups.map(([section, items]) => {
                const contentLeft = items.filter(i => i.entry.class === 'content' && i.entry.status === 'proposed').length;
                return (
                  <section key={section} className="border-b border-hairline last:border-b-0">
                    <header className="flex items-center justify-between gap-3 px-4 pt-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{section}</h3>
                      {contentLeft > 0 && <button onClick={() => acceptSection(section)} disabled={busy} className={btnSmall}>Accept content ({contentLeft})</button>}
                    </header>
                    <ul className="divide-y divide-hairline">
                      {items.map(s => (
                        <li key={s.entry.id}>
                          <EntryRow s={s} problem={problems.get(s.entry.id) ?? null} open={openEntry === s.entry.id}
                            onToggle={() => setOpenEntry(openEntry === s.entry.id ? null : s.entry.id)} />
                          {openEntry === s.entry.id && (
                            <EntryDetail key={`${s.entry.id}:${s.entry.status}:${s.entry.edited ? 'e' : 'o'}`} s={s} problem={problems.get(s.entry.id) ?? null} busy={busy}
                              onDecide={d => decide(s.entry.id, d)} onEdit={op => edit(s.entry.id, op)} />
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}

              {refused.length > 0 && (
                <section className="border-t border-hairline px-4 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Can’t apply</h3>
                  <ul className="mt-2 space-y-2">
                    {refused.map(x => (
                      <li key={x.index} className="rounded-lg border border-safety/30 bg-safety/5 px-3 py-2 text-sm">
                        <p className="font-medium text-ink">{x.rationale || `Change ${x.index + 1}`}</p>
                        <p className="text-body">{x.error}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <footer className="flex flex-col gap-3 border-t border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">{nAccepted} accepted · {nPolicyWaiting} policy waiting{refused.length ? ` · ${refused.length} can’t apply` : ''}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={dismiss} disabled={busy} className={btnPlain}>Dismiss</button>
                  <button onClick={() => acceptSection()} disabled={busy} className={btnPlain}>Accept all content</button>
                  <button onClick={() => apply()} disabled={busy || !nAccepted} className={btnPrimary}>Apply {nAccepted} to draft</button>
                </div>
              </footer>
            </Card>
          )}
        </div>

        {/* ── Left on desktop: the draft and its history ── */}
        <div className="min-w-0 space-y-6 lg:order-1 lg:col-span-5">
          <Card title="What’s in the draft" count={draft.tree.systems.length}>
            {draft.tree.systems.length === 0 ? <Empty>No systems in this template.</Empty> : (
              <ul className="divide-y divide-hairline">
                {draft.tree.systems.map(sy => {
                  const kids = sy.children ?? [];
                  const open = openSys === sy.id;
                  return (
                    <li key={sy.id}>
                      <button onClick={() => setOpenSys(open ? null : sy.id)} aria-expanded={open}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-ink/[0.03]">
                        <span className="truncate text-sm font-medium text-ink">{sy.label}</span>
                        <span className="shrink-0 text-xs text-muted">{kids.length} item{kids.length === 1 ? '' : 's'} {open ? '▴' : '▾'}</span>
                      </button>
                      {open && <NodeList nodes={kids} depth={0} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="History" count={history.length}>
            {history.length === 0 ? <Empty>Nothing applied yet.</Empty> : (
              <ul className="divide-y divide-hairline">
                {history.map(h => {
                  const undoable = h.source !== 'rollback' && !h.reverted && h.applied > 0;
                  return (
                    <li key={h.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${h.source === 'rollback' || h.reverted ? 'opacity-70' : ''}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{h.source === 'rollback' ? 'Undid: ' : ''}{h.systems.join(', ') || 'Template'} · {h.applied} change{h.applied === 1 ? '' : 's'}{h.reverted ? ' (undone)' : ''}</p>
                        <p className="text-xs text-muted">{h.source === 'ai' ? 'Ledrix · accepted by you' : h.source === 'onboarding' ? 'Guided setup · accepted by you' : h.source === 'rollback' ? 'You' : h.source} · {formatWhen(new Date(h.at).toISOString())}</p>
                      </div>
                      {undoable && <button onClick={() => undo(h.id)} disabled={busy} className={btnSmall}>Undo</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}

function NodeList({ nodes, depth }: { nodes: TemplateNode[]; depth: number }) {
  if (!nodes.length) return null;
  return (
    <ul className="pb-2">
      {nodes.map(n => (
        <li key={n.id}>
          <p className="truncate py-1 pr-4 text-sm text-body" style={{ paddingLeft: 28 + depth * 16 }}>{n.label}</p>
          {depth < 2 && <NodeList nodes={n.children ?? []} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

function EntryRow({ s, problem, open, onToggle }: { s: EntrySummary; problem: string | null; open: boolean; onToggle: () => void }) {
  const e = s.entry; const policy = e.class === 'policy';
  const on = e.status === 'accepted' || e.status === 'edited';
  return (
    <button onClick={onToggle} aria-expanded={open}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-ink/[0.03] ${on && !problem ? 'bg-ok/[0.04]' : ''}`}>
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${policy ? 'bg-warn/20 text-ink' : 'bg-ok/15 text-ink'}`}>{policy ? 'POLICY' : 'CONTENT'}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{s.title}</span>
        {s.detail ? <span className="block text-sm text-body">{s.detail}</span>
          : (s.before !== undefined || s.after !== undefined) ? <span className="block truncate text-sm text-body">{s.before ?? '—'} → {s.after ?? '—'}</span> : null}
        {problem && <span className="block text-xs text-safety">Can’t apply yet: {problem}</span>}
      </span>
      <span className={`shrink-0 text-xs font-semibold ${policy && e.status === 'proposed' ? 'text-ink' : on ? 'text-ink' : 'text-muted'}`}>
        {policy && e.status === 'proposed' ? 'Decide' : STATUS_WORD[e.status] ?? e.status}
      </span>
    </button>
  );
}

function EntryDetail({ s, problem, busy, onDecide, onEdit }: {
  s: EntrySummary; problem: string | null; busy: boolean;
  onDecide: (d: 'accepted' | 'declined' | 'proposed') => void; onEdit: (op: unknown) => void;
}) {
  const e = s.entry; const op = e.edited ?? e.op; const policy = e.class === 'policy';
  const ed = editableOf(op);
  const [text, setText] = useState(ed?.text?.value ?? '');
  const [list, setList] = useState((ed?.list?.value ?? []).join('\n'));
  const [toggle, setToggle] = useState(!!ed?.toggle?.value);
  const listVals = list.split('\n').map(v => v.trim()).filter(Boolean);
  const changed = !!ed && ((ed.text && text !== ed.text.value) || (ed.list && JSON.stringify(listVals) !== JSON.stringify(ed.list.value)) || (ed.toggle && toggle !== ed.toggle.value));
  const accepted = e.status === 'accepted' || e.status === 'edited';
  return (
    <div className="space-y-3 border-t border-hairline bg-ground px-4 py-4 text-sm">
      {policy
        ? <p className="rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-ink">Policy: {e.classReason}. It’s your company’s call, so it needs its own decision.</p>
        : <p className="text-xs font-semibold uppercase tracking-wide text-muted">Content · {e.classReason}</p>}
      {problem && <p className="rounded-lg border border-safety/30 bg-safety/5 px-3 py-2 text-ink">Can’t apply yet: {problem}</p>}
      {!!e.rationale && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Why Ledrix suggests it</p>
          <p className="mt-1 text-body">{e.rationale}</p>
        </div>
      )}
      {(s.before !== undefined || s.after !== undefined || s.detail) && (
        <div className="rounded-lg border border-hairline bg-surface px-3 py-2">
          {s.detail && <p className="text-ink">{s.detail}</p>}
          {s.before !== undefined && <p className="text-body"><span className="text-muted">Before: </span>{s.before}</p>}
          {s.after !== undefined && <p className="text-body"><span className="text-muted">After: </span>{s.after}</p>}
        </div>
      )}
      {(e.warnings ?? []).map((w, i) => <p key={i} className="text-xs text-body">⚠ {w}</p>)}
      {ed && (
        <div className="space-y-3 rounded-lg border border-hairline bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Edit</p>
          {ed.text && (
            <label className="block"><span className="text-xs text-muted">{ed.text.label}</span>
              <input value={text} onChange={ev => setText(ev.target.value)} className={`mt-1 ${field}`} /></label>
          )}
          {ed.list && (
            <label className="block"><span className="text-xs text-muted">{ed.list.label}</span>
              <textarea value={list} onChange={ev => setList(ev.target.value)} rows={4} className={`mt-1 ${field}`} /></label>
          )}
          {ed.toggle && (
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">{ed.toggle.label}</span>
              <input type="checkbox" checked={toggle} onChange={ev => setToggle(ev.target.checked)} className="h-4 w-4 accent-[#217BE8]" />
            </label>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onDecide('declined')} disabled={busy || e.status === 'declined'} className={btnPlain}>{e.status === 'declined' ? 'Declined' : 'Decline'}</button>
        {changed
          ? <button onClick={() => onEdit(withEdit(op, ed?.text ? text : undefined, ed?.list ? listVals : undefined, ed?.toggle ? toggle : undefined))} disabled={busy} className={btnPrimary}>Save edit</button>
          : <button onClick={() => onDecide('accepted')} disabled={busy || accepted} className={btnPrimary}>{accepted ? 'Accepted' : 'Accept'}</button>}
        {e.status !== 'proposed' && <button onClick={() => onDecide('proposed')} disabled={busy} className="text-sm font-semibold text-accent-ink hover:underline">Undo my decision</button>}
      </div>
    </div>
  );
}
