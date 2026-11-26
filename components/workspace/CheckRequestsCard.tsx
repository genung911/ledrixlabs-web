'use client';

// ─── Check requests — the homeowner fixed these and asked you to check (approval pack item 3, owner 2026-11-25) ──────
// Shows only when there is at least one. Each row: what was fixed, when, the homeowner's note, and three actions —
//   Contact homeowner   their email (they are signed in, so it is known), with Copy.
//   Book a re-check     New inspection with the address and client filled in, type Re-inspection.
//   Mark verified       mark_finding_verified (#154) as you — the record's inspector or their company; it turns the
//                       homeowner's pill into "✓ Verified" with your name and the date. Undo takes it back.
// Data: /api/inspections/<id>/check-requests (lib/checkRequests.ts — your own access decides what you see).
import { useCallback, useEffect, useState } from 'react';
import { workspace } from '@/lib/workspace/client';
import { markFindingVerified } from '@/lib/findings/repairCheck';
import { formatDate, PriorityPill } from '@/components/workspace/ui';
import type { CheckRequest } from '@/lib/checkRequests';

const authHeader = async () => ({ Authorization: `Bearer ${(await workspace.auth.getSession()).data.session?.access_token ?? ''}` });
const day = (iso: string | null) => (iso ? formatDate(iso, { month: 'short', day: 'numeric' }) : '');

/** The New inspection link for a re-check: what the job already knows, and the type. */
export function recheckHref(job: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null; client_name?: string | null; profile_property_type?: string | null } | null,
  email: string | null, fromId: string): string {
  const q = new URLSearchParams();
  const put = (k: string, v: string | null | undefined) => { const t = (v ?? '').trim(); if (t) q.set(k, t.slice(0, 200)); };
  put('address', job?.address); put('city', job?.city); put('state', job?.state); put('zip', job?.zip);
  put('client', job?.client_name); put('email', email); put('homeType', job?.profile_property_type);
  q.set('type', 'reinspection'); q.set('from', fromId);
  return `/app/inspections/new?${q.toString()}`;
}

export function CheckRequestsCard({ inspectionId }: { inspectionId: string }) {
  const [rows, setRows] = useState<CheckRequest[]>([]);
  const [job, setJob] = useState<Parameters<typeof recheckHref>[0]>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/check-requests`, { headers: await authHeader(), cache: 'no-store' });
      const body = await r.json().catch(() => null);
      setRows(r.ok && Array.isArray(body?.requests) ? body.requests : []);
    } catch { setRows([]); }
  }, [inspectionId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    workspace.from('inspections').select('address,city,state,zip,client_name,profile_property_type').eq('id', inspectionId).maybeSingle()
      .then(({ data }: { data: any }) => setJob(data ?? null), () => setJob(null));
  }, [inspectionId]);

  const verify = async (ref: string, on: boolean) => {
    setBusy(ref); setErr(null);
    const why = await markFindingVerified(inspectionId, ref, on);
    setBusy(null);
    if (why) { setErr(why); return; }
    await load();
  };

  if (rows.length === 0) return null;
  const waiting = rows.filter(r => r.status === 'fixed' && !r.verifiedAt);
  return (
    <section aria-label="Check requests" className="mb-5 rounded-xl border border-hairline bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Check requests{waiting.length ? ` · ${waiting.length}` : ''}</h2>
        <span className="text-xs text-muted">The homeowner fixed these and asked you to check</span>
      </header>
      <ul className="divide-y divide-hairline">
        {rows.map(r => (
          <li key={r.ref} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-start gap-3">
              <PriorityPill severity={r.severity} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{r.title}</p>
                <p className="text-xs text-body">
                  {[r.system, r.location].filter(Boolean).join(' · ')}
                  {r.status === 'fixed' ? ` · Fixed ${day(r.fixedAt)}` : ` · Now ${r.status}`}
                  {r.note ? <> · “{r.note}”</> : null}
                  {r.requestedAt ? ` · requested ${day(r.requestedAt)}` : ''}
                </p>
                {r.verifiedAt && <p className="mt-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ Verified by {r.verifiedName || 'your company'} · {day(r.verifiedAt)}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-0 sm:pl-[4.5rem]">
              <button onClick={() => setContact(contact === r.ref ? null : r.ref)} className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5">Contact homeowner</button>
              <a href={recheckHref(job, r.homeownerEmail, inspectionId)} className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5">Book a re-check</a>
              {r.status === 'fixed' && (r.verifiedAt
                ? <button onClick={() => verify(r.ref, false)} disabled={busy === r.ref} className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-body hover:bg-ink/5 disabled:opacity-50">{busy === r.ref ? 'Saving…' : 'Undo verified'}</button>
                : <button onClick={() => verify(r.ref, true)} disabled={busy === r.ref} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy === r.ref ? 'Saving…' : 'Mark verified'}</button>)}
            </div>
            {contact === r.ref && (
              <div className="rounded-lg bg-ground px-3 py-2 text-sm text-ink sm:ml-[4.5rem]">
                {r.homeownerEmail ? <>
                  <span className="select-all font-medium">{r.homeownerEmail}</span>
                  <button onClick={() => { navigator.clipboard?.writeText(r.homeownerEmail!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
                    className="ml-3 text-xs font-semibold text-accent-ink hover:underline">{copied ? 'Copied' : 'Copy'}</button>
                  <a href={`mailto:${r.homeownerEmail}?subject=${encodeURIComponent(`Your repair: ${r.title}`)}`} className="ml-3 text-xs font-semibold text-accent-ink hover:underline">Email</a>
                </> : <span className="text-body">Their email isn’t on file. Use the client’s contact details on this job.</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {err && <p role="alert" className="border-t border-hairline px-4 py-2 text-xs text-safety">{err}</p>}
    </section>
  );
}
