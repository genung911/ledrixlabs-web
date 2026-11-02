'use client';

// The finding panel on an inspection, editable (2026-11-02, mockup "Website Finding Editing", owner: "Build it as
// shown"). Confirm, adjust or reject a finding, and change its description, priority, safety, room, floor and notes —
// under the phone's rules (lib/findings/rules.ts) and through the same server checks
// (lib/findings/edit.ts). Someone else's finding, a staged limitation, or a job you are not on is read only and
// says why. Photos are shown above, exactly as the read-only panel showed them.
import { useCallback, useEffect, useRef, useState } from 'react';
import { SEVERITY_COLOR, SEVERITY_SHORT_LABELS, normalizeFindingStatus, parseSeverity } from '@/lib/workspace/model';
import {
  PICKABLE_PRIORITIES, changesOf, confirmPatch, draftOf, editAccess, missingForConfirm, notTaken, priorityUnset, rejectPatch, restorePatch,
  type Draft, type EditableRow, type TeamLike,
} from '@/lib/findings/rules';
import { WEB_DEVICE_NAME, checkInLease, moveLeaseHere, releaseLease, saveFinding, takeLease, type Lease } from '@/lib/findings/edit';
import { formatDate, formatWhen, titleCase } from './ui';

type Row = EditableRow & { id: string; row_version: number | null; ai_description: string | null; rejected_at: string | null; updated_at: string | null; created_at: string | null };

// ── The job's edit lock for this page: one per page, taken at the first save ─────────────────────────────────────
export type EditLock = {
  lease: Lease | null;
  heldBy: string | null;                 // another of your devices is editing this job now
  ensure: () => Promise<Lease | null>;   // take it (null = held elsewhere or refused; heldBy / error say which)
  moveHere: () => Promise<void>;
  error: string | null;
  lost: () => void;                      // a save was refused for the lock: show the banner again
};

export function useEditLock(inspectionId: string, phoneHolder: string | null): EditLock {
  const [lease, setLease] = useState<Lease | null>(null);
  const [heldBy, setHeldBy] = useState<string | null>(phoneHolder);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Lease | null>(null);
  ref.current = lease;

  useEffect(() => { if (!ref.current) setHeldBy(phoneHolder); }, [phoneHolder]);

  const ensure = useCallback(async () => {
    if (ref.current) return ref.current;
    setError(null);
    const a = await takeLease(inspectionId);
    if (a.kind === 'ok') { setLease(a.lease); setHeldBy(null); return a.lease; }
    if (a.kind === 'held') setHeldBy(a.by);
    else if (a.kind === 'not_on_job') setError('You’re not on this job’s team, so you can’t change its findings.');
    else setError(a.message);
    return null;
  }, [inspectionId]);

  const moveHere = useCallback(async () => {
    setError(null);
    const a = await moveLeaseHere(inspectionId);
    if (a.kind === 'ok') { setLease(a.lease); setHeldBy(null); }
    else if (a.kind === 'held') setHeldBy(a.by);
    else if (a.kind === 'not_on_job') setError('You’re not on this job’s team, so you can’t change its findings.');
    else setError(a.message);
  }, [inspectionId]);

  // Check in while the page holds it; let go when the page closes.
  useEffect(() => {
    if (!lease) return;
    const t = window.setInterval(async () => {
      if (!(await checkInLease(inspectionId, lease))) { setLease(null); setHeldBy('your phone'); }
    }, 60_000);
    const leave = () => { void releaseLease(inspectionId, lease); };
    window.addEventListener('pagehide', leave);
    return () => { window.clearInterval(t); window.removeEventListener('pagehide', leave); leave(); };
  }, [inspectionId, lease]);

  const lost = useCallback(() => { setLease(null); setHeldBy(h => h ?? 'your phone'); }, []);
  return { lease, heldBy, ensure, moveHere, error, lost };
}

/** Who on this job holds YOUR edit lock on another device right now, from the team list (null = nobody). */
export function phoneHolderOf(team: { me: string; people: { user_id: string; live: boolean; device_name: string | null }[] } | null): string | null {
  const me = team?.people.find(p => p.user_id === team.me);
  return me?.live && me.device_name !== WEB_DEVICE_NAME ? (me.device_name || 'your phone') : null;
}

