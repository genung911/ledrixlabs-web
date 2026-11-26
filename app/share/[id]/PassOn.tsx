import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { ACCENT, BORDER, CARD, MED, TEXT, fmtDate } from './shared';

// ─── PASS AN INSPECTION ON (hr2, owner 2026-11-25: approval pack item 13; SQL #155) ──────────────────────────────────
// The owner's switch: "Let future owners of this home see this inspection" — off unless turned on, changeable any time.
// The server answers only for the home's owner (report_pass_on → null for anyone else), so the row shows only to them.
// And the other side: someone who holds the home now sees the earlier owners' inspections that were passed on to them
// (/api/passed-on — the database decides; PDFs signed for an hour). Reports not passed on stay with that owner and their
// inspection company.
function PassOnRow({ shareId }: { shareId: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!shareId) return;
    supabase.rpc('report_pass_on', { p_share_id: shareId }).then(({ data, error }) => { if (live && !error && typeof data === 'boolean') setOn(data); });
    return () => { live = false; };
  }, [shareId]);
  if (on === null) return null;
  const flip = async () => {
    setBusy(true); setErr(null);
    const r = await supabase.rpc('set_report_pass_on', { p_share_id: shareId, p_on: !on });
    setBusy(false);
    if (r.error) { setErr(r.error.message || 'Couldn’t save. Try again.'); return; }
    setOn(!on);
  };
  return (
    <div className="hr-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15.5 }}>Let future owners see this inspection</span>
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--hd)' }}>{on ? 'On. A future owner of this home can open this report.' : 'Off. This report stays with you and your inspection company.'}</span>
        {err && <span role="alert" style={{ display: 'block', fontSize: 12.5, color: 'var(--hsafety)', marginTop: 2 }}>{err}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label="Let future owners see this inspection" disabled={busy} onClick={flip}
        style={{ width: 51, height: 31, borderRadius: 16, border: 'none', cursor: busy ? 'default' : 'pointer', position: 'relative', flex: 'none',
          background: on ? 'var(--hok)' : 'var(--hl)', transition: 'background .15s', opacity: busy ? 0.6 : 1 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 27, height: 27, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s' }} />
      </button>
    </div>
  );
}

type Passed = { shareId: string; date: string | null; company: string | null; inspector: string | null; pdfUrl: string | null };
function EarlierInspections({ shareId }: { shareId: string }) {
  const [rows, setRows] = useState<Passed[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token || !shareId) return;
      const r = await fetch(`/api/passed-on?share=${encodeURIComponent(shareId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }).catch(() => null);
      const body = r && r.ok ? await r.json().catch(() => null) : null;
      if (live && Array.isArray(body?.reports)) setRows(body.reports);
    })();
    return () => { live = false; };
  }, [shareId]);
  if (!rows.length) return null;
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '12px 14px', marginTop: 14 }}>
      <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>Earlier inspections of this home</div>
      <div style={{ color: MED, fontSize: 12.5, marginTop: 2, marginBottom: 6 }}>A previous owner chose to pass these on to you.</div>
      {rows.map(x => (
        <div key={x.shareId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${BORDER}` }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', color: TEXT, fontSize: 14, fontWeight: 600 }}>{x.date ? `Inspected ${fmtDate(x.date)}` : 'Inspection'}</span>
            <span style={{ display: 'block', color: MED, fontSize: 12 }}>{[x.company, x.inspector].filter(Boolean).join(' · ')}</span>
          </span>
          {x.pdfUrl ? <a href={x.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>Open PDF ›</a>
            : <span style={{ color: MED, fontSize: 12 }}>No PDF</span>}
        </div>
      ))}
    </div>
  );
}

export { PassOnRow, EarlierInspections };
