'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// ─── Supabase (same pattern as booking pages) ─────────────────────────────────
const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const HEADERS   = {
  apikey:        SUPA_ANON,
  Authorization: `Bearer ${SUPA_ANON}`,
  'Content-Type': 'application/json',
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const ACCENT   = '#00F3FF';
const CRITICAL = '#FF3B3B';
const WARN     = '#FACC15';
const GREEN    = '#22C55E';
const BG       = '#080808';
const CARD     = '#0a0a0a';
const BORDER   = '#141414';
const DIM      = '#333';
const MED      = '#666';
const TEXT     = '#aaa';

// ─── Types ────────────────────────────────────────────────────────────────────
type Anomaly = {
  id?: string;
  description?: string;
  severity?: string;
  unit?: string;
  location?: string;
  estimatedCost?: string;
  recommendation?: string;
  prosToCall?: string;
};

type Spec = {
  category?: string;
  material?: string;
  status?: string;
};

type HomeRecord = {
  id: string;
  share_id: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  year_built?: string;
  sqft?: string;
  beds?: string;
  baths?: string;
  garage?: string;
  inspector?: string;
  company?: string;
  license_number?: string;
  inspection_date?: string;
  inspection_type?: string;
  anomalies: Anomaly[];
  specs: Spec[];
  created_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return iso; }
}

function scoreCalc(anomalies: Anomaly[]) {
  const c = anomalies.filter(a => a.severity === 'critical').length;
  const w = anomalies.filter(a => a.severity === 'anomaly').length;
  const o = anomalies.filter(a => a.severity !== 'critical' && a.severity !== 'anomaly').length;
  const s = Math.max(0, Math.round(100 - c * 15 - w * 5 - o * 1));
  return {
    score: s,
    grade: s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 60 ? 'C' : s >= 45 ? 'D' : 'F',
    color: s >= 75 ? GREEN : s >= 60 ? WARN : CRITICAL,
  };
}

const SEV_COLOR: Record<string, string> = { critical: CRITICAL, anomaly: WARN, cosmetic: ACCENT };
const SEV_LABEL: Record<string, string> = {
  critical: 'SAFETY HAZARD',
  anomaly:  'DEFICIENCY',
  cosmetic: 'MAINTENANCE',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreRing({ score, grade, color }: { score: number; grade: string; color: string }) {
  const r       = 30;
  const circ    = +(2 * Math.PI * r).toFixed(1);
  const dashOff = +((1 - score / 100) * circ).toFixed(1);
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} fill="none" stroke={BORDER} strokeWidth="8" />
      <circle
        cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={dashOff}
        strokeLinecap="round" transform="rotate(-90 40 40)"
      />
      <text x="40" y="36" textAnchor="middle" fontSize="19" fontWeight="900"
        fill={color} fontFamily="Inter,system-ui,sans-serif">{score}</text>
      <text x="40" y="52" textAnchor="middle" fontSize="10" fontWeight="900"
        fill={color} fontFamily="Inter,system-ui,sans-serif" letterSpacing="2">{grade}</text>
    </svg>
  );
}

