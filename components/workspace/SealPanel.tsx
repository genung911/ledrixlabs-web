'use client';

// Seal & send — read-only (10c of ledrix-app "Seal and send on the website", DECISIONS 2026-11-03 (fourth); mockup
// https://claude.ai/artifact/6Yz1LwcKpti2PwgGcGUupa screens 1–2, approved as drawn).
//
// What would stand between this job and a seal, decided on the server from the job's server rows by the phone's own
// code (/api/inspections/<id>/seal-check, lib/seal/check.ts): the phone's release gates (hard locks, soft informs),
// what each phone says is still only on it, unsent work on a teammate's phone. Ready → the report preview, rendered by
// the phone's report builder; locked → where this job's data is. Sealing itself is 10d: the button is not live yet.
import { useCallback, useEffect, useState } from 'react';
import { workspace } from '@/lib/workspace/client';
import { Card, ErrorBox, Loading } from '@/components/workspace/ui';
import type { EditLock } from '@/components/workspace/FindingEditor';
import type { SealCheck } from '@/lib/seal/check';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; check: SealCheck };

export function SealPanel({ inspectionId, lock }: { inspectionId: string; lock: EditLock }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
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
                {l.detail && <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-body">{l.detail}</p>}
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
          <button type="button" disabled aria-describedby="seal-later"
            className="w-full cursor-not-allowed rounded-xl bg-ink/5 px-4 py-3.5 text-sm font-bold tracking-wide text-muted">
            {locked ? 'FIX THE LOCKED ITEMS FIRST' : 'SEAL & SEND'}
          </button>
          <p id="seal-later" className="text-xs text-muted">
            {locked ? 'Sealing from the website comes in the next update.' : 'Ready. Sealing from the website comes in the next update — seal from the phone for now.'}
          </p>
          <button type="button" onClick={load} className="self-start text-xs font-semibold text-accent-ink hover:underline">Check again</button>
        </div>
      </section>

      {locked ? (
        <Card title="Where this job’s data is">
          <ul className="grid grid-cols-1 gap-x-8 px-5 py-2 sm:grid-cols-2">
            {c.dataMap.map(d => (
              <li key={d.label} className="flex justify-between gap-3 border-b border-hairline py-3 text-sm">
                <span className="text-ink">{d.label}</span>
                <span className={`font-semibold ${d.where === 'server' ? 'text-emerald-700 dark:text-emerald-400' : 'text-safety'}`}>{d.where === 'server' ? 'On the server' : 'Phone only'}</span>
              </li>
            ))}
          </ul>
          <p className="px-5 pb-4 pt-2 text-xs leading-relaxed text-muted">
            {c.phoneOnly.state === 'unreported'
              ? 'No phone has said what it holds for this job yet. Phones report after they sync, on Ledrix 685 or later.'
              : 'Only the parts this job uses are listed as phone-only. A report sealed on a phone carries all of them, and opens here in full.'}
          </p>
          {c.phoneOnly.phones.length > 0 && (
            <ul className="border-t border-hairline px-5 py-3 text-xs text-muted">
              {c.phoneOnly.phones.map(p => (
                <li key={`${p.name}:${p.device}`}>{p.name} · {p.parts.length ? `${p.parts.length} phone-only` : 'nothing phone-only'} · reported {new Date(p.reportedAt).toLocaleString()}</li>
              ))}
            </ul>
          )}
        </Card>
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
