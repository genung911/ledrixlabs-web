'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

// ─── API helpers (proxy through Next.js to avoid CORS) ───────────────────────
async function supaGet<T>(path: string): Promise<T[]> {
  try {
    const r = await fetch(`/api/proxy?path=${encodeURIComponent(path)}`);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
async function supaPost(table: string, body: object | object[]) {
  try {
    return await fetch(`/api/proxy?path=${encodeURIComponent(table)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { return new Response(null, { status: 500 }); }
}
async function supaPatch(table: string, filter: string, body: object) {
  try {
    return await fetch(`/api/proxy?path=${encodeURIComponent(table)}&filter=${encodeURIComponent(filter)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { return new Response(null, { status: 500 }); }
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const ACCENT   = '#00F3FF';
const CRITICAL = '#FF3B3B';
const WARN     = '#FACC15';
const GREEN    = '#22C55E';
const PURPLE   = '#A78BFA';
const BG       = '#080808';
const CARD     = '#0a0a0a';
const CARD2    = '#0d0d0d';
const BORDER   = '#141414';
const DIM      = '#333';
const MED      = '#555';
const TEXT     = '#aaa';

// ─── Types ────────────────────────────────────────────────────────────────────
type Anomaly = {
  id?: string; description?: string; severity?: string; unit?: string;
  location?: string; estimatedCost?: string; recommendation?: string; prosToCall?: string;
};
type Spec = { category?: string; material?: string; status?: string; };
type HomeRecord = {
  id: string; share_id: string; address?: string; city?: string; state?: string;
  zip?: string; year_built?: string; sqft?: string; beds?: string; baths?: string;
  garage?: string; inspector?: string; company?: string; license_number?: string;
  inspection_date?: string; inspection_type?: string;
  anomalies: Anomaly[]; specs: Spec[]; created_at: string;
};
type Project = {
  id: string; share_id: string; title: string; system?: string; priority?: string;
  status: string; description?: string; recommendation?: string; budget_estimate?: string;
  contractor_type?: string; notes?: string; photos: string[];
  appliance_info?: { brand?: string; model?: string; serial?: string; scanned_at?: string; lat?: number; lng?: number; };
  seeded: boolean; created_at: string; updated_at: string;
};
type Reminder = {
  id: string; share_id: string; title: string; system?: string; due_date?: string;
  recurrence?: string; completed: boolean; snoozed_until?: string; notes?: string;
  seeded: boolean; created_at: string;
};

type Tab = 'home' | 'findings' | 'projects' | 'reminders' | 'docs';

// ─── Constants ────────────────────────────────────────────────────────────────
const APPLIANCE_SYSTEMS = ['hvac', 'heating', 'cooling', 'air conditioning', 'furnace',
  'water heater', 'dishwasher', 'refrigerator', 'washer', 'dryer', 'oven', 'range',
  'stove', 'microwave', 'garbage disposal', 'plumbing', 'electrical panel', 'panel'];

const STATUS_COLOR: Record<string,string> = {
  identified: DIM, quoted: WARN, scheduled: ACCENT,
  in_progress: PURPLE, resolved: GREEN,
};
const STATUS_LABEL: Record<string,string> = {
  identified: 'IDENTIFIED', quoted: 'QUOTED', scheduled: 'SCHEDULED',
  in_progress: 'IN PROGRESS', resolved: 'RESOLVED',
};
const STATUS_NEXT: Record<string,string> = {
  identified: 'quoted', quoted: 'scheduled', scheduled: 'in_progress',
  in_progress: 'resolved', resolved: 'resolved',
};
const SEV_COLOR: Record<string,string> = { critical: CRITICAL, anomaly: WARN, cosmetic: ACCENT };
const SEV_LABEL: Record<string,string> = { critical: 'SAFETY', anomaly: 'DEFICIENCY', cosmetic: 'MAINTENANCE' };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}
function addDays(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function scoreCalc(anomalies: Anomaly[]) {
  const c = anomalies.filter(a => a.severity === 'critical').length;
  const w = anomalies.filter(a => a.severity === 'anomaly').length;
  const o = anomalies.filter(a => a.severity !== 'critical' && a.severity !== 'anomaly').length;
  const s = Math.max(0, Math.round(100 - c * 15 - w * 5 - o * 1));
  return { score: s, grade: s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 60 ? 'C' : s >= 45 ? 'D' : 'F',
    color: s >= 75 ? GREEN : s >= 60 ? WARN : CRITICAL };
}
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function isApplianceSystem(system?: string): boolean {
  if (!system) return false;
  return APPLIANCE_SYSTEMS.some(s => system.toLowerCase().includes(s));
}
function compressPhoto(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = url;
  });
}

// ─── Seeding ─────────────────────────────────────────────────────────────────
async function seedIfEmpty(shareId: string, anomalies: Anomaly[], specs: Spec[]) {
  const [existProj, existRem] = await Promise.all([
    supaGet<{id:string}>(`home_projects?share_id=eq.${encodeURIComponent(shareId)}&select=id&limit=1`),
    supaGet<{id:string}>(`home_reminders?share_id=eq.${encodeURIComponent(shareId)}&select=id&limit=1`),
  ]);

  if (existProj.length === 0 && anomalies.length > 0) {
    const projects = anomalies.map(a => ({
      share_id: shareId,
      title: (a.description ?? 'Inspection Finding').substring(0, 100),
      system: a.unit,
      priority: a.severity === 'critical' ? 'critical' : a.severity === 'anomaly' ? 'high' : 'low',
      status: 'identified',
      description: a.description,
      recommendation: a.recommendation,
      budget_estimate: a.estimatedCost,
      contractor_type: a.prosToCall,
      photos: [],
      seeded: true,
    }));
    await supaPost('home_projects', projects);
  }

  if (existRem.length === 0) {
    const reminders: object[] = [];
    anomalies.forEach(a => {
      const days = a.severity === 'critical' ? 7 : a.severity === 'anomaly' ? 30 : 90;
      reminders.push({
        share_id: shareId,
        title: `Address: ${(a.description ?? 'finding').substring(0, 80)}`,
        system: a.unit,
        due_date: addDays(days),
        recurrence: a.severity === 'cosmetic' ? '90d' : null,
        completed: false,
        seeded: true,
      });
    });
    // Spec-based reminders
    specs.forEach(s => {
      const cat = (s.category ?? '').toLowerCase();
      if (cat.includes('hvac') || cat.includes('air')) {
        reminders.push({ share_id: shareId, title: 'Replace HVAC filter', system: 'HVAC', due_date: addDays(30), recurrence: '90d', completed: false, seeded: true });
      }
      if (cat.includes('water heater')) {
        reminders.push({ share_id: shareId, title: 'Flush water heater sediment', system: 'WATER HEATER', due_date: addDays(180), recurrence: '365d', completed: false, seeded: true });
      }
    });
    if (reminders.length > 0) await supaPost('home_reminders', reminders);
  }
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────
function ScoreRing({ score, grade, color, size = 80 }: { score: number; grade: string; color: string; size?: number }) {
  const r = size * 0.375; const circ = +(2 * Math.PI * r).toFixed(1);
  const dashOff = +((1 - score / 100) * circ).toFixed(1);
  const cx = size / 2; const cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={BORDER} strokeWidth={size * 0.1} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.1}
        strokeDasharray={circ} strokeDashoffset={dashOff}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.24} fontWeight="900"
        fill={color} fontFamily="Inter,system-ui,sans-serif">{score}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={size * 0.13} fontWeight="900"
        fill={color} fontFamily="Inter,system-ui,sans-serif" letterSpacing="2">{grade}</text>
    </svg>
  );
}

// ─── FindingCard ──────────────────────────────────────────────────────────────
function FindingCard({ a }: { a: Anomaly }) {
  const sev = a.severity ?? 'cosmetic';
  const color = SEV_COLOR[sev] ?? MED;
  const [expanded, setExpanded] = useState(false);
  const hasExtra = !!(a.recommendation || a.estimatedCost || a.prosToCall);
  return (
    <div onClick={() => hasExtra && setExpanded(e => !e)} style={{
      background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${color}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: hasExtra ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ background: `${color}18`, color, fontSize: 7, fontWeight: 900, letterSpacing: 1,
          padding: '3px 8px', borderRadius: 99, border: `1px solid ${color}44`, whiteSpace: 'nowrap',
          fontFamily: 'Roboto Mono, monospace' }}>{SEV_LABEL[sev] ?? sev.toUpperCase()}</span>
        <span style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 800, flex: 1, minWidth: 0 }}>
          {(a.unit ?? 'COMPONENT').toUpperCase()}</span>
        {a.location && <span style={{ color: DIM, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{a.location}</span>}
      </div>
      <p style={{ color: TEXT, fontSize: 12, lineHeight: 1.65, margin: 0 }}>{a.description ?? ''}</p>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          {a.recommendation && <p style={{ color: MED, fontSize: 11, lineHeight: 1.6, marginBottom: 6 }}>{a.recommendation}</p>}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {a.estimatedCost && a.estimatedCost !== 'N/A' && <span style={{ color: WARN, fontSize: 9, fontWeight: 900 }}>EST. {a.estimatedCost}</span>}
            {a.prosToCall && a.prosToCall !== 'N/A' && <span style={{ color: ACCENT, fontSize: 9, fontWeight: 700 }}>{a.prosToCall}</span>}
          </div>
        </div>
      )}
      {hasExtra && !expanded && <div style={{ marginTop: 6, color: DIM, fontSize: 9, fontWeight: 700 }}>TAP FOR DETAILS</div>}
    </div>
  );
}

