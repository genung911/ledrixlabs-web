import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { can, supaGet, fmtDate, type Anomaly, type HomeRecord } from './shared';

// ─── REPAIR STATUS — the homeowner's word on each finding (owner 2026-11-25, approval pack item 2, SQL #152/#153/#154) ──
// Open → Scheduled → Fixed is the HOMEOWNER's; ✓ Verified is the INSPECTOR's (mark_finding_verified, #154) and is never
// set from here. When Fixed, the homeowner may OPT IN to "Ask my inspector to check it" with a note — nothing is sent
// otherwise; unticking later, or leaving Fixed, withdraws it (the server's rule). Only someone who holds the home can
// change it (can('status.set') = the report's own link + holds, h2; the server checks again: an ACTIVE tenure). Everyone
// else sees the pill, and it doesn't open. Statuses are read through the link (/api/portal, select-only, no note).
type RepairState = 'open' | 'scheduled' | 'fixed';
type FindingStatus = {
  anomaly_ref: string; status: RepairState; check_requested_at: string | null;
  verified_at: string | null; verified_name: string | null; updated_at: string | null;
};
const STATUS_COLS = 'anomaly_ref,status,check_requested_at,verified_at,verified_name,updated_at';
const RS_LABEL: Record<RepairState, string> = { open: 'Open', scheduled: 'Scheduled', fixed: 'Fixed' };

/** The record's statuses by finding id, and a reload. Missing table / no rows: every finding reads Open. */
function useRepairStatuses(shareId: string): [Record<string, FindingStatus>, () => Promise<void>] {
  const [map, setMap] = useState<Record<string, FindingStatus>>({});
  const reload = useCallback(async () => {
    if (!shareId) return;
    const rows = await supaGet<FindingStatus>(`home_finding_status?share_id=eq.${encodeURIComponent(shareId)}&select=${STATUS_COLS}`);
    setMap(Object.fromEntries(rows.filter(r => r?.anomaly_ref).map(r => [r.anomaly_ref, r])));
  }, [shareId]);
  useEffect(() => { reload(); }, [reload]);
  return [map, reload];
}

