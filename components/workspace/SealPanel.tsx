'use client';

// Seal & send — read-only (10c of ledrix-app "Seal and send on the website", DECISIONS 2026-11-03 (fourth); mockup
// https://claude.ai/artifact/6Yz1LwcKpti2PwgGcGUupa screens 1–2, approved as drawn).
//
// What would stand between this job and a seal, decided on the server from the job's server rows by the phone's own
// code (/api/inspections/<id>/seal-check, lib/seal/check.ts): the phone's release gates (hard locks, soft informs),
// what each phone says is still only on it, unsent work on a phone. Ready → the report preview, rendered by the phone's
// report builder; locked → where this job's data is. 10d (screens 3–4): SEAL & SEND opens the confirmation — the
// attestation is ticked by the person sealing, never pre-ticked — and POST /api/inspections/<id>/seal (lib/seal/seal.ts)
// seals and sends as the signed-in user, under this browser's edit lock; then "Sealed and sent", and the sealed report.
import { useCallback, useEffect, useRef, useState } from 'react';
import { workspace } from '@/lib/workspace/client';
import { Card, ErrorBox, Loading } from '@/components/workspace/ui';
import type { EditLock } from '@/components/workspace/FindingEditor';
import { webDevice } from '@/lib/findings/edit';
import type { SealCheck } from '@/lib/seal/check';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; check: SealCheck };
type Sealed = { version: number; digest: string; shareUrl: string; warnings: string[]; reSealed: boolean };
type Confirm = { open: boolean; attest: boolean; busy: boolean; error: string | null };
const authHeader = async () => ({ Authorization: `Bearer ${(await workspace.auth.getSession()).data.session?.access_token ?? ''}` });