function FindingCard({ a }: { a: Anomaly }) {
  const sev   = a.severity ?? 'cosmetic';
  const color = SEV_COLOR[sev] ?? MED;
  const label = SEV_LABEL[sev] ?? sev.toUpperCase();
  const [expanded, setExpanded] = useState(false);
  const hasExtra = !!(a.recommendation || a.estimatedCost || a.prosToCall);

  return (
    <div
      onClick={() => hasExtra && setExpanded(e => !e)}
      style={{
        background: CARD, border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${color}`, borderRadius: 12,
        padding: '14px 16px', marginBottom: 8,
        cursor: hasExtra ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          background: `${color}18`, color, fontSize: 7, fontWeight: 900,
          letterSpacing: 1, padding: '3px 8px', borderRadius: 99,
          border: `1px solid ${color}44`, whiteSpace: 'nowrap',
          fontFamily: 'Roboto Mono, monospace',
        }}>{label}</span>
        <span style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 800, flex: 1, minWidth: 0 }}>
          {(a.unit ?? 'COMPONENT').toUpperCase()}
        </span>
        {a.location && (
          <span style={{ color: DIM, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
            {a.location}
          </span>
        )}
      </div>
      <p style={{ color: TEXT, fontSize: 12, lineHeight: 1.65, margin: 0 }}>
        {a.description ?? ''}
      </p>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          {a.recommendation && (
            <p style={{ color: MED, fontSize: 11, lineHeight: 1.6, marginBottom: 6 }}>
              {a.recommendation}
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {a.estimatedCost && a.estimatedCost !== 'N/A' && (
              <span style={{ color: WARN, fontSize: 9, fontWeight: 900 }}>
                EST. {a.estimatedCost}
              </span>
            )}
            {a.prosToCall && a.prosToCall !== 'N/A' && (
              <span style={{ color: ACCENT, fontSize: 9, fontWeight: 700 }}>
                {a.prosToCall}
              </span>
            )}
          </div>
        </div>
      )}
      {hasExtra && !expanded && (
        <div style={{ marginTop: 6, color: DIM, fontSize: 9, fontWeight: 700 }}>
          TAP FOR DETAILS
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skeleton() {
  const bar = (w: string, h = 10, mb = 8) => (
    <div style={{
      width: w, height: h, background: '#111', borderRadius: 6,
      marginBottom: mb, animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  );
  return (
    <div style={{ padding: '24px 16px' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }`}</style>
      {bar('60%', 14, 12)}
      {bar('40%', 10, 24)}
      {bar('100%', 80, 12)}
      {bar('100%', 80, 12)}
      {bar('100%', 80)}
    </div>
  );
}

// ─── Not found ────────────────────────────────────────────────────────────────
function NotFound() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center', gap: 16 }}>
      <div style={{ color: DIM, fontSize: 32 }}>◈</div>
      <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace' }}>RECORD NOT FOUND</div>
      <p style={{ color: MED, fontSize: 12, lineHeight: 1.7, maxWidth: 280 }}>
        This Home Record may not be activated yet, or the link may be incorrect.
        Contact your inspector to publish this report.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SharePage() {
  const params  = useParams();
  const shareId = params?.id as string;

  const [record,    setRecord]    = useState<HomeRecord | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [filter,    setFilter]    = useState<'all' | 'critical' | 'anomaly' | 'cosmetic'>('all');
  const [search,    setSearch]    = useState('');
  const [specsOpen, setSpecsOpen] = useState(false);
  const [copied,    setCopied]    = useState(false);

  useEffect(() => {
    if (!shareId || !SUPA_URL) { setLoading(false); setNotFound(true); return; }
    fetch(`${SUPA_URL}/rest/v1/home_records?share_id=eq.${encodeURIComponent(shareId)}&limit=1`, { headers: HEADERS })
      .then(r => r.json())
      .then((data: HomeRecord[]) => {
        if (!Array.isArray(data) || data.length === 0) setNotFound(true);
        else setRecord(data[0]);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [shareId]);

  useEffect(() => {
    if (record?.address) document.title = `${record.address} — Ledrix Home Record`;
  }, [record]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: `${record?.address} — Ledrix Home Record`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', maxWidth: 430, margin: '0 auto' }}>
        <NavBar address="" onShare={() => {}} copied={false} />
        <Skeleton />
      </div>
    );
  }

  if (notFound || !record) {
    return (
      <div style={{ background: BG, minHeight: '100vh', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        <NavBar address="" onShare={() => {}} copied={false} />
        <NotFound />
        <Footer />
      </div>
    );
  }

  const anomalies  = Array.isArray(record.anomalies) ? record.anomalies : [];
  const specs      = Array.isArray(record.specs) ? record.specs : [];
  const { score, grade, color: scoreColor } = scoreCalc(anomalies);

  const critical   = anomalies.filter(a => a.severity === 'critical');
  const deficien   = anomalies.filter(a => a.severity === 'anomaly');
  const cosmetic   = anomalies.filter(a => a.severity !== 'critical' && a.severity !== 'anomaly');

  const filtered = anomalies.filter(a => {
    if (filter !== 'all' && a.severity !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (a.unit ?? '').toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        (a.location ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const subAddress = [record.city, record.state, record.zip].filter(Boolean).join(', ');
  const confirmedSpecs = specs.filter(s => s.status === 'confirmed');

  return (
    <div style={{ background: BG, minHeight: '100vh', maxWidth: 430, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Roboto+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        input::placeholder { color: #222; }
      `}</style>

      <NavBar address={record.address ?? ''} onShare={handleShare} copied={copied} />

      {/* ── Hero card ──────────────────────────────────────────────────────── */}
      <div style={{
        margin: '16px 16px 0', borderRadius: 20, overflow: 'hidden',
        border: `1px solid #161616`, position: 'relative', height: 200,
        background: 'linear-gradient(135deg,#0a1520 0%,#080e18 50%,#060c14 100%)',
      }}>
        {/* Grid texture */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(0,243,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,243,255,0.04) 1px,transparent 1px)',
          backgroundSize: '28px 28px',
        }} />

        {/* Score ring top-right */}
        <div style={{ position: 'absolute', top: 14, right: 14 }}>
          <ScoreRing score={score} grade={grade} color={scoreColor} />
          <div style={{ textAlign: 'center', color: DIM, fontSize: 7, fontWeight: 900, letterSpacing: 2, marginTop: 2, fontFamily: 'Roboto Mono, monospace' }}>L-INDEX</div>
        </div>

        {/* Address block bottom-left */}
        <div style={{ position: 'absolute', inset: 0, padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ color: ACCENT, fontSize: 7, fontWeight: 700, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 6 }}>
            LEDRIX HOME RECORD · VERIFIED
          </div>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, lineHeight: 1.2, letterSpacing: -0.5, maxWidth: '70%' }}>
            {record.address ?? 'ADDRESS PENDING'}
          </div>
          {subAddress && (
            <div style={{ color: MED, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, marginTop: 4, fontFamily: 'Roboto Mono, monospace' }}>
              {subAddress}
            </div>
          )}
          <div style={{ color: DIM, fontSize: 8, fontWeight: 700, letterSpacing: 1, marginTop: 8, fontFamily: 'Roboto Mono, monospace' }}>
            INSPECTED {fmtDate(record.inspection_date).toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
        <StatBox value={critical.length}  label="SAFETY"   color={critical.length  > 0 ? CRITICAL : DIM} />
        <StatBox value={deficien.length}  label="DEFICIEN." color={deficien.length  > 0 ? WARN    : DIM} />
        <StatBox value={cosmetic.length}  label="MAINT."   color={cosmetic.length  > 0 ? ACCENT  : DIM} />
        <StatBox value={anomalies.length} label="TOTAL"    color={TEXT} />
      </div>

      {/* ── Home Fax banner ────────────────────────────────────────────────── */}
      <div style={{ margin: '0 16px 16px', background: `${ACCENT}08`, border: `1px solid ${ACCENT}22`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ color: ACCENT, fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>◈</div>
          <div>
            <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>
              PROPERTY PASSPORT · HOME FAX
            </div>
            <p style={{ color: TEXT, fontSize: 11, lineHeight: 1.65 }}>
              This inspection record is permanently linked to this property.
              It transfers to every future owner — building a verified history that protects buyers and sellers alike.
            </p>
          </div>
        </div>
      </div>

      {/* ── Property details strip ─────────────────────────────────────────── */}
      {(record.year_built || record.sqft || record.beds || record.baths) && (
        <div style={{ display: 'flex', gap: 0, margin: '0 16px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          {([
            record.year_built ? ['BUILT', record.year_built] : null,
            record.sqft       ? ['SQ FT', record.sqft]       : null,
            record.beds       ? ['BEDS',  record.beds]        : null,
            record.baths      ? ['BATHS', record.baths]       : null,
          ].filter((x): x is [string, string] => x !== null)).map(([label, value], i, arr) => (
            <div key={i as number} style={{
              flex: 1, textAlign: 'center', padding: '10px 8px',
              borderRight: i < arr.length - 1 ? `1px solid ${BORDER}` : 'none',
            }}>
              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 900 }}>{value as string}</div>
              <div style={{ color: DIM, fontSize: 7, fontWeight: 900, letterSpacing: 1.5, marginTop: 3, fontFamily: 'Roboto Mono, monospace' }}>{label as string}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Findings section ───────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 14 }}>
          FINDINGS
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
          {([
            ['all',      'All',        anomalies.length,  TEXT],
            ['critical', 'Safety',     critical.length,   CRITICAL],
            ['anomaly',  'Deficiency', deficien.length,   WARN],
            ['cosmetic', 'Maint.',     cosmetic.length,   ACCENT],
          ] as [typeof filter, string, number, string][]).map(([key, label, count, c]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                background: filter === key ? `${c}20` : CARD,
                border: `1px solid ${filter === key ? c + '55' : BORDER}`,
                color: filter === key ? c : DIM,
                borderRadius: 99, padding: '6px 14px',
                fontSize: 9, fontWeight: 900, letterSpacing: 1,
                fontFamily: 'Roboto Mono, monospace',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 12 }}>⌕</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search findings…"
            style={{
              width: '100%', background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 10, padding: '10px 12px 10px 30px',
              color: '#e2e8f0', fontSize: 12, outline: 'none',
              fontFamily: 'Inter, sans-serif',
            }}
          />
        </div>

        {/* Findings list */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: DIM }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: filter === 'all' ? GREEN : DIM, fontFamily: 'Roboto Mono, monospace' }}>
              {filter === 'all' ? 'NO FINDINGS LOGGED' : `NO ${filter.toUpperCase()} FINDINGS`}
            </div>
          </div>
        ) : (
          filtered.map((a, i) => <FindingCard key={i} a={a} />)
        )}
      </div>

      {/* ── Property specs ─────────────────────────────────────────────────── */}
      {confirmedSpecs.length > 0 && (
        <div style={{ margin: '24px 16px 0' }}>
          <button
            onClick={() => setSpecsOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 14px',
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace' }}>
              MATERIAL SPECS
            </span>
            <span style={{ color: DIM, fontSize: 14 }}>{specsOpen ? '−' : '+'}</span>
          </button>
          {specsOpen && (
            <div style={{ paddingTop: 14 }}>
              {confirmedSpecs.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '8px 0', borderBottom: `1px solid ${BORDER}22`,
                }}>
                  <span style={{ color: DIM, fontSize: 9, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace' }}>
                    {(s.category ?? '').toUpperCase()}
                  </span>
                  <span style={{ color: TEXT, fontSize: 11, fontWeight: 700, textAlign: 'right', maxWidth: '60%' }}>
                    {s.material ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Inspector card ─────────────────────────────────────────────────── */}
      <div style={{ margin: '24px 16px 0', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 12 }}>
          INSPECTOR
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 900, marginBottom: 3 }}>
              {record.inspector ?? '—'}
            </div>
            {record.company && (
              <div style={{ color: MED, fontSize: 10, fontWeight: 700, marginBottom: 2 }}>
                {record.company}
              </div>
            )}
            {record.license_number && (
              <div style={{ color: DIM, fontSize: 9, fontFamily: 'Roboto Mono, monospace' }}>
                LIC #{record.license_number}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: DIM, fontSize: 8, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>
              {record.inspection_type?.toUpperCase() ?? 'HOME INSPECTION'}
            </div>
            <div style={{ color: TEXT, fontSize: 11, fontWeight: 700 }}>
              {fmtDate(record.inspection_date)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
      <div style={{ margin: '16px 16px 0', padding: '12px 16px', background: `${WARN}08`, border: `1px solid ${WARN}22`, borderRadius: 10 }}>
        <p style={{ color: MED, fontSize: 9, lineHeight: 1.7, fontFamily: 'Roboto Mono, monospace' }}>
          ⚠ This report reflects conditions at the time of inspection. It does not constitute a warranty or guarantee.
          Consult licensed professionals for all repair decisions.
        </p>
      </div>

      <div style={{ height: 40 }} />
      <Footer />
    </div>
  );
}

// ─── Shared layout components ─────────────────────────────────────────────────

function NavBar({ address, onShare, copied }: { address: string; onShare: () => void; copied: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 20px', borderBottom: `1px solid #111`,
      background: 'rgba(8,8,8,0.95)', position: 'sticky', top: 0, zIndex: 100,
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      maxWidth: 430, width: '100%', boxSizing: 'border-box',
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: -0.5 }}>
          <span style={{ color: ACCENT }}>L·</span><span style={{ color: '#fff' }}>X</span>
        </div>
        <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 2, color: DIM, marginTop: 1, fontFamily: 'Roboto Mono, monospace' }}>
          HOME RECORD
        </div>
      </div>

      <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
        {address && (
          <div style={{ color: '#aaa', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {address}
          </div>
        )}
      </div>

      <button
        onClick={onShare}
        style={{
          background: copied ? `${GREEN}20` : `${ACCENT}15`,
          border: `1px solid ${copied ? GREEN + '44' : ACCENT + '33'}`,
          color: copied ? GREEN : ACCENT,
          borderRadius: 8, padding: '7px 12px',
          fontSize: 9, fontWeight: 900, letterSpacing: 1,
          cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
          flexShrink: 0,
        }}
      >
        {copied ? 'COPIED' : 'SHARE'}
      </button>
    </div>
  );
}

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ color, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 7, fontWeight: 900, letterSpacing: 1.5, marginTop: 4, fontFamily: 'Roboto Mono, monospace' }}>{label}</div>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ padding: '20px 16px 32px', textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ color: ACCENT, fontSize: 14, fontWeight: 900, letterSpacing: -0.5, marginBottom: 4 }}>
        L·X
      </div>
      <div style={{ color: DIM, fontSize: 8, fontWeight: 700, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>
        LEDRIX SPATIAL OS
      </div>
      <a
        href="https://ledrixlabs.com"
        style={{ color: MED, fontSize: 10, fontWeight: 600, textDecoration: 'none' }}
      >
        ledrixlabs.com
      </a>
    </div>
  );
}
