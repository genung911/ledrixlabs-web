'use client';

// TrainingCard — "Help train Ledrix Intelligence", the company's opt-in (owner 2026-11-10, mockup 6mWCcj2H2hnYwyaCTMA5wm;
// SQL #120 applied 2026-11-10). The same setting as the app's Settings › Company admin, held by the server: read from
// `companies`, changed only through set_company_training (owner only; who and when are the server's). A change counts
// once the server's re-read agrees. Never-asked owners get the one-time question, with two equal answers.
import { useCallback, useEffect, useState } from 'react';
import { workspace } from '@/lib/workspace/client';
import { Card } from './ui';
import { setCompanyTraining } from '@/lib/training/api';

type T = { optIn: boolean; askedAt: string | null; changedAt: string | null } | null;

const USED = ['Inspection photos Ledrix read', "Ledrix's suggested answers, and the second check's verdict", "Your inspectors' decisions: confirmed, changed and to what, or rejected"];
const NEVER = ['Client names, contact details, payment information', 'Report text your inspectors wrote', 'Anything recorded while this was off'];

export function TrainingCard({ companyId, companyName, isOwner }: { companyId: string; companyName: string | null; isOwner: boolean }) {
  const [t, setT] = useState<T>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await workspace.from('companies').select('training_opt_in, training_asked_at, training_changed_at').eq('id', companyId).maybeSingle();
    if (error || !data) { setFailed(true); return; }
    setFailed(false);
    setT({ optIn: data.training_opt_in === true, askedAt: data.training_asked_at ?? null, changedAt: data.training_changed_at ?? null });
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const save = async (on: boolean) => {
    setBusy(true); setError(null); setConfirming(false);
    const { error } = await setCompanyTraining(companyId, on);
    if (error) { setBusy(false); setError(/owner/i.test(error) ? 'Only the company owner can change this.' : `Couldn't save. Nothing was changed. (${error})`); return; }
    await load(); setBusy(false);
  };

  const asking = isOwner && t && t.askedAt == null;
  const btn = 'rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50';

  return (
    <Card title="Ledrix Intelligence">
      <div className="space-y-3 px-4 py-4 text-sm">
        {failed && <p className="text-muted">This setting could not be read. It counts as off.</p>}
        {t && asking && (
          <div className="space-y-2">
            <p className="font-semibold text-ink">Help train Ledrix Intelligence?</p>
            <p className="text-body">If you say yes, photos Ledrix reads and your inspectors&rsquo; decisions on them may be used to make Ledrix&rsquo;s AI more accurate. Client names, contact details and report text are never used. Ledrix works the same either way.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => save(false)} className={btn}>Not now</button>
              <button type="button" disabled={busy} onClick={() => save(true)} className={btn}>Yes, help train</button>
            </div>
            <p className="text-xs text-muted">You can change this any time here or in the app.</p>
          </div>
        )}
        {t && !asking && (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-ink">Help train Ledrix Intelligence</p>
                <p className="text-muted">{t.optIn
                  ? `On${t.changedAt ? ` since ${new Date(t.changedAt).toLocaleDateString()}` : ''}, turned on by the company owner. New photo reads may be used for training.`
                  : 'Off. Nothing from your company is used to train a model.'}</p>
              </div>
              {isOwner && (t.optIn
                ? <button type="button" disabled={busy} onClick={() => save(false)} className={btn}>Turn off</button>
                : <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={btn}>Turn on</button>)}
            </div>
            {!isOwner && <p className="text-xs text-muted">Only the company owner can change this.</p>}
            {confirming && (
              <div className="space-y-2 rounded-lg border border-hairline p-3">
                <p className="font-semibold text-ink">Turn on training for {companyName || 'your company'}?</p>
                <p className="text-body">From now on, photos Ledrix reads and your inspectors&rsquo; decisions on them may be used to train Ledrix Intelligence. Client names, contact details and report text are never used. You can turn it off any time. Photos taken before today are not included.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => save(true)} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50">Turn on</button>
                  <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={btn}>Not now</button>
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">What is used</p><ul className="mt-1 list-disc pl-5 text-body">{USED.map(x => <li key={x}>{x}</li>)}</ul></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Never used</p><ul className="mt-1 list-disc pl-5 text-body">{NEVER.map(x => <li key={x}>{x}</li>)}</ul></div>
            </div>
            <p className="text-xs text-muted">Either way, Ledrix keeps a record of each photo read with the inspection, to measure and improve accuracy. That never leaves your company&rsquo;s access rules and is never sold.</p>
          </>
        )}
        {error && <p className="text-amber-600">{error}</p>}
      </div>
    </Card>
  );
}