// ─── ProjectCard ──────────────────────────────────────────────────────────────
function ProjectCard({ p, onUpdate, shareId, address }: { p: Project; onUpdate: () => void; shareId: string; address?: string }) {
  const [saving, setSaving] = useState(false);
  const [showAppliance, setShowAppliance] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sc = STATUS_COLOR[p.status] ?? DIM;
  const pc = p.priority === 'critical' ? CRITICAL : p.priority === 'high' ? WARN : p.priority === 'low' ? GREEN : ACCENT;

  const advance = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (p.status === 'resolved') return;
    setSaving(true);
    await supaPatch('home_projects', `id=eq.${p.id}`, { status: STATUS_NEXT[p.status] });
    onUpdate(); setSaving(false);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setSaving(true);
    const b64 = await compressPhoto(file);
    const photos = [...(p.photos ?? []), b64];
    await supaPatch('home_projects', `id=eq.${p.id}`, { photos });
    onUpdate(); setSaving(false);
  };

  return (
    <>
      <div onClick={() => setExpanded(v => !v)} style={{
        background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${sc}`,
        borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ background: `${sc}18`, color: sc, fontSize: 7, fontWeight: 900, letterSpacing: 1,
                padding: '2px 7px', borderRadius: 99, border: `1px solid ${sc}44`, fontFamily: 'Roboto Mono, monospace',
                whiteSpace: 'nowrap' }}>{STATUS_LABEL[p.status] ?? p.status.toUpperCase()}</span>
              {p.system && <span style={{ color: DIM, fontSize: 8, fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>{p.system.toUpperCase()}</span>}
            </div>
            <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{p.title}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {p.budget_estimate && p.budget_estimate !== 'N/A' && (
              <div style={{ color: WARN, fontSize: 9, fontWeight: 900 }}>{p.budget_estimate}</div>
            )}
            <div style={{ color: pc, fontSize: 7, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', marginTop: 2 }}>
              {(p.priority ?? 'medium').toUpperCase()}
            </div>
          </div>
        </div>

        {expanded && (
          <div onClick={e => e.stopPropagation()} style={{ paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
            {p.recommendation && <p style={{ color: MED, fontSize: 11, lineHeight: 1.6, marginBottom: 10 }}>{p.recommendation}</p>}
            {p.contractor_type && p.contractor_type !== 'N/A' && (
              <div style={{ color: ACCENT, fontSize: 9, fontWeight: 700, marginBottom: 10, fontFamily: 'Roboto Mono, monospace' }}>
                CONTRACTOR: {p.contractor_type}
              </div>
            )}

            {/* Photo thumbnails */}
            {p.photos?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {p.photos.map((ph, i) => (
                  <img key={i} src={ph} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
                ))}
              </div>
            )}

            {/* Appliance info badge */}
            {p.appliance_info?.model && (
              <div style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}30`, borderRadius: 8,
                padding: '8px 12px', marginBottom: 10, fontSize: 10, color: GREEN }}>
                ✓ {p.appliance_info.brand} {p.appliance_info.model}
                {p.appliance_info.serial && ` · S/N ${p.appliance_info.serial}`}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.status !== 'resolved' && (
                <button onClick={advance} disabled={saving} style={{
                  background: `${sc}15`, border: `1px solid ${sc}44`, color: sc,
                  borderRadius: 8, padding: '7px 14px', fontSize: 9, fontWeight: 900,
                  letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
                }}>
                  {saving ? '...' : `MARK ${STATUS_LABEL[STATUS_NEXT[p.status]] ?? 'DONE'}`}
                </button>
              )}
              <button onClick={() => fileRef.current?.click()} style={{
                background: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, color: ACCENT,
                borderRadius: 8, padding: '7px 14px', fontSize: 9, fontWeight: 900,
                letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
              }}>ADD PHOTO</button>
              {isApplianceSystem(p.system) && (
                <button onClick={() => setShowAppliance(true)} style={{
                  background: `${PURPLE}10`, border: `1px solid ${PURPLE}30`, color: PURPLE,
                  borderRadius: 8, padding: '7px 14px', fontSize: 9, fontWeight: 900,
                  letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
                }}>REPLACE APPLIANCE</button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              onChange={handlePhoto} style={{ display: 'none' }} />
          </div>
        )}
        {!expanded && <div style={{ marginTop: 4, color: DIM, fontSize: 9, fontWeight: 700 }}>TAP FOR ACTIONS</div>}
      </div>

      {showAppliance && (
        <ApplianceModal
          project={p}
          shareId={shareId}
          address={address}
          onClose={() => setShowAppliance(false)}
          onSave={onUpdate}
        />
      )}
    </>
  );
}

