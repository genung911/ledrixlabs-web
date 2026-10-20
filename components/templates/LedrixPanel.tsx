'use client';

// Ask Ledrix — the editor's context-aware assistant (center column, beside Items).
//
// Ledrix always knows what is selected (template · system · item), the draft as it stands, and what the draft has
// already changed. Two outputs, never mixed:
//   ANSWERS   grey cards, every paragraph labelled General / From your company's templates / Depends on your
//             jurisdiction. An answer never changes the draft.
//   PROPOSALS one card per change: what changes (before → after), why, content or policy; Accept, Edit, Reject.
//             "Apply accepted to draft" writes the private draft only — the phone preview updates, nothing is
//             published, no inspection changes. Every applied set can be undone from Draft changes.
// Review uses the Template Builder's session (lib/templateBuilder/session) over the editor's working copy, so the
// rules are the app's: policy changes one at a time, nothing that can't apply is ever accepted.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateDraft } from '@/lib/templateBuilder/core/templateDraft';
import { setPending, draftHistory } from '@/lib/templateBuilder/core/templateDraft';
import { proposalFromResponse } from '@/lib/templateBuilder/core/templateAuthoring';
import { summarizeOp } from '@/lib/templateBuilder/core/templateOpSummary';
import type { ChangeEntry, RefusedProposal } from '@/lib/templateBuilder/core/templateChangeSets';
import { createBuilderSession } from '@/lib/templateBuilder/session';
import type { DraftStore } from '@/lib/templateBuilder/draftStore';
import { editableOf, withEdit } from '@/lib/templateBuilder/edit';
import { TEMPLATE_AUTHORING_MODEL } from '@/lib/templateBuilder/access';
import { workspace } from '@/lib/workspace/client';
import { ACTIONS, SOURCE_LABEL, type AnswerPart, type AssistantAction, type AssistantScope, type Turn } from '@/lib/templates/assistant';
import { locate } from '@/lib/templates/editorModel';
import { Pill, btn, field } from './ui';

type Msg = { id: string; role: 'owner' | 'ledrix'; context: string; text?: string; answer?: AnswerPart[]; notes?: string[]; csId?: string; refused?: RefusedProposal[]; error?: string };

