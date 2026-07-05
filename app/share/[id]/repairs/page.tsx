'use client';

// ─── Public Repair Request view ──────────────────────────────────────────────
// The buyer's hand-off link: a seller or agent opens /share/<id>/repairs WITHOUT
// signing in and sees the buyer's prepared repair request — read-only, branded,
// printable, with a soft Ledrix CTA (the GTM seed). Reads the already-drafted
// home_repairs rows via the public proxy; no AI, no auth, no editing.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const BLUE = '#217BE8', BG = '#070707', BORDER = 'rgba(255,255,255,0.08)';
const CARD = 'linear-gradient(145deg, rgba(42,50,57,0.55), rgba(13,17,20,0.66))';
const TEXT = '#b6c4c7', DIM = '#3a4a4e', MED = '#5f7378';
const CRITICAL = '#FF3B3B', WARN = '#FACC15', INFO = '#8893A6';
const SEV_COLOR: Record<string, string> = { critical: CRITICAL, anomaly: WARN, cosmetic: INFO };
const SEV_LABEL: Record<string, string> = { critical: 'SAFETY', anomaly: 'DEFICIENCY', cosmetic: 'MAINTENANCE' };

type Repair = { id: string; item?: string; location?: string; severity?: string; generated_text?: string; edited_text?: string; status: string; sort_order?: number };
type Rec = { address?: string; city?: string; state?: string; zip?: string; inspection_date?: string };

async function pget<T>(path: string): Promise<T[]> {
  try {
    const r = await fetch(`/api/proxy?path=${encodeURIComponent(path)}`);
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}
const rtext = (r: Repair) => (r.edited_text && r.edited_text.trim()) || r.generated_text || '';

export default function PublicRepairsPage() {
  const params  = useParams();
  const shareId = params?.id as string;
  const [record,  setRecord]  = useState<Rec | null>(null);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shareId) { setLoading(false); return; }
    (async () => {
      const [recs, reps] = await Promise.all([
        pget<Rec>(`home_records?share_id=eq.${encodeURIComponent(shareId)}&select=address,city,state,zip,inspection_date&limit=1`),
        pget<Repair>(`home_repairs?share_id=eq.${encodeURIComponent(shareId)}&status=eq.included&order=sort_order.asc`),
      ]);
      setRecord(recs[0] ?? null);
      setRepairs(reps);
      setLoading(false);
    })();
  }, [shareId]);

  const sub = record ? [record.city, record.state, record.zip].filter(Boolean).join(', ') : '';

  return (
    <div style={{ background: BG, minHeight: '100vh', maxWidth: 640, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif', color: TEXT, paddingBottom: 40 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Roboto+Mono:wght@400;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}@media print{.no-print{display:none!important}body{background:#fff!important}}`}</style>

      <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ color: BLUE, fontSize: 8, fontWeight: 900, letterSpacing: 2.5, fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>LEDRIX · BUYER REPAIR REQUEST</div>
        <div style={{ color: '#fff', fontSize: 19, fontWeight: 900, lineHeight: 1.15 }}>{record?.address ?? 'Repair Request'}</div>
        {sub && <div style={{ color: MED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginTop: 5, fontFamily: 'Roboto Mono, monospace' }}>{sub}</div>}
        {record?.inspection_date && <div style={{ color: DIM, fontSize: 8.5, fontWeight: 700, letterSpacing: 1, marginTop: 6, fontFamily: 'Roboto Mono, monospace' }}>INSPECTED {record.inspection_date}</div>}
      </div>

      <div style={{ padding: '18px 16px 0' }}>
        {loading ? (
          <div style={{ color: DIM, textAlign: 'center', padding: '48px 0', fontSize: 11, fontFamily: 'Roboto Mono, monospace' }}>LOADING…</div>
        ) : repairs.length === 0 ? (
          <div style={{ color: DIM, textAlign: 'center', padding: '48px 24px', fontSize: 11.5, lineHeight: 1.6 }}>No repair request has been prepared for this property yet.</div>
        ) : repairs.map((r, i) => {
          const c = SEV_COLOR[(r.severity ?? '').toLowerCase()] ?? INFO;
          const l = SEV_LABEL[(r.severity ?? '').toLowerCase()] ?? 'MAINTENANCE';
          return (
            <div key={r.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '13px 15px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={{ color: BLUE, fontSize: 10, fontWeight: 900, fontFamily: 'Roboto Mono, monospace' }}>{i + 1}.</span>
                <span style={{ color: c, fontSize: 7.5, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', border: `1px solid ${c}44`, borderRadius: 6, padding: '2px 6px' }}>{l}</span>
                {r.item && <span style={{ color: MED, fontSize: 9, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item}{r.location ? ` · ${r.location}` : ''}</span>}
              </div>
              <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.55 }}>{rtext(r)}</div>
            </div>
          );
        })}

        {!loading && repairs.length > 0 && (
          <>
            <p style={{ color: DIM, fontSize: 9.5, lineHeight: 1.6, margin: '18px 4px' }}>
              This is a buyer-prepared repair request based on the home inspection findings. It is not a legal form or legal advice.
            </p>
            <button className="no-print" onClick={() => window.print()} style={{ width: '100%', background: `${BLUE}15`, border: `1px solid ${BLUE}44`, color: BLUE, borderRadius: 10, padding: '12px', fontSize: 10, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>PRINT / SAVE AS PDF</button>
          </>
        )}

        <div className="no-print" style={{ marginTop: 28, padding: '20px 16px 0', textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
          <div style={{ color: MED, fontSize: 10.5, fontWeight: 600, lineHeight: 1.6, marginBottom: 10 }}>
            Buying a home? Get inspection findings you can act on — and a repair request like this one.
          </div>
          <a href="https://ledrixlabs.com" style={{ color: BLUE, fontSize: 11, fontWeight: 800, textDecoration: 'none', fontFamily: 'Roboto Mono, monospace', letterSpacing: 1 }}>LEDRIXLABS.COM ↗</a>
        </div>
      </div>
    </div>
  );
}
