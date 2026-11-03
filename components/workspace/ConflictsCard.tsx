'use client';

// "N changes disagree between devices" on an inspection (owner-approved mockup 2026-11-03). Shown above the findings only
// when something disagrees; each row offers the saved value and the other device's, the same choices as the phone
// (lib/conflicts/rules.ts, copied from the app). The job cannot be sealed until each is settled (ledrix-app SQL #97).
import { useCallback, useEffect, useState } from 'react';
import { choicesFor, deviceLabel, fieldLabel, savedValue, valueLabel } from '@/lib/conflicts/rules';
import { keepSaved, listBlockingConflicts, useOther, type OpenConflict } from '@/lib/conflicts/api';
import { webDevice } from '@/lib/findings/edit';
import type { EditLock } from './FindingEditor';
import { formatWhen } from './ui';

export function ConflictsCard({ inspectionId, lock, canEdit, onSettled }: { inspectionId: string; lock: EditLock; canEdit: boolean; onSettled: () => void }) {
  const [rows, setRows] = useState<OpenConflict[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await listBlockingConflicts(inspectionId)); } catch { setRows([]); } }, [inspectionId]);
  useEffect(() => { void load(); }, [load]);
  if (!rows.length) return null;

  const settle = async (c: OpenConflict, pick: 'keep' | 'other') => {
    setBusy(`${c.id}:${pick}`); setNote(null);
    try {
      let r;
      if (pick === 'keep') r = await keepSaved(c);
      else { const lease = await lock.ensure(); if (!lease) return; r = await useOther(c, lease); }
      if (r.ok === true) { setRows(rs => rs.filter(x => x.id !== c.id)); onSettled(); }
      else { setNote('message' in r ? r.message : 'It could not be settled.'); void load(); }
    } finally { setBusy(null); }
  };
  const n = rows.length;
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="border-b border-hairline bg-amber-600/10 px-4 py-2.5 text-sm text-ink">
        <b>{n} change{n === 1 ? '' : 's'} disagree{n === 1 ? 's' : ''} between devices.</b> Pick which is right — the job can’t be sealed until you do.
      </div>
      {note && <p className="border-b border-hairline px-4 py-2 text-xs text-safety">{note}</p>}
      <ul className="divide-y divide-hairline">
        {rows.map(c => {
          const ch = choicesFor(c);
          const from = deviceLabel(c.client_device, webDevice());
          return (
            <li key={c.id} className="grid grid-cols-1 gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-ink">{c.title} · {fieldLabel(c.field)}</p>
                <p className="text-xs text-muted">Saved: {valueLabel(c.field, savedValue(c))} · {from} ({formatWhen(c.created_at)}): {valueLabel(c.field, c.client_value)}</p>
                {ch.note && <p className="mt-1 text-xs text-muted">{ch.note}</p>}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" disabled={!!busy} onClick={() => settle(c, 'keep')} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50">
                    {busy === `${c.id}:keep` ? 'Saving…' : `Keep ${valueLabel(c.field, savedValue(c))}`}</button>
                  {ch.useOther && <button type="button" disabled={!!busy} onClick={() => settle(c, 'other')} className="rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5 disabled:opacity-50">
                    {busy === `${c.id}:other` ? 'Saving…' : `Use ${valueLabel(c.field, c.client_value)}`}</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