export function LedrixPanel(props: {
  core: TemplateDraft;
  change: (d: TemplateDraft) => void;
  selection: { systemId: string | null; nodeId: string | null };
  onSelect: (s: { systemId: string | null; nodeId: string | null }) => void;
  target: { templateId: string } | { draftId: string };
  author: { userId: string | null; role?: string };
  readOnly?: string | null;          // why the draft cannot change right now (conflict), or null
}) {
  const { core, change, selection, target, author, readOnly } = props;
  const [scope, setScope] = useState<AssistantScope>(selection.nodeId ? 'item' : 'system');
  const [question, setQuestion] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  // The scope follows the selection: picking an item asks about the item, picking a system about the system.
  // The owner can still widen it by hand; the next selection resets it.
  useEffect(() => { setScope(selection.nodeId ? 'item' : 'system'); }, [selection.nodeId, selection.systemId]);
  const coreRef = useRef(core); coreRef.current = core;
  const bottom = useRef<HTMLDivElement>(null);

  const session = useMemo(() => {
    const store = {
      loadDraft: () => coreRef.current, openDraft: () => coreRef.current, discardDraft: () => {},
      saveDraft: (d: TemplateDraft) => { coreRef.current = d; change(d); },
    } as unknown as DraftStore;
    return createBuilderSession({ companyId: core.companyId, templateId: core.templateId, store, call: async () => ({ ok: false, error: 'unused' }) });
  }, [core.companyId, core.templateId, change]);

  const sys = selection.systemId ? core.tree.systems.find(s => s.id === selection.systemId) ?? null : null;
  const item = selection.nodeId ? locate(core.tree, selection.nodeId)?.node ?? null : null;
  const effScope: AssistantScope = scope === 'item' && !item ? (sys ? 'system' : 'template') : scope === 'system' && !sys ? 'template' : scope;
  const ctxLabel = effScope === 'template' ? core.name : effScope === 'system' ? `${core.name} · ${sys!.label}` : `${core.name} · ${sys?.label ?? ''} › ${item!.label}`;
  const history = draftHistory(core);
  const applied = history.filter(h => h.source !== 'rollback' && !h.reverted).reduce((n, h) => n + h.applied, 0);

  const draftChanges = useMemo(() => core.log.flatMap(cs => cs.entries.filter(e => e.status === 'applied').map(e => {
    try { const s = summarizeOp(e.edited ?? e.op, core.tree); return `${s.title}${s.detail ? ` — ${s.detail}` : ''}`; } catch { return e.op.op; }
  })).slice(-30), [core]);

  async function ask(action: AssistantAction, q?: string) {
    if (busy) return;
    setProblem(null);
    const pending = coreRef.current.pending;
    const wantsChanges = action !== 'ask' && ACTIONS[effScope].find(a => a.id === action)?.changes;
    if (wantsChanges && pending && pending.entries.some(e => e.status !== 'proposed')) {
      setProblem('Apply or dismiss the changes you are reviewing first — new proposals would replace them.'); return;
    }
    const label = action === 'ask' ? (q ?? '').trim() : ACTIONS[effScope].find(a => a.id === action)?.label ?? action;
    const ownerMsg: Msg = { id: `o${Date.now()}`, role: 'owner', context: ctxLabel, text: label };
    setMsgs(m => [...m, ownerMsg]); setBusy(true); setQuestion('');
    const turns: Turn[] = msgs.slice(-6).map(m => ({ role: m.role, context: m.context, text: m.text ?? (m.answer ?? []).map(a => a.text).join(' ') }));
    try {
      const { data } = await workspace.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Your session ended. Sign in again to ask Ledrix.');
      const resp = await fetch('/api/template-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...target, scope: effScope, action, question: action === 'ask' ? q : undefined, systemId: sys?.id ?? null,
          nodeId: effScope === 'item' ? item?.id ?? null : null, tree: coreRef.current.tree, turns, draftChanges }),
      });
      const json = await resp.json().catch(() => null) as null | { error?: string; answer?: AnswerPart[]; notes?: string[]; parsed?: { summary?: string; changes?: unknown[] }; proposesFor?: string | null; model?: string; promptRef?: string };
      if (!resp.ok || !json) throw new Error(json?.error ?? 'Ledrix did not answer. Try again.');
      const reply: Msg = { id: `l${Date.now()}`, role: 'ledrix', context: ctxLabel, answer: json.answer ?? [], notes: json.notes ?? [] };
      const changes = json.parsed?.changes ?? [];
      if (json.proposesFor && changes.length) {
        const now = Date.now();
        const latest = coreRef.current;
        const res = proposalFromResponse({
          tree: latest.tree, systemId: json.proposesFor, request: label, response: json.parsed, id: `ai_${now.toString(36)}`,
          author, now, model: json.model || TEMPLATE_AUTHORING_MODEL, promptRef: json.promptRef,
        });
        if (res.ok) { reply.csId = res.cs.id; reply.refused = res.refused; change(setPending(latest, res.cs, now)); }
        else { reply.refused = res.refused; reply.notes = [...(reply.notes ?? []), res.error]; }
      }
      setMsgs(m => [...m, reply]);
    } catch (e) {
      setMsgs(m => [...m, { id: `e${Date.now()}`, role: 'ledrix', context: ctxLabel, error: e instanceof Error ? e.message : 'Ledrix could not be reached.' }]);
    } finally {
      setBusy(false);
      setTimeout(() => bottom.current?.scrollIntoView({ block: 'nearest' }), 50);
    }
  }

  const act = (r: { ok: boolean; error?: string }) => { if (!r.ok) setProblem(r.error ?? 'That could not be done.'); else setProblem(null); };
  const pending = core.pending;
  const live = (csId?: string) => !!csId && pending?.id === csId;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* context */}
      <div className="border-b border-hairline px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-body"><span className="font-semibold text-ink">Ledrix is looking at</span> {ctxLabel}</p>
          <button className={btn.ghost + ' shrink-0 text-xs'} onClick={() => setShowChanges(s => !s)} aria-expanded={showChanges}>
            {applied} draft change{applied === 1 ? '' : 's'}
          </button>
        </div>
        <div role="radiogroup" aria-label="Ask about" className="mt-2 inline-flex rounded-lg border border-hairline bg-ground p-0.5">
          {(['item', 'system', 'template'] as const).map(s => {
            const dis = (s === 'item' && !item) || (s === 'system' && !sys);
            return (
              <button key={s} role="radio" aria-checked={effScope === s} disabled={dis} onClick={() => setScope(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${effScope === s ? 'bg-surface text-ink shadow-sm' : 'text-body hover:text-ink'}`}>
                {s === 'item' ? 'This item' : s === 'system' ? 'This system' : 'Whole template'}
              </button>
            );
          })}
        </div>
      </div>

      {showChanges && (
        <div className="max-h-64 overflow-y-auto border-b border-hairline bg-ground px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Draft changes</p>
          {!history.length && <p className="mt-2 text-xs text-muted">Nothing changed yet.</p>}
          <ul className="mt-2 space-y-1.5">
            {history.map(h => (
              <li key={h.id} className="flex items-center justify-between gap-2 text-xs">
                <span className={h.reverted ? 'text-muted line-through' : 'text-body'}>
                  {h.source === 'ai' ? 'Accepted from Ledrix' : h.source === 'rollback' ? 'Undo' : 'Your edit'} · {h.applied} change{h.applied === 1 ? '' : 's'}{h.systems.length ? ` · ${h.systems.join(', ')}` : ''}
                </span>
                {h.source !== 'rollback' && !h.reverted && !readOnly && (
                  <button className={btn.ghost + ' text-xs'} onClick={() => act(session.undo(h.id, author))}>Undo</button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">These change the private draft only. Publishing makes them live for new inspections.</p>
        </div>
      )}

      {/* conversation */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!msgs.length && (
          <div className="rounded-xl border border-dashed border-hairline px-4 py-4 text-sm text-body">
            <p className="font-semibold text-ink">Ask Ledrix about {effScope === 'template' ? 'this template' : effScope === 'system' ? sys!.label : item!.label}.</p>
            <p className="mt-1 text-xs">Answers explain; they never change your draft. When Ledrix suggests changes, you review each one before it touches the draft.
              Guidance is general inspection practice — Ledrix doesn’t look up codes or standards, so check anything jurisdiction-dependent locally.</p>
          </div>
        )}
        {msgs.map(m => m.role === 'owner' ? (
          <div key={m.id} className="ml-8 rounded-xl bg-accent/10 px-3 py-2 text-sm text-ink">
            <p className="text-[11px] font-semibold text-accent-ink">{m.context}</p>{m.text}
          </div>
        ) : (
          <div key={m.id} className="space-y-2">
            {m.error && <div className="rounded-xl border border-safety/30 bg-safety/5 px-3 py-2 text-sm text-ink">{m.error}</div>}
            {!!m.answer?.length && (
              <div className="rounded-xl border border-hairline bg-ground px-3 py-3">
                <p className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <span>Ledrix · Answer</span><span className="normal-case tracking-normal">Answers never change the draft</span>
                </p>
                <div className="space-y-2.5">
                  {m.answer.map((a, i) => (
                    <div key={i}>
                      <Pill tone={a.source === 'jurisdiction' ? 'warn' : a.source === 'company' ? 'accent' : 'policy'}>{SOURCE_LABEL[a.source]}</Pill>
                      <p className="mt-1 text-sm leading-relaxed text-ink">{a.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {m.notes?.map((n, i) => <p key={i} className="text-xs text-muted">{n}</p>)}
            {m.csId && <Proposals core={core} live={live(m.csId)} session={session} author={author} act={act} readOnly={readOnly} onSelect={props.onSelect} />}
            {!!m.refused?.length && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">{m.refused.length} suggestion{m.refused.length === 1 ? '' : 's'} left out</summary>
                <ul className="mt-1 list-disc space-y-1 pl-5">{m.refused.map((r, i) => <li key={i}>{r.rationale ? `${r.rationale} — ` : ''}{r.error}</li>)}</ul>
              </details>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-muted">Ledrix is thinking…</p>}
        <div ref={bottom} />
      </div>

      {problem && <p role="alert" className="border-t border-hairline px-4 py-2 text-xs text-ink"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />{problem}</p>}

      {/* ask */}
      <div className="border-t border-hairline px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {ACTIONS[effScope].map(a => (
            <button key={a.id} disabled={busy} onClick={() => ask(a.id)}
              className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-medium text-ink hover:border-accent hover:text-accent-ink disabled:opacity-40">{a.label}</button>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (question.trim()) ask('ask', question); }}>
          <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2} maxLength={2000}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (question.trim()) ask('ask', question); } }}
            placeholder="Ask anything — e.g. “Do I need kick-out flashing?”" aria-label="Ask Ledrix" className={`${field} resize-none`} />
          <button type="submit" disabled={busy || !question.trim()} className={btn.accent + ' self-end'}>Ask</button>
        </form>
        <p className="mt-1.5 text-[11px] text-muted">Uses your daily Ledrix requests.</p>
      </div>
    </div>
  );
}

function Proposals({ core, live, session, author, act, readOnly, onSelect }: {
  core: TemplateDraft; live: boolean; session: ReturnType<typeof createBuilderSession>; author: { userId: string | null; role?: string };
  act: (r: { ok: boolean; error?: string }) => void; readOnly?: string | null; onSelect: (s: { systemId: string | null; nodeId: string | null }) => void;
}) {
  const cs = core.pending;
  if (!live || !cs) {
    return <p className="text-xs text-muted">These proposals were applied, dismissed or replaced — see Draft changes.</p>;
  }
  const decided = cs.entries.filter(e => e.status === 'accepted' || e.status === 'edited').length;
  const content = cs.entries.filter(e => e.status === 'proposed' && e.class === 'content').length;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Proposed changes to the draft · {cs.entries.length}</p>
      {cs.ai?.summary && <p className="text-xs text-body">{cs.ai.summary}</p>}
      {cs.entries.map(e => <ProposalCard key={e.id} e={e} core={core} session={session} act={act} disabled={!!readOnly} onSelect={onSelect} />)}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button className={btn.accent} disabled={!decided || !!readOnly} onClick={() => act(session.apply({ recheck: true }))}>
          Apply {decided || ''} accepted to draft
        </button>
        {content > 0 && <button className={btn.secondary} disabled={!!readOnly} onClick={() => act(session.acceptContent())}>Accept all content</button>}
        <button className={btn.ghost} onClick={() => act(session.dismiss())}>Dismiss</button>
      </div>
      <p className="text-[11px] text-muted">Applying changes your private draft and the preview. It doesn’t publish and never changes an inspection.</p>
      {void author}
    </div>
  );
}

function ProposalCard({ e, core, session, act, disabled, onSelect }: {
  e: ChangeEntry; core: TemplateDraft; session: ReturnType<typeof createBuilderSession>;
  act: (r: { ok: boolean; error?: string }) => void; disabled: boolean; onSelect: (s: { systemId: string | null; nodeId: string | null }) => void;
}) {
  const op = e.edited ?? e.op;
  const s = (() => { try { return summarizeOp(op, core.tree); } catch { return { title: op.op, section: [] as string[] } as ReturnType<typeof summarizeOp>; } })();
  const editable = editableOf(op);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(editable?.text?.value ?? '');
  const [list, setList] = useState((editable?.list?.value ?? []).join('\n'));
  const [toggle, setToggle] = useState(editable?.toggle?.value ?? false);
  const target = (op as { nodeId?: string; parentId?: string | null }).nodeId ?? (op as { parentId?: string | null }).parentId ?? null;
  const loc = target ? locate(core.tree, target) : null;
  const state = e.status === 'accepted' || e.status === 'edited' ? 'accepted' : e.status === 'declined' ? 'declined' : 'open';

  return (
    <div className={`rounded-xl border px-3 py-3 ${state === 'accepted' ? 'border-ok/50 bg-ok/5' : state === 'declined' ? 'border-hairline opacity-60' : 'border-hairline bg-surface'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={e.class === 'policy' ? 'policy' : 'neutral'}>{e.class === 'policy' ? 'Policy' : 'Content'}</Pill>
        {state === 'accepted' && <Pill tone="ok">{e.status === 'edited' ? 'Accepted (edited)' : 'Accepted'}</Pill>}
        {state === 'declined' && <Pill>Rejected</Pill>}
        {loc && <button className="truncate text-[11px] text-accent-ink hover:underline" onClick={() => onSelect({ systemId: loc.system.id, nodeId: loc.depth ? loc.node.id : null })}>
          {s.section.join(' › ') || loc.node.label}</button>}
      </div>
      <p className="mt-1.5 text-sm font-semibold text-ink">{s.title}</p>
      {s.detail && <p className="text-xs text-body">{s.detail}</p>}
      {(s.before !== undefined || s.after !== undefined) && (
        <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          <div className="rounded-lg bg-ground px-2 py-1.5"><span className="font-semibold text-muted">Before</span><p className="text-body">{s.before || '—'}</p></div>
          <div className="rounded-lg bg-accent/5 px-2 py-1.5"><span className="font-semibold text-accent-ink">After</span><p className="text-ink">{s.after || '—'}</p></div>
        </div>
      )}
      {e.rationale && <p className="mt-2 text-xs text-body"><span className="font-semibold text-ink">Why: </span>{e.rationale}</p>}
      {e.class === 'policy' && <p className="mt-1 text-[11px] text-muted">Policy: {e.classReason}. Accept on its own.</p>}
      {e.warnings?.map((w, i) => <p key={i} className="mt-1 text-[11px] text-muted">Note: {w}</p>)}

      {editing && editable && (
        <div className="mt-2 space-y-2">
          {editable.text && <input className={field} value={text} onChange={x => setText(x.target.value)} aria-label={editable.text.label} />}
          {editable.list && <textarea className={field} rows={4} value={list} onChange={x => setList(x.target.value)} aria-label={editable.list.label} />}
          {editable.toggle && <label className="flex items-center gap-2 text-xs text-ink"><input type="checkbox" checked={toggle} onChange={x => setToggle(x.target.checked)} />{editable.toggle.label}</label>}
          <div className="flex gap-2">
            <button className={btn.primary} onClick={() => {
              const next = withEdit(op, editable.text ? text : undefined, editable.list ? list.split('\n').map(v => v.trim()).filter(Boolean) : undefined, editable.toggle ? toggle : undefined);
              const r = session.edit(e.id, next);
              act(r); if (r.ok) setEditing(false);   // an edited entry counts as accepted (templateChangeSets.editEntry)
            }}>Save and accept</button>
            <button className={btn.secondary} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          {state !== 'accepted' && <button className={btn.secondary + ' px-3 py-1 text-xs'} disabled={disabled} onClick={() => act(session.decide(e.id, 'accepted'))}>Accept</button>}
          {editable && state !== 'declined' && <button className={btn.secondary + ' px-3 py-1 text-xs'} disabled={disabled} onClick={() => setEditing(true)}>Edit</button>}
          {state !== 'declined' && <button className={btn.ghost + ' text-xs'} disabled={disabled} onClick={() => act(session.decide(e.id, 'declined'))}>Reject</button>}
          {state !== 'open' && <button className={btn.ghost + ' text-xs'} disabled={disabled} onClick={() => act(session.decide(e.id, 'proposed'))}>Reopen</button>}
        </div>
      )}
    </div>
  );
}