// ── The panel ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function FindingEditor<T extends Row>({ finding, team, names, lock, onSaved, photos }: {
  finding: T; team: TeamLike; names: Record<string, string>; lock: EditLock; onSaved: (row: T) => void; photos: React.ReactNode;
}) {
  const access = editAccess(finding, team);
  const status = normalizeFindingStatus(finding.status);
  const [draft, setDraft] = useState<Draft>(() => draftOf(finding));
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string; mine?: string } | null>(null);

  // A different finding, or a newer copy of this one: start from what the server holds.
  useEffect(() => { setDraft(draftOf(finding)); }, [finding.id, finding.row_version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setNote(null); }, [finding.id]);

  const author = finding.inspector_id ? (names[finding.inspector_id]?.split(/\s+/)[0] ?? 'its inspector') : 'its inspector';
  const editable = access === 'edit' && !lock.heldBy;
  const dirty = Object.keys(changesOf(finding, draft)).length > 0;
  const missing = missingForConfirm(finding, draft);
  const suggested = finding.source === 'document_photo' && status !== 'confirmed' && !!finding.ai_severity && !priorityUnset(finding);

  const run = async (label: string, patch: Record<string, unknown>, done: string) => {
    setBusy(label); setNote(null);
    try {
      const lease = await lock.ensure();
      if (!lease) return;
      const mine = draft.description;
      const r = await saveFinding(finding, patch, lease, notTaken);
      if (r.kind === 'saved') { onSaved(r.row); setNote({ tone: 'ok', text: done }); }
      else if (r.kind === 'changed') {
        onSaved(r.row);
        const who = r.row.inspector_id && r.row.inspector_id !== team?.me ? (names[r.row.inspector_id]?.split(/\s+/)[0] ?? 'Someone') : 'Someone';
        setNote({ tone: 'warn', text: `${who === 'Someone' ? 'This finding' : `${who}’s finding`} changed somewhere else first. Your edit wasn’t saved. The newer version is showing now.`, mine: mine !== (r.row.description ?? '') ? mine : undefined });
      } else if (r.kind === 'locked') lock.lost();
      else setNote({ tone: 'bad', text: r.message });
    } finally { setBusy(null); }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <div className="space-y-4 p-4">
      {photos}

      {access === 'not_on_job' && <Banner tone="info">You’re not on this job’s team. Its inspectors change its findings, on the phone or here.</Banner>}
      {access === 'not_yours' && <Banner tone="info"><b>This is {author}’s finding.</b> Only {author} or the job’s lead can change it.</Banner>}
      {access === 'limitation' && <Banner tone="info"><b>This is a limitation waiting to be confirmed.</b> Confirm it on the phone, where its checklist item is.</Banner>}
      {access === 'edit' && lock.heldBy && (
        <Banner tone="info" dot="live">
          <b>{lock.heldBy} is editing this job.</b> The website is view only while it is. Edit here instead and the phone becomes view only until it takes the job back.
          <div className="mt-2"><button type="button" onClick={() => { setBusy('move'); void lock.moveHere().finally(() => setBusy(null)); }} disabled={!!busy}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50">{busy === 'move' ? 'Moving…' : 'Edit here instead'}</button></div>
        </Banner>
      )}
      {lock.error && access === 'edit' && <Banner tone="bad">{lock.error}</Banner>}
      {note && <Banner tone={note.tone === 'ok' ? 'ok' : note.tone === 'warn' ? 'warn' : 'bad'}>{note.text}
        {note.mine && <p className="mt-2 border-l-2 border-hairline pl-2 text-xs text-body"><b>Yours:</b> {note.mine}</p>}</Banner>}
      {status === 'confirmed' && access === 'edit' && !note && <Banner tone="ok">Confirmed. You can still change its wording, priority, safety and location. It stays confirmed.</Banner>}
      {status === 'rejected' && <Banner tone="info">Rejected{finding.rejected_at ? ` ${formatWhen(finding.rejected_at)}` : ''}. Restore sends it back to the review queue as a proposal.</Banner>}

      <div className="space-y-3 text-sm">
        <Labeled label="Description" htmlFor={`d-${finding.id}`}>
          {editable && status !== 'rejected'
            ? <textarea id={`d-${finding.id}`} value={draft.description} onChange={e => set('description', e.target.value)} rows={4}
                className="w-full rounded-lg border border-hairline bg-ground px-3 py-2 text-sm text-ink focus:border-accent focus:bg-surface focus:outline-none" />
            : <p className="whitespace-pre-wrap text-ink">{finding.description || '—'}</p>}
        </Labeled>

        <Labeled label="Priority">
          {editable && status !== 'rejected' ? (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Priority">
              {PICKABLE_PRIORITIES.map(p => (
                <button key={p} type="button" role="radio" aria-checked={draft.severity === p} onClick={() => set('severity', p)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${draft.severity === p ? 'border-ink bg-ground text-ink' : 'border-hairline text-body hover:bg-ground'}`}>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_COLOR[p] }} />{SEVERITY_SHORT_LABELS[p]}
                </button>
              ))}
            </div>
          ) : <p className="text-ink">{priorityUnset(finding) ? 'Not set' : (SEVERITY_SHORT_LABELS[parseSeverity(finding.severity) ?? 'deficiency'] ?? '—')}</p>}
          {editable && suggested && status === 'proposed' && <p className="mt-1 text-xs text-muted">Ledrix suggested {titleCase(SEVERITY_SHORT_LABELS[parseSeverity(finding.ai_severity) ?? 'deficiency'])}. Confirming accepts it unless you pick another.</p>}
        </Labeled>

        {editable && status !== 'rejected' ? (
          <label className="flex items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2">
            <span><b>Safety</b> <span className="text-body">· flags it in the report’s safety list</span></span>
            <input type="checkbox" role="switch" checked={draft.is_safety} onChange={e => set('is_safety', e.target.checked)} className="h-4 w-4 accent-[#FF3B3B]" />
          </label>
        ) : finding.is_safety ? <p className="text-xs font-semibold text-safety">SAFETY</p> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="Room" htmlFor={`r-${finding.id}`}>
            {editable && status !== 'rejected'
              ? <input id={`r-${finding.id}`} value={draft.room} onChange={e => set('room', e.target.value)} className="w-full rounded-lg border border-hairline bg-ground px-3 py-1.5 text-sm text-ink focus:border-accent focus:bg-surface focus:outline-none" />
              : <p className="text-ink">{finding.room || finding.location || '—'}</p>}
          </Labeled>
          <Labeled label="Floor" htmlFor={`l-${finding.id}`}>
            {editable && status !== 'rejected'
              ? <input id={`l-${finding.id}`} value={draft.level} onChange={e => set('level', e.target.value)} className="w-full rounded-lg border border-hairline bg-ground px-3 py-1.5 text-sm text-ink focus:border-accent focus:bg-surface focus:outline-none" />
              : <p className="text-ink">{finding.level || '—'}</p>}
          </Labeled>
        </div>

        <Labeled label="Inspector notes" htmlFor={`n-${finding.id}`}>
          {editable && status !== 'rejected'
            ? <textarea id={`n-${finding.id}`} value={draft.inspector_notes} onChange={e => set('inspector_notes', e.target.value)} rows={2} placeholder="Only on the report if you add them"
                className="w-full rounded-lg border border-hairline bg-ground px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:bg-surface focus:outline-none" />
            : <p className="whitespace-pre-wrap text-ink">{finding.inspector_notes || '—'}</p>}
        </Labeled>

        <p className="text-xs text-muted">System: {titleCase(finding.unit) || 'none'} · Captured {formatDate(finding.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        {!!finding.ai_description && finding.ai_description !== finding.description &&
          <p className="border-l-2 border-hairline pl-3 text-xs text-body"><b>Ledrix’s original:</b> {finding.ai_description}{finding.ai_severity ? ` ${titleCase(SEVERITY_SHORT_LABELS[parseSeverity(finding.ai_severity) ?? 'deficiency'])}.` : ''}</p>}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          {status === 'proposed' || status === 'processing' ? (
            <button type="button" disabled={!!busy || missing.length > 0} onClick={() => run('confirm', confirmPatch(finding, draft), 'Confirmed.')}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50">{busy === 'confirm' ? 'Confirming…' : 'Confirm'}</button>
          ) : null}
          {status !== 'rejected' && (
            <button type="button" disabled={!!busy || !dirty} onClick={() => run('save', changesOf(finding, draft), 'Saved.')}
              className="rounded-full border border-hairline px-4 py-1.5 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
          )}
          <span className="flex-1" />
          {status === 'rejected'
            ? <button type="button" disabled={!!busy} onClick={() => run('restore', restorePatch(new Date().toISOString()), 'Restored to the review queue.')}
                className="rounded-full border border-hairline px-4 py-1.5 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50">{busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
            : <button type="button" disabled={!!busy} onClick={() => run('reject', rejectPatch(finding, draft, new Date().toISOString()), 'Rejected.')}
                className="rounded-full border border-hairline px-4 py-1.5 text-sm font-semibold text-safety hover:bg-safety/5 disabled:opacity-50">{busy === 'reject' ? 'Rejecting…' : 'Reject'}</button>}
          {(status === 'proposed' || status === 'processing') && missing.length > 0 && <p className="basis-full text-xs text-muted">Still needed to confirm: {missing.join(', ')}.</p>}
        </div>
      )}
    </div>
  );
}

function Labeled({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return <div className="space-y-1">{htmlFor ? <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label> : <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>}{children}</div>;
}

function Banner({ tone, dot, children }: { tone: 'info' | 'ok' | 'warn' | 'bad'; dot?: 'live'; children: React.ReactNode }) {
  const cls = tone === 'ok' ? 'bg-emerald-600/10' : tone === 'warn' ? 'bg-amber-600/10' : tone === 'bad' ? 'bg-safety/10' : 'bg-accent/10';
  return (
    <div role="status" className={`flex gap-2 rounded-xl px-3 py-2.5 text-sm text-ink ${cls}`}>
      {dot === 'live' && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