// ─── ApplianceModal ───────────────────────────────────────────────────────────
function ApplianceModal({ project, shareId, address, onClose, onSave }: {
  project: Project; shareId: string; address?: string;
  onClose: () => void; onSave: () => void;
}) {
  const [geoStatus, setGeoStatus] = useState<'checking' | 'at-property' | 'off-site' | 'unavailable'>('checking');
  const [geoDistance, setGeoDistance] = useState<number | null>(null);
  const [brand, setBrand] = useState(project.appliance_info?.brand ?? '');
  const [model, setModel] = useState(project.appliance_info?.model ?? '');
  const [serial, setSerial] = useState(project.appliance_info?.serial ?? '');
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!navigator.geolocation) { setGeoStatus('unavailable'); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: uLat, longitude: uLng } = pos.coords;
      let pLat: number | null = null, pLng: number | null = null;
      if (address) {
        try {
          const r = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
          const d = await r.json();
          pLat = d.lat; pLng = d.lng;
        } catch { /* ignore */ }
      }
      if (pLat && pLng) {
        const dist = haversineM(uLat, uLng, pLat, pLng);
        setGeoDistance(Math.round(dist));
        setGeoStatus(dist <= 150 ? 'at-property' : 'off-site');
      } else {
        setGeoStatus('unavailable');
      }
    }, () => setGeoStatus('unavailable'));
  }, [address]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const b64 = await compressPhoto(file);
    setPhoto(b64);
    // Try BarcodeDetector
    if ('BarcodeDetector' in window) {
      try {
        const img = new Image(); img.src = b64;
        await new Promise(r => { img.onload = r; });
        // @ts-ignore
        const detector = new BarcodeDetector();
        const codes = await detector.detect(img);
        if (codes.length > 0) setSerial(codes[0].rawValue);
      } catch { /* not supported */ }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    let photos = project.photos ?? [];
    if (photo) photos = [...photos, photo];
    const appliance_info = { brand, model, serial, scanned_at: new Date().toISOString() };
    await supaPatch('home_projects', `id=eq.${project.id}`, { appliance_info, photos });
    if (project.status !== 'resolved') {
      await supaPatch('home_projects', `id=eq.${project.id}`, { status: 'resolved' });
    }
    onSave(); onClose();
  };

  const geoColor = geoStatus === 'at-property' ? GREEN : geoStatus === 'off-site' ? WARN : DIM;
  const geoLabel = geoStatus === 'checking' ? 'LOCATING...' : geoStatus === 'at-property'
    ? `AT PROPERTY · ${geoDistance}m` : geoStatus === 'off-site'
    ? `OFF-SITE · ${geoDistance}m away` : 'LOCATION UNAVAILABLE';

  const inputStyle = {
    width: '100%', background: '#111', border: `1px solid ${BORDER}`,
    borderRadius: 8, padding: '10px 12px', color: '#e2e8f0',
    fontSize: 12, outline: 'none', fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0d0d0d', border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0',
        padding: 24, width: '100%', maxWidth: 430, maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ color: PURPLE, fontSize: 9, fontWeight: 900, letterSpacing: 3,
          fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>REPLACE APPLIANCE</div>
        <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 900, marginBottom: 16 }}>
          {project.system ?? project.title}
        </div>

        {/* Geo indicator */}
        <div style={{ background: `${geoColor}10`, border: `1px solid ${geoColor}30`,
          borderRadius: 8, padding: '8px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: geoColor, fontSize: 8, fontWeight: 900, letterSpacing: 1,
            fontFamily: 'Roboto Mono, monospace' }}>{geoLabel}</span>
        </div>

        {/* Photo capture */}
        <button onClick={() => fileRef.current?.click()} style={{
          width: '100%', background: photo ? `${GREEN}10` : `${ACCENT}10`,
          border: `1px solid ${photo ? GREEN : ACCENT}33`,
          color: photo ? GREEN : ACCENT, borderRadius: 10, padding: '12px',
          fontSize: 10, fontWeight: 900, letterSpacing: 1, cursor: 'pointer',
          fontFamily: 'Roboto Mono, monospace', marginBottom: 16,
        }}>
          {photo ? '✓ PHOTO CAPTURED — TAP TO RETAKE' : '📷 TAKE PHOTO OF ID TAG'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment"
          onChange={handlePhoto} style={{ display: 'none' }} />
        {photo && <img src={photo} alt="ID tag" style={{ width: '100%', borderRadius: 10,
          marginBottom: 16, border: `1px solid ${BORDER}` }} />}

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <div>
            <div style={{ color: DIM, fontSize: 8, fontWeight: 900, letterSpacing: 1.5,
              fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>BRAND</div>
            <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Carrier"
              style={inputStyle} />
          </div>
          <div>
            <div style={{ color: DIM, fontSize: 8, fontWeight: 900, letterSpacing: 1.5,
              fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>MODEL</div>
            <input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. 24ACC636A003"
              style={inputStyle} />
          </div>
          <div>
            <div style={{ color: DIM, fontSize: 8, fontWeight: 900, letterSpacing: 1.5,
              fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>SERIAL{serial && ' (SCANNED)'}</div>
            <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="e.g. 1234A567890"
              style={{ ...inputStyle, borderColor: serial ? GREEN : BORDER }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, background: 'none', border: `1px solid ${BORDER}`, color: MED,
            borderRadius: 10, padding: 12, fontSize: 10, fontWeight: 900, cursor: 'pointer',
            fontFamily: 'Roboto Mono, monospace',
          }}>CANCEL</button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 2, background: `${PURPLE}20`, border: `1px solid ${PURPLE}44`, color: PURPLE,
            borderRadius: 10, padding: 12, fontSize: 10, fontWeight: 900, cursor: 'pointer',
            fontFamily: 'Roboto Mono, monospace',
          }}>{saving ? 'SAVING...' : 'SAVE REPLACEMENT'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── ReminderCard ─────────────────────────────────────────────────────────────
function ReminderCard({ r, onUpdate }: { r: Reminder; onUpdate: () => void }) {
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const overdue = r.due_date && r.due_date < today;
  const soon = r.due_date && r.due_date <= addDays(7) && !overdue;
  const dotColor = r.completed ? GREEN : overdue ? CRITICAL : soon ? WARN : ACCENT;

  const complete = async (e: React.MouseEvent) => {
    e.stopPropagation(); setSaving(true);
    let update: object = { completed: true };
    if (r.recurrence) {
      const days = parseInt(r.recurrence);
      update = { completed: false, due_date: addDays(days) };
    }
    await supaPatch('home_reminders', `id=eq.${r.id}`, update);
    onUpdate(); setSaving(false);
  };
  const snooze = async (e: React.MouseEvent) => {
    e.stopPropagation(); setSaving(true);
    await supaPatch('home_reminders', `id=eq.${r.id}`, { snoozed_until: addDays(7), due_date: addDays(7) });
    onUpdate(); setSaving(false);
  };

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 8,
      opacity: r.completed ? 0.45 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor,
          flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: r.completed ? MED : '#e2e8f0', fontSize: 12, fontWeight: 700,
            lineHeight: 1.4, textDecoration: r.completed ? 'line-through' : 'none',
            marginBottom: 4 }}>{r.title}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {r.system && <span style={{ color: DIM, fontSize: 8, fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>{r.system.toUpperCase()}</span>}
            {r.due_date && (
              <span style={{ color: dotColor, fontSize: 8, fontWeight: 900, fontFamily: 'Roboto Mono, monospace' }}>
                {overdue ? 'OVERDUE · ' : soon ? 'SOON · ' : ''}{fmtDate(r.due_date)}
              </span>
            )}
            {r.recurrence && <span style={{ color: DIM, fontSize: 7, fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>↻ RECURRING</span>}
          </div>
        </div>
      </div>
      {!r.completed && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={complete} disabled={saving} style={{
            background: `${GREEN}10`, border: `1px solid ${GREEN}30`, color: GREEN,
            borderRadius: 8, padding: '6px 14px', fontSize: 9, fontWeight: 900,
            letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
          }}>{saving ? '...' : r.recurrence ? 'DONE (RESET)' : 'COMPLETE'}</button>
          <button onClick={snooze} disabled={saving} style={{
            background: `${WARN}10`, border: `1px solid ${WARN}30`, color: WARN,
            borderRadius: 8, padding: '6px 14px', fontSize: 9, fontWeight: 900,
            letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
          }}>SNOOZE 7D</button>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  const bar = (w: string, h = 10, mb = 8) => (
    <div style={{ width: w, height: h, background: '#111', borderRadius: 6, marginBottom: mb,
      animation: 'pulse 1.5s ease-in-out infinite' }} />
  );
  return (
    <div style={{ padding: '24px 16px' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
      {bar('60%', 14, 12)}{bar('40%', 10, 24)}{bar('100%', 80, 12)}{bar('100%', 80, 12)}{bar('100%', 80)}
    </div>
  );
}

// ─── NotFound ─────────────────────────────────────────────────────────────────
function NotFound() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 40, textAlign: 'center', gap: 16 }}>
      <div style={{ color: DIM, fontSize: 32 }}>◈</div>
      <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace' }}>RECORD NOT FOUND</div>
      <p style={{ color: MED, fontSize: 12, lineHeight: 1.7, maxWidth: 280 }}>
        This Home Record may not be activated yet. Contact your inspector to publish this report.
      </p>
    </div>
  );
}

// ─── StatBox ──────────────────────────────────────────────────────────────────
function StatBox({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ color, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 7, fontWeight: 900, letterSpacing: 1.5, marginTop: 4, fontFamily: 'Roboto Mono, monospace' }}>{label}</div>
    </div>
  );
}

// ─── TabBar ───────────────────────────────────────────────────────────────────
function TabBar({ active, onChange, counts }: {
  active: Tab; onChange: (t: Tab) => void;
  counts: { projects: number; reminders: number; findings: number };
}) {
  const tabs: [Tab, string, string][] = [
    ['home', '⌂', 'HOME'],
    ['findings', '◈', `FINDINGS`],
    ['projects', '⚒', `PROJECTS`],
    ['reminders', '⏰', `REMINDERS`],
    ['docs', '☰', 'DOCS'],
  ];
  const badge = (t: Tab) => {
    if (t === 'findings') return counts.findings;
    if (t === 'projects') return counts.projects;
    if (t === 'reminders') return counts.reminders;
    return 0;
  };
  return (
    <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430, background: 'rgba(8,8,8,0.97)', borderTop: `1px solid ${BORDER}`,
      display: 'flex', zIndex: 100, backdropFilter: 'blur(12px)', paddingBottom: 'env(safe-area-inset-bottom,0)',
    }}>
      {tabs.map(([key, icon, label]) => {
        const isActive = active === key;
        const b = badge(key);
        return (
          <button key={key} onClick={() => onChange(key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '10px 4px 8px',
            background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
          }}>
            {b > 0 && (
              <div style={{ position: 'absolute', top: 6, right: '22%', background: CRITICAL,
                borderRadius: 99, minWidth: 14, height: 14, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#fff', padding: '0 3px' }}>{b}</div>
            )}
            <div style={{ fontSize: 16, lineHeight: 1, color: isActive ? ACCENT : DIM, marginBottom: 3 }}>{icon}</div>
            <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.5,
              color: isActive ? ACCENT : DIM, fontFamily: 'Roboto Mono, monospace' }}>{label}</div>
            {isActive && (
              <div style={{ position: 'absolute', top: 0, left: '25%', right: '25%',
                height: 2, background: ACCENT, borderRadius: '0 0 2px 2px' }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── NavBar ───────────────────────────────────────────────────────────────────
function NavBar({ address, onShare, copied }: { address: string; onShare: () => void; copied: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px', borderBottom: `1px solid #111`, background: 'rgba(8,8,8,0.97)',
      position: 'sticky', top: 0, zIndex: 90, backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)', maxWidth: 430, width: '100%', boxSizing: 'border-box',
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: -0.5 }}>
          <span style={{ color: ACCENT }}>L·</span><span style={{ color: '#fff' }}>X</span>
        </div>
        <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 2, color: DIM, marginTop: 1, fontFamily: 'Roboto Mono, monospace' }}>HOME RECORD</div>
      </div>
      <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
        {address && (
          <div style={{ color: '#aaa', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {address}
          </div>
        )}
      </div>
      <button onClick={onShare} style={{
        background: copied ? `${GREEN}20` : `${ACCENT}15`, border: `1px solid ${copied ? GREEN + '44' : ACCENT + '33'}`,
        color: copied ? GREEN : ACCENT, borderRadius: 8, padding: '7px 12px',
        fontSize: 9, fontWeight: 900, letterSpacing: 1, cursor: 'pointer',
        fontFamily: 'Roboto Mono, monospace', flexShrink: 0,
      }}>{copied ? 'COPIED' : 'SHARE'}</button>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <div style={{ padding: '20px 16px 100px', textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ color: ACCENT, fontSize: 14, fontWeight: 900, letterSpacing: -0.5, marginBottom: 4 }}>L·X</div>
      <div style={{ color: DIM, fontSize: 8, fontWeight: 700, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>LEDRIX SPATIAL OS</div>
      <a href="https://ledrixlabs.com" style={{ color: MED, fontSize: 10, fontWeight: 600, textDecoration: 'none' }}>ledrixlabs.com</a>
    </div>
  );
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
function HomeTab({ record, anomalies, projects, reminders, onTabChange }: {
  record: HomeRecord; anomalies: Anomaly[];
  projects: Project[]; reminders: Reminder[];
  onTabChange: (t: Tab) => void;
}) {
  const { score, grade, color: scoreColor } = scoreCalc(anomalies);
  const subAddress = [record.city, record.state, record.zip].filter(Boolean).join(', ');
  const critical = anomalies.filter(a => a.severity === 'critical');
  const deficien = anomalies.filter(a => a.severity === 'anomaly');
  const cosmetic = anomalies.filter(a => a.severity !== 'critical' && a.severity !== 'anomaly');
  const openProjects = projects.filter(p => p.status !== 'resolved');
  const dueReminders = reminders.filter(r => !r.completed);

  const pillars: [Tab, string, string, string, number | string][] = [
    ['findings', '◈', 'FINDINGS', anomalies.length > 0 ? CRITICAL : GREEN, anomalies.length],
    ['projects', '⚒', 'PROJECTS', openProjects.length > 0 ? WARN : GREEN, `${projects.filter(p=>p.status==='resolved').length}/${projects.length}`],
    ['reminders', '⏰', 'REMINDERS', dueReminders.length > 0 ? ACCENT : GREEN, dueReminders.length],
    ['docs', '☰', 'DOCS', DIM, '—'],
  ];

  return (
    <div>
      {/* Hero card */}
      <div style={{ margin: '16px 16px 0', borderRadius: 20, overflow: 'hidden',
        border: `1px solid #161616`, position: 'relative', height: 200,
        background: 'linear-gradient(135deg,#0a1520 0%,#080e18 50%,#060c14 100%)',
      }}>
        <div style={{ position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(0,243,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,243,255,0.04) 1px,transparent 1px)',
          backgroundSize: '28px 28px' }} />
        <div style={{ position: 'absolute', top: 14, right: 14 }}>
          <ScoreRing score={score} grade={grade} color={scoreColor} />
          <div style={{ textAlign: 'center', color: DIM, fontSize: 7, fontWeight: 900, letterSpacing: 2, marginTop: 2, fontFamily: 'Roboto Mono, monospace' }}>L-INDEX</div>
        </div>
        <div style={{ position: 'absolute', inset: 0, padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ color: ACCENT, fontSize: 7, fontWeight: 700, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 6 }}>
            LEDRIX HOME RECORD · VERIFIED
          </div>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, lineHeight: 1.2, letterSpacing: -0.5, maxWidth: '70%' }}>
            {record.address ?? 'ADDRESS PENDING'}
          </div>
          {subAddress && <div style={{ color: MED, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, marginTop: 4, fontFamily: 'Roboto Mono, monospace' }}>{subAddress}</div>}
          <div style={{ color: DIM, fontSize: 8, fontWeight: 700, letterSpacing: 1, marginTop: 8, fontFamily: 'Roboto Mono, monospace' }}>
            INSPECTED {fmtDate(record.inspection_date).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
        <StatBox value={critical.length}  label="SAFETY"   color={critical.length  > 0 ? CRITICAL : DIM} />
        <StatBox value={deficien.length}  label="DEFICIEN." color={deficien.length  > 0 ? WARN    : DIM} />
        <StatBox value={cosmetic.length}  label="MAINT."   color={cosmetic.length  > 0 ? ACCENT  : DIM} />
        <StatBox value={anomalies.length} label="TOTAL"    color={TEXT} />
      </div>

      {/* Priority rail */}
      {critical.concat(deficien).slice(0, 3).length > 0 && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ color: CRITICAL, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>
            PRIORITY ATTENTION
          </div>
          {critical.concat(deficien).slice(0, 3).map((a, i) => (
            <div key={i} onClick={() => onTabChange('findings')} style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${SEV_COLOR[a.severity ?? 'cosmetic'] ?? DIM}`,
              borderRadius: 10, padding: '10px 14px', marginBottom: 6, cursor: 'pointer',
            }}>
              <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 700 }}>{a.unit?.toUpperCase() ?? 'COMPONENT'}</div>
              <div style={{ color: MED, fontSize: 10, lineHeight: 1.5, marginTop: 2 }}>{(a.description ?? '').substring(0, 80)}{(a.description?.length ?? 0) > 80 ? '…' : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pillar grid */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ color: DIM, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 10 }}>
          YOUR HOME APP
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {pillars.map(([tab, icon, label, color, count]) => (
            <button key={tab} onClick={() => onTabChange(tab)} style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
              padding: '18px 16px', textAlign: 'left', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
              <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 900, marginBottom: 4 }}>{label}</div>
              <div style={{ color, fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{count}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Property Passport banner */}
      <div style={{ margin: '0 16px 16px', background: `${ACCENT}08`, border: `1px solid ${ACCENT}22`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ color: ACCENT, fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>◈</div>
          <div>
            <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>PROPERTY PASSPORT · HOME FAX</div>
            <p style={{ color: TEXT, fontSize: 11, lineHeight: 1.65 }}>
              This record is permanently linked to this property and transfers to every future owner — building a verified history that protects buyers and sellers alike.
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// ─── FINDINGS TAB ─────────────────────────────────────────────────────────────
function FindingsTab({ anomalies }: { anomalies: Anomaly[] }) {
  const [filter, setFilter] = useState<'all' | 'critical' | 'anomaly' | 'cosmetic'>('all');
  const [search, setSearch] = useState('');
  const [specsOpen, setSpecsOpen] = useState(false);

  const critical = anomalies.filter(a => a.severity === 'critical');
  const deficien = anomalies.filter(a => a.severity === 'anomaly');
  const cosmetic = anomalies.filter(a => a.severity !== 'critical' && a.severity !== 'anomaly');

  const filtered = anomalies.filter(a => {
    if (filter !== 'all' && a.severity !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (a.unit ?? '').toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q) || (a.location ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 14 }}>FINDINGS</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {([['all','All',anomalies.length,TEXT],['critical','Safety',critical.length,CRITICAL],['anomaly','Deficiency',deficien.length,WARN],['cosmetic','Maint.',cosmetic.length,ACCENT]] as [typeof filter,string,number,string][]).map(([key,label,count,c]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            background: filter === key ? `${c}20` : CARD, border: `1px solid ${filter === key ? c+'55' : BORDER}`,
            color: filter === key ? c : DIM, borderRadius: 99, padding: '6px 14px', fontSize: 9,
            fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}</button>
        ))}
      </div>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 12 }}>⌕</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search findings…" style={{
          width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
          padding: '10px 12px 10px 30px', color: '#e2e8f0', fontSize: 12, outline: 'none',
          fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
        }} />
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: DIM }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: filter === 'all' ? GREEN : DIM, fontFamily: 'Roboto Mono, monospace' }}>
            {filter === 'all' ? 'NO FINDINGS LOGGED' : `NO ${filter.toUpperCase()} FINDINGS`}
          </div>
        </div>
      ) : filtered.map((a, i) => <FindingCard key={i} a={a} />)}
    </div>
  );
}

// ─── PROJECTS TAB ─────────────────────────────────────────────────────────────
function ProjectsTab({ projects, shareId, address, onRefresh }: { projects: Project[]; shareId: string; address?: string; onRefresh: () => void }) {
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const open   = projects.filter(p => p.status !== 'resolved');
  const shown  = statusFilter === 'open' ? open : projects;
  const resolved = projects.filter(p => p.status === 'resolved').length;

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace' }}>PROJECTS</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['open','all'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{
              background: statusFilter === f ? `${ACCENT}15` : CARD, border: `1px solid ${statusFilter === f ? ACCENT+'44' : BORDER}`,
              color: statusFilter === f ? ACCENT : DIM, borderRadius: 8, padding: '5px 12px',
              fontSize: 8, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace',
            }}>{f.toUpperCase()}</button>
          ))}
        </div>
      </div>
      {resolved > 0 && (
        <div style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}20`, borderRadius: 10,
          padding: '8px 14px', marginBottom: 12, color: GREEN, fontSize: 9, fontWeight: 900,
          fontFamily: 'Roboto Mono, monospace' }}>
          ✓ {resolved} PROJECT{resolved > 1 ? 'S' : ''} RESOLVED
        </div>
      )}
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: DIM }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: GREEN, fontFamily: 'Roboto Mono, monospace' }}>ALL PROJECTS RESOLVED</div>
        </div>
      ) : shown.map(p => <ProjectCard key={p.id} p={p} shareId={shareId} address={address} onUpdate={onRefresh} />)}
    </div>
  );
}

// ─── REMINDERS TAB ───────────────────────────────────────────────────────────
function RemindersTab({ reminders, onRefresh }: { reminders: Reminder[]; onRefresh: () => void }) {
  const [showCompleted, setShowCompleted] = useState(false);
  const pending   = reminders.filter(r => !r.completed);
  const completed = reminders.filter(r => r.completed);
  const shown     = showCompleted ? reminders : pending;

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace' }}>REMINDERS</div>
        {completed.length > 0 && (
          <button onClick={() => setShowCompleted(v => !v)} style={{
            background: 'none', border: `1px solid ${BORDER}`, color: DIM, borderRadius: 8,
            padding: '5px 12px', fontSize: 8, fontWeight: 900, letterSpacing: 1, cursor: 'pointer',
            fontFamily: 'Roboto Mono, monospace',
          }}>{showCompleted ? 'HIDE DONE' : `+${completed.length} DONE`}</button>
        )}
      </div>
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: DIM }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: GREEN, fontFamily: 'Roboto Mono, monospace' }}>ALL CAUGHT UP</div>
        </div>
      ) : shown.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1;
      }).map(r => <ReminderCard key={r.id} r={r} onUpdate={onRefresh} />)}
    </div>
  );
}