export function SealPanel({ inspectionId, lock, onOpenItem }: { inspectionId: string; lock: EditLock;
  /** Opens Scope at this item (owner 2026-11-04: "click on those and go straight to the section to fix"). */
  onOpenItem?: (nodeId: string) => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [confirm, setConfirm] = useState<Confirm>({ open: false, attest: false, busy: false, error: null });
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => { const d = dialog.current; if (!d) return; if (confirm.open && !d.open) d.showModal(); if (!confirm.open && d.open) d.close(); }, [confirm.open]);
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const token = (await workspace.auth.getSession()).data.session?.access_token ?? '';
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
      const r = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/seal-check?tz=${encodeURIComponent(tz)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await r.json().catch(() => null);
      if (!r.ok || !body?.ok) { setState({ kind: 'error', message: body?.error ?? 'The report check could not run. Try again.' }); return; }
      setState({ kind: 'ready', check: body as SealCheck });
    } catch {
      setState({ kind: 'error', message: 'The report check could not run. Try again.' });
    }
  }, [inspectionId]);
  useEffect(() => { void load(); }, [load]);

  const seal = useCallback(async (check: SealCheck) => {
    setConfirm(c => ({ ...c, busy: true, error: null }));
    try {
      const lease = await lock.ensure();   // the edit lock on this browser (as any change here)
      if (!lease) { setConfirm(c => ({ ...c, busy: false, error: lock.heldBy ? `${lock.heldBy} is editing this job. Use “Edit here instead”, then seal.` : (lock.error ?? 'The edit lock could not be taken. Try again.') })); return; }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
      const r = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/seal`, {
        method: 'POST', headers: { ...(await authHeader()), 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ attest: true, device: webDevice(), epoch: lease.epoch, expectNext: check.nextVersion, tz }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok || !body?.ok) { setConfirm(c => ({ ...c, busy: false, error: body?.error ?? 'The report could not be sealed. Try again.' })); return; }
      setConfirm({ open: false, attest: false, busy: false, error: null });
      setSealed(body as Sealed);
      const rr = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/report?version=${body.version}`, { headers: await authHeader(), cache: 'no-store' });
      const rb = await rr.json().catch(() => null);
      setReport(rr.ok && rb?.html ? rb.html : null);
    } catch {
      setConfirm(c => ({ ...c, busy: false, error: 'The report could not be sealed. Try again.' }));
    }
  }, [inspectionId, lock]);

  if (sealed) return <SealedView sealed={sealed} client={state.kind === 'ready' ? state.check.clientName : null} report={report} />;
  if (state.kind === 'loading') return <Card className="xl:col-span-2"><Loading label="Checking this report…" /></Card>;
  if (state.kind === 'error') return <div className="xl:col-span-2"><ErrorBox message={state.message} onRetry={load} /></div>;
  const c = state.check;
  const locked = c.locks.length > 0;

  return (
    <div className="grid grid-cols-1 gap-5 xl:col-span-2 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section aria-labelledby="seal-title" className="flex flex-col rounded-xl border border-hairline bg-surface">
        <header className="border-b border-hairline px-5 py-4">
          <p className={`font-mono text-[11px] font-bold tracking-[0.14em] ${locked ? 'text-safety' : 'text-emerald-700 dark:text-emerald-400'}`}>
            BEFORE IT SHIPS{locked ? '' : ' · NOTHING BLOCKS'}
          </p>
          <h2 id="seal-title" className="mt-1.5 text-base font-bold text-ink">Seal &amp; send</h2>
          <p className="mt-1 text-sm leading-relaxed text-body">
            {locked ? 'Locked items stop the seal until they are fixed — here or on a phone.' : 'The same checks your phone runs before a seal. These inform — sealing is your attestation.'}
          </p>
        </header>
        <ul className="divide-y divide-hairline px-5">
          {c.locks.map(l => (
            <li key={l.key} className="flex gap-3 py-3.5">
              <LockIcon />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{l.title}</p>
                {l.items?.length ? (
                  <ul className="-mx-2 mt-1">
                    {l.items.map((it, i) => (
                      <li key={`${it.nodeId ?? ''}:${i}`}>
                        {it.nodeId && onOpenItem ? (
                          <button type="button" onClick={() => onOpenItem(it.nodeId!)}
                            className="group flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-left text-sm leading-relaxed text-body hover:bg-ink/5 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                            <span>{it.label}</span>
                            <span aria-hidden className="shrink-0 text-xs font-semibold text-accent-ink opacity-70 group-hover:opacity-100">Fix ›</span>
                          </button>
                        ) : <p className="px-2 py-1 text-sm leading-relaxed text-body">{it.label}</p>}
                      </li>
                    ))}
                  </ul>
                ) : l.detail && <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-body">{l.detail}</p>}
              </div>
            </li>
          ))}
          {c.notes.map(n => (
            <li key={n.key} className="flex gap-3 py-3.5">
              <InfoIcon />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                {n.detail && <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-body">{n.detail}</p>}
              </div>
            </li>
          ))}
          {c.phoneOnly.state === 'clear' && (
            <li className="flex gap-3 py-3.5">
              <CheckIcon />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Everything this report needs is on the server</p>
                <p className="mt-0.5 text-sm text-body">Findings, specs, readings, the checklist, photos — no phone still holds part of this job.</p>
              </div>
            </li>
          )}
        </ul>
        <div className="mt-auto flex flex-col gap-2.5 border-t border-hairline px-5 pb-5 pt-4">
          <div className="flex justify-between gap-3 text-sm text-body">
            <span>{lock.lease ? 'You hold the edit lock' : lock.heldBy ? `${lock.heldBy} is editing this job` : 'Sealing takes the edit lock, like any change here'}</span>
            <span className="shrink-0 font-mono text-xs">{c.isFinalized ? `Re-seal: version ${c.nextVersion}` : `Next: version ${c.nextVersion}`}</span>
          </div>
          {locked ? (
            <button type="button" disabled className="w-full cursor-not-allowed rounded-xl bg-ink/5 px-4 py-3.5 text-sm font-bold tracking-wide text-muted">FIX THE LOCKED ITEMS FIRST</button>
          ) : (
            <button type="button" onClick={() => setConfirm({ open: true, attest: false, busy: false, error: null })}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-bold tracking-wide text-emerald-950 hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">SEAL &amp; SEND</button>
          )}
          <button type="button" onClick={load} className="self-start text-xs font-semibold text-accent-ink hover:underline">Check again</button>
        </div>
      </section>

      {locked ? (
        // THE WARNING LINE (owner 2026-11-04: "yes build the warning line"). The "Where this job's data is" grid listed
        // every part as server or phone; since #105 every part has a server home, so the only thing worth saying is
        // which phone still holds something — and only while one does. Nothing phone-only → no line.
        <div className="flex min-w-0 flex-col gap-3">
          {phoneWarnings(c.phoneOnly).map(w => (
            <div key={w.key} role="status" className="flex gap-3 rounded-xl border border-safety/40 bg-safety/5 px-5 py-4">
              <span aria-hidden className="mt-0.5 text-safety">⚠</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{w.title}</p>
                <p className="mt-0.5 text-sm text-body">Open the job on that phone and tap Sync.</p>
              </div>
              {w.reportedAt && <span className="shrink-0 self-end text-xs text-muted">reported {new Date(w.reportedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
            </div>
          ))}
          <p className="rounded-xl border border-hairline bg-surface px-5 py-4 text-sm text-muted">The report preview shows here once nothing is locked.</p>
        </div>
      ) : (
        <section className="flex min-w-0 flex-col rounded-xl border border-hairline bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3">
            <h2 className="text-sm font-semibold text-ink">Report preview</h2>
            <span className="text-xs text-muted">Rendered by the same report builder as the phone · not sealed</span>
          </header>
          {c.preview ? (
            <iframe title="Report preview" sandbox="" srcDoc={c.preview.html} className="h-[70vh] w-full rounded-b-xl bg-white" />
          ) : (
            <p className="px-5 py-6 text-sm text-body">The preview could not be rendered. The checks above still apply.</p>
          )}
        </section>
      )}

      <dialog ref={dialog} aria-labelledby="seal-confirm-title" onCancel={(e) => { if (confirm.busy) e.preventDefault(); else setConfirm(c => ({ ...c, open: false })); }}
        className="w-[min(560px,calc(100vw-32px))] rounded-2xl bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/45">
        <div className="px-6 pb-2 pt-5">
          <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-body">{c.isFinalized ? `RE-SEAL · VERSION ${c.nextVersion}` : `VERSION ${c.nextVersion}`}</p>
          <h2 id="seal-confirm-title" className="mt-2 text-xl font-bold tracking-tight">Seal and send this report?</h2>
        </div>
        <div className="flex flex-col gap-3.5 px-6 py-2">
          <p className="text-sm leading-relaxed text-body">Sealing records the report exactly as it is now, under your name. Later changes make a new version; this one never changes.</p>
          <ol className="flex flex-col gap-2.5 text-sm leading-relaxed">
            {[`The report’s record is frozen on the server and sealed`, `The PDF is made from that record — the same page the phone makes`,
              `${c.clientName ? `${c.clientName}’s` : 'The homeowner’s'} Home App report goes live at their link`].map((t, i) => (
              <li key={i} className="flex gap-3"><span aria-hidden className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-hairline bg-ground text-xs font-semibold">{i + 1}</span><span>{t}</span></li>
            ))}
          </ol>
          <label className="flex items-start gap-2.5 text-sm leading-relaxed">
            <input type="checkbox" checked={confirm.attest} disabled={confirm.busy} onChange={(e) => setConfirm(x => ({ ...x, attest: e.target.checked }))} className="mt-1 h-4 w-4" />
            <span>I inspected this property and this report is my professional opinion.</span>
          </label>
          {confirm.error && <p role="alert" className="rounded-lg bg-safety/10 px-3 py-2 text-sm text-ink">{confirm.error}</p>}
          {confirm.busy && <p role="status" className="text-sm text-body">Sealing and sending — this can take a minute.</p>}
        </div>
        <div className="flex justify-end gap-2.5 px-6 pb-5 pt-4">
          <button type="button" disabled={confirm.busy} onClick={() => setConfirm(x => ({ ...x, open: false }))} className="rounded-xl border border-hairline px-4 py-2.5 text-sm font-semibold hover:bg-ink/5 disabled:opacity-50">Cancel</button>
          <button type="button" disabled={!confirm.attest || confirm.busy} onClick={() => seal(c)}
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold tracking-wide text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">{confirm.busy ? 'SEALING…' : 'SEAL & SEND'}</button>
        </div>
      </dialog>
    </div>
  );
}

function SealedView({ sealed, client, report }: { sealed: Sealed; client: string | null; report: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-5 xl:col-span-2">
      <div role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-600/35 bg-emerald-600/10 px-4 py-3 text-sm text-ink">
        <CheckIcon />
        <span><strong className="font-semibold">Sealed and sent.</strong> Version {sealed.version} is live on {client ? `${client}’s` : 'the homeowner’s'} Home App.</span>
      </div>
      {sealed.warnings.length > 0 && (
        <ul className="rounded-xl bg-amber-600/10 px-4 py-3 text-sm text-ink">{sealed.warnings.map(w => <li key={w}>{w}</li>)}</ul>
      )}
      <div className="flex flex-wrap gap-2">
        <a href={sealed.shareUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-surface hover:opacity-90">Open Home App report</a>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(sealed.shareUrl); setCopied(true); } catch { /* no clipboard */ } }}
          className="rounded-lg border border-hairline bg-surface px-3.5 py-2 text-sm font-semibold text-ink hover:bg-ink/5">{copied ? 'Link copied' : 'Copy homeowner link'}</button>
      </div>
      <section className="flex min-w-0 flex-col rounded-xl border border-hairline bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Version {sealed.version} — the sealed report</h2>
          <span className="font-mono text-xs text-muted">REV {sealed.version} · {sealed.digest.slice(0, 8).toUpperCase()}…{sealed.digest.slice(-4).toUpperCase()}</span>
        </header>
        {report ? <iframe title="Sealed report" sandbox="" srcDoc={report} className="h-[70vh] w-full rounded-b-xl bg-white" />
          : <p className="px-5 py-6 text-sm text-body">The sealed report is on the server; it will show here once it can be loaded (Reports &amp; delivery).</p>}
        <p className="border-t border-hairline px-5 py-3 text-xs text-muted">A change after sealing makes version {sealed.version + 1} when you seal again. Version {sealed.version} stays as it was sent.</p>
      </section>
    </div>
  );
}

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-safety"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg>
);
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

/** One warning per phone that still holds part of this job; one line when no phone has reported at all. Empty = nothing. */
export function phoneWarnings(p: { state: 'clear' | 'parts' | 'unreported'; phones: { name: string; device: string; parts: string[]; reportedAt: string }[] }):
  { key: string; title: string; reportedAt: string | null }[] {
  if (p.state === 'unreported') return [{ key: 'unreported', title: 'No phone has reported this job yet.', reportedAt: null }];
  return p.phones.filter(ph => ph.parts.length > 0).map(ph => ({
    key: `${ph.name}:${ph.device}`, title: `${ph.name ? `${ph.name}’s phone` : 'A phone'} hasn’t sent everything for this job yet.`, reportedAt: ph.reportedAt,
  }));
}