/** The pill on a finding row. `onOpen` only when this person may change it. */
function StatusPill({ st, onOpen }: { st?: FindingStatus; onOpen?: () => void }) {
  const s: RepairState = st?.status ?? 'open';
  const verified = s === 'fixed' && !!st?.verified_at;
  const label = verified ? '✓ Verified' : RS_LABEL[s];
  const tone = verified ? { bg: 'var(--hok)', fg: '#fff', bd: 'var(--hok)' }
    : s === 'fixed' ? { bg: 'transparent', fg: 'var(--hok)', bd: 'var(--hok)' }
    : s === 'scheduled' ? { bg: 'var(--hbs)', fg: 'var(--hblue)', bd: 'transparent' }
    : { bg: 'var(--hc2)', fg: 'var(--hd)', bd: 'transparent' };
  const style = { background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`, borderRadius: 999, padding: '4px 10px',
    fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' as const, flex: 'none', font: 'inherit', lineHeight: 1.3 };
  const title = verified ? `Verified by ${st?.verified_name || 'your inspector'}${st?.verified_at ? ` · ${fmtDate(st.verified_at)}` : ''}` : undefined;
  if (!onOpen) return <span title={title} style={{ ...style, fontSize: 12 }}>{label}</span>;
  return <button onClick={onOpen} title={title} aria-label={`Repair status: ${label}. Change`} style={{ ...style, fontSize: 12, cursor: 'pointer' }}>{label}</button>;
}

/** The sheet: Open / Scheduled / Fixed, and — when Fixed — the opt-in check with an optional note. */
function StatusSheet({ a, st, record, onClose, onSaved }: {
  a: Anomaly; st?: FindingStatus; record: HomeRecord; onClose: () => void; onSaved: () => void;
}) {
  const [status, setStatus] = useState<RepairState>(st?.status ?? 'open');
  const [ask, setAsk] = useState(!!st?.check_requested_at);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const title = (a.issueTitle && a.issueTitle.trim()) || a.unit || 'Finding';
  const who = [record.inspector, record.company].filter(Boolean).join(' at ') || 'Your inspector';
  const verified = !!st?.verified_at;
  const save = async () => {
    if (!can('status.set') || !a.id) return;
    setBusy(true); setErr(null);
    const r = await supabase.rpc('set_finding_status', {
      p_share_id: record.share_id, p_ref: a.id, p_status: status,
      p_ask_check: status === 'fixed' && ask, p_note: status === 'fixed' && ask && note.trim() ? note.trim().slice(0, 500) : null,
    });
    setBusy(false);
    if (r.error) { setErr(r.error.message || 'Couldn’t save. Try again.'); return; }
    onSaved(); onClose();
  };
  const seg = (s: RepairState) => (
    <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
      style={{ flex: 1, border: 0, borderRadius: 8, padding: '9px 0', font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        background: status === s ? 'var(--hc)' : 'transparent', color: status === s ? 'var(--hi)' : 'var(--hd)',
        boxShadow: status === s ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>{RS_LABEL[s]}</button>
  );
  return (
    <div role="dialog" aria-modal="true" aria-label={`Repair status: ${title}`} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} className="hr"
        style={{ width: '100%', maxWidth: 480, borderRadius: '18px 18px 0 0', padding: `18px 16px calc(18px + env(safe-area-inset-bottom, 0px))`, background: 'var(--hb)' }}>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--hd)', marginTop: 2 }}>{[a.component || a.unit, a.location].filter(Boolean).join(' · ')}</div>
        <div role="group" aria-label="Status" style={{ display: 'flex', gap: 2, background: 'var(--hc2)', borderRadius: 10, padding: 3, marginTop: 14 }}>
          {(['open', 'scheduled', 'fixed'] as RepairState[]).map(seg)}
        </div>
        {verified && status === 'fixed' && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--hok)', fontWeight: 600 }}>
            ✓ Verified by {st?.verified_name || 'your inspector'}{st?.verified_at ? ` · ${fmtDate(st.verified_at)}` : ''}
          </div>
        )}
        {status === 'fixed' && !verified && (
          <div className="hr-card" style={{ marginTop: 12, padding: 12 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={ask} onChange={e => setAsk(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, accentColor: 'var(--hblue)' }} />
              <span>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>Ask my inspector to check it</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)', marginTop: 2 }}>
                  {st?.check_requested_at ? `Asked ${fmtDate(st.check_requested_at)}. Untick to withdraw.` : `${who} gets your request.`}
                </span>
              </span>
            </label>
            {ask && (
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2}
                placeholder={st?.check_requested_at ? 'Add to your note (optional)' : 'Note for your inspector (optional) — e.g. "Plumber replaced the fitting Dec 2"'}
                aria-label="Note for your inspector"
                style={{ width: '100%', marginTop: 10, border: '1px solid var(--hl)', borderRadius: 9, padding: '9px 10px', font: 'inherit', fontSize: 14, background: 'var(--hc)', color: 'var(--hi)', resize: 'vertical' }} />
            )}
          </div>
        )}
        {status !== 'fixed' && st?.check_requested_at && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--hd)' }}>Saving this withdraws your request to your inspector.</div>
        )}
        {err && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: 'var(--hsafety)' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, border: '1px solid var(--hl)', background: 'var(--hc)', color: 'var(--hi)', borderRadius: 11, padding: 12, font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ flex: 1, border: 0, background: 'var(--hblue)', color: '#fff', borderRadius: 11, padding: 12, font: 'inherit', fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export { useRepairStatuses, StatusPill, StatusSheet, RS_LABEL, STATUS_COLS };
export type { FindingStatus, RepairState };
