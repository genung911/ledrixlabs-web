'use client';

// "Wet Bar keeps being added" — the website's place for location suggestions (ledrix-app PLAN_2026-11-21_location.md L6,
// mockup D5Pa39S7oUMB5msnLqusc8 frame 4). Shown only to someone the server returns suggestions for (approve_locations);
// renders nothing otherwise, and nothing before SQL #138.
import { useCallback, useEffect, useState } from 'react';
import { STANDARD_LOCATIONS, LOCATION_GROUPS } from '@/lib/scope/core/taxonomy/locations';
import { decideLocationSuggestion, loadLocationSuggestions, type LocationGroup, type LocationSuggestion } from '@/lib/locations/suggestions';
import { btn, field, label } from './ui';

export function LocationSuggestions() {
  const [list, setList] = useState<LocationSuggestion[]>([]);
  const refresh = useCallback(() => { loadLocationSuggestions().then(setList).catch(() => setList([])); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  if (!list.length) return null;
  return (
    <section className="mb-6 space-y-3" aria-label="Location suggestions">
      {list.map(s => <SuggestionCard key={s.key} s={s} onDone={setList} />)}
    </section>
  );
}

function SuggestionCard({ s, onDone }: { s: LocationSuggestion; onDone: (next: LocationSuggestion[]) => void }) {
  const [name, setName] = useState(s.label);
  const [group, setGroup] = useState<LocationGroup>('inside');
  const [mapsTo, setMapsTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const typed = Object.entries(s.spellings ?? {}).sort((a, b) => b[1] - a[1]);
  const go = async (d: Parameters<typeof decideLocationSuggestion>[1]) => {
    setBusy(true); setErr('');
    try { onDone(await decideLocationSuggestion(s.key, d)); } catch (e) { setErr(e instanceof Error ? e.message : 'Not saved.'); } finally { setBusy(false); }
  };
  const std = STANDARD_LOCATIONS.find(l => l.id === mapsTo);
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-accent">LOCATION SUGGESTION</p>
      <h3 className="mt-1 text-lg font-semibold text-ink">“{s.label}” keeps being added</h3>
      <div className="mt-3 grid grid-cols-3 gap-3 border-t-2 border-ink pt-3">
        <Stat n={s.inspections} k={`of the last ${s.recent_total} inspections`} />
        <Stat n={s.inspectors} k={s.inspectors === 1 ? 'inspector' : 'inspectors'} />
        <Stat n={s.findings} k="findings filed there" />
      </div>
      <p className="mt-3 text-sm text-body"><span className="mr-2 text-[10px] font-semibold tracking-[0.14em] text-muted">AS TYPED</span>{typed.map(([w, n]) => `${w} ×${n}`).join(' · ')}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>Name it<input className={field} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className={label}>Group
          <select className={field} value={group} onChange={e => setGroup(e.target.value as LocationGroup)}>
            {LOCATION_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className={btn.primary} disabled={busy || !name.trim()} onClick={() => go({ action: 'add', label: name.trim(), group })}>Add to company list</button>
        <select aria-label="Use an existing location" className={field + ' w-auto'} value={mapsTo} onChange={e => setMapsTo(e.target.value)}>
          <option value="">Use an existing location…</option>
          {STANDARD_LOCATIONS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        {std && <button className={btn.secondary} disabled={busy} onClick={() => go({ action: 'map', label: std.label, group: std.group, mapsTo: std.id })}>Use {std.label}</button>}
        <button className={btn.secondary} disabled={busy} onClick={() => go({ action: 'dismiss' })}>Not now</button>
      </div>
      {err && <p className="mt-2 text-sm text-safety">{err}</p>}
      <p className="mt-3 text-xs text-muted">Past findings keep the words they were saved with, and sent reports never change. “Not now” asks again only if it doubles.</p>
    </div>
  );
}

function Stat({ n, k }: { n: number; k: string }) {
  return <div><p className="text-2xl tabular-nums text-ink">{n}</p><p className="text-[9px] uppercase tracking-[0.1em] text-muted">{k}</p></div>;
}