// ─── DOCS TAB ─────────────────────────────────────────────────────────────────
function DocsTab({ record, specs }: { record: HomeRecord; specs: Spec[] }) {
  const [specsOpen, setSpecsOpen] = useState(false);
  const confirmedSpecs = specs.filter(s => s.status === 'confirmed');
  const subAddress = [record.city, record.state, record.zip].filter(Boolean).join(', ');

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 14 }}>DOCS</div>

      {/* PDF notice */}
      <div style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}22`, borderRadius: 14,
        padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 6 }}>
          INSPECTION REPORT PDF
        </div>
        <p style={{ color: TEXT, fontSize: 11, lineHeight: 1.65, marginBottom: 12 }}>
          Your full inspection report is a permanent legal document available in the Ledrix Inspector app.
          It will never change after it is generated — it is your immutable record of this property&apos;s condition at the time of inspection.
        </p>
        <div style={{ color: DIM, fontSize: 9, fontFamily: 'Roboto Mono, monospace', fontWeight: 700 }}>
          REQUEST A COPY FROM YOUR INSPECTOR
        </div>
      </div>

      {/* Inspection record */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 12 }}>
          INSPECTION RECORD
        </div>
        {([
          ['ADDRESS', record.address],
          ['CITY/STATE/ZIP', subAddress || null],
          ['YEAR BUILT', record.year_built],
          ['SQ FT', record.sqft],
          ['BEDS', record.beds],
          ['BATHS', record.baths],
          ['GARAGE', record.garage],
          ['INSPECTION TYPE', record.inspection_type],
          ['INSPECTION DATE', fmtDate(record.inspection_date)],
        ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0',
            borderBottom: `1px solid ${BORDER}22` }}>
            <span style={{ color: DIM, fontSize: 9, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace' }}>{label}</span>
            <span style={{ color: TEXT, fontSize: 11, fontWeight: 700, textAlign: 'right', maxWidth: '55%' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Inspector */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 10 }}>INSPECTOR</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 900, marginBottom: 3 }}>{record.inspector ?? '—'}</div>
            {record.company && <div style={{ color: MED, fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{record.company}</div>}
            {record.license_number && <div style={{ color: DIM, fontSize: 9, fontFamily: 'Roboto Mono, monospace' }}>LIC #{record.license_number}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: DIM, fontSize: 8, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>
              {record.inspection_type?.toUpperCase() ?? 'HOME INSPECTION'}
            </div>
            <div style={{ color: TEXT, fontSize: 11, fontWeight: 700 }}>{fmtDate(record.inspection_date)}</div>
          </div>
        </div>
      </div>

      {/* Material specs */}
      {confirmedSpecs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setSpecsOpen(o => !o)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 14px',
            borderBottom: `1px solid ${BORDER}`,
          }}>
            <span style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace' }}>MATERIAL SPECS</span>
            <span style={{ color: DIM, fontSize: 14 }}>{specsOpen ? '−' : '+'}</span>
          </button>
          {specsOpen && (
            <div style={{ paddingTop: 14 }}>
              {confirmedSpecs.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: `1px solid ${BORDER}22` }}>
                  <span style={{ color: DIM, fontSize: 9, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace' }}>{(s.category ?? '').toUpperCase()}</span>
                  <span style={{ color: TEXT, fontSize: 11, fontWeight: 700, textAlign: 'right', maxWidth: '60%' }}>{s.material ?? '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ padding: '12px 16px', background: `${WARN}08`, border: `1px solid ${WARN}22`, borderRadius: 10, marginBottom: 8 }}>
        <p style={{ color: MED, fontSize: 9, lineHeight: 1.7, fontFamily: 'Roboto Mono, monospace' }}>
          ⚠ This report reflects conditions at the time of inspection. It does not constitute a warranty or guarantee.
          Consult licensed professionals for all repair decisions.
        </p>
      </div>

      <Footer />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SharePage() {
  const params  = useParams();
  const shareId = params?.id as string;

  const [record,    setRecord]    = useState<HomeRecord | null>(null);
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [tab,       setTab]       = useState<Tab>('home');
  const [copied,    setCopied]    = useState(false);
  const seeded = useRef(false);

  const loadProjects = useCallback(async () => {
    if (!shareId) return;
    const data = await supaGet<Project>(`home_projects?share_id=eq.${encodeURIComponent(shareId)}&order=created_at.asc`);
    setProjects(data);
  }, [shareId]);

  const loadReminders = useCallback(async () => {
    if (!shareId) return;
    const data = await supaGet<Reminder>(`home_reminders?share_id=eq.${encodeURIComponent(shareId)}&order=due_date.asc.nullslast`);
    setReminders(data);
  }, [shareId]);

  useEffect(() => {
    if (!shareId) { setLoading(false); setNotFound(true); return; }
    fetch(`/api/proxy?path=${encodeURIComponent(`home_records?share_id=eq.${encodeURIComponent(shareId)}&limit=1`)}`)
      .then(r => r.json())
      .then(async (data: HomeRecord[]) => {
        if (!Array.isArray(data) || data.length === 0) { setNotFound(true); return; }
        const rec = data[0]; setRecord(rec);
        await Promise.all([loadProjects(), loadReminders()]).catch(() => {});
        if (!seeded.current) {
          seeded.current = true;
          seedIfEmpty(shareId, rec.anomalies ?? [], rec.specs ?? [])
            .then(() => Promise.all([loadProjects(), loadReminders()]).catch(() => {}))
            .catch(() => {});
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [shareId, loadProjects, loadReminders]);

  useEffect(() => {
    if (record?.address) document.title = `${record.address} — Ledrix Home Record`;
  }, [record]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: `${record?.address} — Ledrix Home Record`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true); setTimeout(() => setCopied(false), 2000);
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

  const anomalies = Array.isArray(record.anomalies) ? record.anomalies : [];
  const specs     = Array.isArray(record.specs)     ? record.specs     : [];
  const openProjects  = projects.filter(p => p.status !== 'resolved').length;
  const dueReminders  = reminders.filter(r => !r.completed).length;

  return (
    <div style={{ background: BG, minHeight: '100vh', maxWidth: 430, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif', paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Roboto+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{display:none}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        input::placeholder{color:#222}
        button{-webkit-tap-highlight-color:transparent}
      `}</style>

      <NavBar address={record.address ?? ''} onShare={handleShare} copied={copied} />

      {tab === 'home'      && <HomeTab record={record} anomalies={anomalies} projects={projects} reminders={reminders} onTabChange={setTab} />}
      {tab === 'findings'  && <FindingsTab anomalies={anomalies} />}
      {tab === 'projects'  && <ProjectsTab projects={projects} shareId={shareId} address={record.address} onRefresh={loadProjects} />}
      {tab === 'reminders' && <RemindersTab reminders={reminders} onRefresh={loadReminders} />}
      {tab === 'docs'      && <DocsTab record={record} specs={specs} />}

      <TabBar active={tab} onChange={setTab} counts={{ findings: anomalies.length, projects: openProjects, reminders: dueReminders }} />
    </div>
  );
}
