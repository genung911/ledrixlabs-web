'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { supabase } from '../../../lib/supabaseClient';

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
async function supaDelete(table: string, filter: string) {
  try {
    return await fetch(`/api/proxy?path=${encodeURIComponent(table)}&filter=${encodeURIComponent(filter)}`, {
      method: 'DELETE',
    });
  } catch { return new Response(null, { status: 500 }); }
}

// ─── Design tokens ────────────────────────────────────────────────────────────
// Cyan + dark-glass — matches the Ledrix inspector app's GradientCard aesthetic.
// Cyan is the primary UI accent; color is still reserved for MEANING (severity).
const CYAN     = '#00F3FF';   // brand accent
const ACCENT   = '#00F3FF';   // primary UI accent — cyan (matches the inspector app)
const CRITICAL = '#FF3B3B';   // safety
const WARN     = '#FACC15';   // deficiency
const GREEN    = '#22C55E';   // satisfactory / resolved
const INFO     = '#8893A6';   // calm slate — maintenance + in-progress states
const PURPLE   = INFO;        // legacy alias → muted (no rainbow)
const BG       = '#070707';
// Glassy gradient surfaces (the inspector app's GradientCard look): top-left sheen → dark.
// CARD/CARD2 are only ever used as a CSS `background`, so a gradient string is valid everywhere.
const CARD     = 'linear-gradient(145deg, rgba(42,50,57,0.55), rgba(13,17,20,0.66))';
const CARD2    = 'linear-gradient(145deg, rgba(50,60,67,0.42), rgba(16,20,24,0.60))';
const BORDER   = 'rgba(255,255,255,0.08)';
const DIM      = '#3a4a4e';
const MED      = '#5f7378';
const TEXT     = '#b6c4c7';

// ─── Types ────────────────────────────────────────────────────────────────────
type Anomaly = {
  id?: string; description?: string; severity?: string; unit?: string;
  location?: string; estimatedCost?: string; recommendation?: string; prosToCall?: string;
  imageUri?: string;
};
type Spec = { category?: string; material?: string; status?: string; };
type HomeRecord = {
  id: string; share_id: string; address?: string; city?: string; state?: string;
  zip?: string; year_built?: string; sqft?: string; beds?: string; baths?: string;
  garage?: string; inspector?: string; company?: string; license_number?: string;
  inspection_date?: string; inspection_type?: string; sop_mode?: string;
  anomalies: Anomaly[]; specs: Spec[]; created_at: string; pdf_url?: string; cover_url?: string;
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
// The buyer's Repair Request rows (home_repairs). The buyer owns the wording;
// edited_text overrides the AI generated_text. anomaly_ref ties back to the finding.
type RepairRow = {
  id: string; share_id: string; anomaly_ref?: string;
  item?: string; location?: string; severity?: string; remedy?: string;
  generated_text?: string; edited_text?: string;
  status: string; source_fp?: string; sort_order?: number;
  created_at?: string; updated_at?: string;
};

type Tab = 'home' | 'findings' | 'repairs' | 'projects' | 'reminders' | 'docs' | 'report';

// ─── Constants ────────────────────────────────────────────────────────────────
const APPLIANCE_SYSTEMS = ['hvac', 'heating', 'cooling', 'air conditioning', 'furnace',
  'water heater', 'dishwasher', 'refrigerator', 'washer', 'dryer', 'oven', 'range',
  'stove', 'microwave', 'garbage disposal', 'plumbing', 'electrical panel', 'panel'];

const STATUS_COLOR: Record<string,string> = {
  identified: DIM, quoted: WARN, scheduled: INFO,
  in_progress: INFO, resolved: GREEN,
};
const STATUS_LABEL: Record<string,string> = {
  identified: 'IDENTIFIED', quoted: 'QUOTED', scheduled: 'SCHEDULED',
  in_progress: 'IN PROGRESS', resolved: 'RESOLVED',
};
const STATUS_NEXT: Record<string,string> = {
  identified: 'quoted', quoted: 'scheduled', scheduled: 'in_progress',
  in_progress: 'resolved', resolved: 'resolved',
};
const SEV_COLOR: Record<string,string> = { critical: CRITICAL, anomaly: WARN, cosmetic: INFO };
const SEV_LABEL: Record<string,string> = { critical: 'SAFETY', anomaly: 'DEFICIENCY', cosmetic: 'MAINTENANCE' };

// ── Report tab: derive a SYSTEM from a finding's unit/location/description ──────
// The share payload has unit + severity but no canonical system/component, so the
// system is keyword-derived here (mirrors the PDF report's section grouping).
const REPORT_SYS: [RegExp, string][] = [
  [/roof|shingle|flashing|gutter|chimney|soffit|fascia|downspout/i, 'Roofing'],
  [/attic|insulation/i, 'Attic & Insulation'],
  [/exterior|siding|grade|drainage|deck|porch|driveway|stucco|\bbrick\b|landscap/i, 'Exterior'],
  [/foundation|crawl|basement|slab|structural|framing|footing/i, 'Foundation & Structure'],
  [/hvac|furnace|heat|cool|air.?condition|\bac\b|thermostat|\bduct|condenser|evaporator/i, 'HVAC'],
  [/fireplace|wood stove|\bflue\b/i, 'Fireplace'],
  [/plumb|water heater|drain|supply line|sump|faucet|toilet|\btpr\b|gas line|sewer|septic|p-?trap/i, 'Plumbing'],
  [/electric|panel|outlet|breaker|wiring|gfci|afci|receptacle|fixture|service drop|conductor/i, 'Electrical'],
  [/kitchen|dishwasher|\brange\b|disposal|cooktop|\boven\b/i, 'Kitchen'],
  [/bath|shower|\btub\b|vanity|lavatory/i, 'Bathrooms'],
  [/interior|floor|ceiling|drywall|window|\bdoor\b|stair|\bwall\b|\bpaint\b/i, 'Interior'],
  [/garage/i, 'Garage'],
];
const REPORT_SYS_ORDER = ['Roofing','Attic & Insulation','Exterior','Foundation & Structure','HVAC','Fireplace','Plumbing','Electrical','Kitchen','Bathrooms','Interior','Garage','General'];
const REPORT_ICON: Record<string,string> = {
  'Roofing': '🏠', 'Attic & Insulation': '🧱', 'Exterior': '🏡', 'Foundation & Structure': '🏗️',
  'HVAC': '❄️', 'Fireplace': '🔥', 'Plumbing': '🚰', 'Electrical': '⚡', 'Kitchen': '🍽️',
  'Bathrooms': '🚿', 'Interior': '🛋️', 'Garage': '🚗', 'General': '📋',
};
// Scope statement keyed by the chosen SOP (synced as home_records.sop_mode).
const SOP_SCOPE: Record<string,{ name: string; text: string }> = {
  INTERNACHI: { name: 'the InterNACHI® Standards of Practice', text: 'a visual examination of the readily accessible systems and components of the home' },
  ASHI:       { name: 'the ASHI® Standards of Practice',       text: 'a visual examination of the readily accessible installed systems and components of the home' },
  CUSTOM:     { name: "the inspector's Standards of Practice",  text: 'a visual examination of the systems and components within the agreed scope of work' },
};
function reportSystem(a: Anomaly): string {
  const t = `${a.unit ?? ''} ${a.location ?? ''} ${a.description ?? ''}`;
  for (const [re, name] of REPORT_SYS) if (re.test(t)) return name;
  return 'General';
}
// PRIORITY axis (matches the PDF report). Accepts both current + legacy severity ids.
const PRIO_LABEL: Record<string,string> = { critical: 'IMMEDIATE', deficiency: 'REPAIR', anomaly: 'REPAIR', maintenance: 'MAINTENANCE', cosmetic: 'MAINTENANCE', characteristic: 'NOTE', spec: 'NOTE' };
const PRIO_COLOR: Record<string,string> = { critical: CRITICAL, deficiency: WARN, anomaly: WARN, maintenance: INFO, cosmetic: INFO, characteristic: GREEN, spec: GREEN };
const prioRank = (s?: string): number => (({ critical: 0, deficiency: 1, anomaly: 1, maintenance: 2, cosmetic: 2, characteristic: 3, spec: 4 } as Record<string,number>)[s ?? 'deficiency'] ?? 9);
// SAFETY: orthogonal flag (no defectType in the payload, so derive from severity + keywords).
function isSafetyFinding(a: Anomaly): boolean {
  if (a.severity === 'critical') return true;
  return /gas leak|carbon monoxide|smoke detector|electric|panel|wiring|gfci|exposed|stair|\brail|guard|fall|\bfire\b|active leak|mold|microbial|structural|trip hazard|scald/i.test(`${a.unit ?? ''} ${a.description ?? ''}`);
}

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

// ─── Maintenance reminder seed set ───────────────────────────────────────────
function buildMaintenanceReminders(shareId: string, specs: Spec[]): object[] {
  const rem: object[] = [];
  const mk = (title: string, system: string, days: number, recurrence: string) =>
    ({ share_id: shareId, title, system, due_date: addDays(days), recurrence, completed: false, seeded: true });

  // Universal — every home
  rem.push(mk('Test smoke & CO detectors',               'Safety',    90,  '180d'));
  rem.push(mk('Clean gutters',                            'Exterior',  60,  '180d'));
  rem.push(mk('Clean dryer vent',                         'Laundry',   180, '365d'));
  rem.push(mk('Inspect caulking & weatherstripping',      'Exterior',  180, '365d'));
  rem.push(mk('Test GFCI outlets',                        'Electrical',180, '365d'));
  rem.push(mk('Inspect roof & attic for leaks',           'Roof',      270, '365d'));
  rem.push(mk('Replace HVAC air filter',                  'HVAC',      30,  '90d'));
  rem.push(mk('Schedule HVAC tune-up',                    'HVAC',      180, '365d'));

  // Spec-driven additions
  const cats = specs.map(s => (s.category ?? '').toLowerCase());
  if (cats.some(c => c.includes('water heater'))) {
    rem.push(mk('Flush water heater sediment', 'Water Heater', 180, '365d'));
    rem.push(mk('Check water heater anode rod', 'Water Heater', 365, '730d'));
  }

  return rem;
}

// ─── Seeding ─────────────────────────────────────────────────────────────────
async function seedIfEmpty(shareId: string, anomalies: Anomaly[], specs: Spec[]) {
  const [existProj, existRem] = await Promise.all([
    supaGet<{id:string}>(`home_projects?share_id=eq.${encodeURIComponent(shareId)}&select=id&limit=1`),
    supaGet<{id:string;title:string}>(`home_reminders?share_id=eq.${encodeURIComponent(shareId)}&select=id,title&limit=20`),
  ]);

  // Seed projects from findings (once only)
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

  // Seed maintenance reminders — migrate old finding-style reminders on first load
  const hasOldStyle = existRem.some(r => r.title.startsWith('Address:'));
  if (existRem.length === 0 || hasOldStyle) {
    if (hasOldStyle) {
      await supaDelete('home_reminders', `share_id=eq.${encodeURIComponent(shareId)}&seeded=eq.true`);
    }
    const reminders = buildMaintenanceReminders(shareId, specs);
    if (reminders.length > 0) await supaPost('home_reminders', reminders);
  }
}

// ─── Icon ─────────────────────────────────────────────────────────────────────
// Clean SVG line icons (Lucide-style) matching the inspector app's thin-stroke
// look — replaces the inconsistent unicode/emoji glyphs.
type IconName = 'home' | 'findings' | 'projects' | 'reminders' | 'docs';
function Icon({ name, size = 22, color = TEXT }: { name: IconName; size?: number; color?: string }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
    strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (<svg {...common}><path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10h14V10" /><path d="M9.5 20v-6h5v6" /></svg>);
    case 'findings':
      return (<svg {...common}><path d="M6 3h12l3.5 6L12 21.5 2.5 9z" /><path d="M2.5 9h19M9 3l-3 6 6 12 6-12-3-6" /></svg>);
    case 'projects':
      return (<svg {...common}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>);
    case 'reminders':
      return (<svg {...common}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>);
    case 'docs':
      return (<svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></svg>);
  }
}

// ─── Logo (the Ledrix delta mark — matches the marketing site) ──────────────────
function ValDeltaSVG({ size = 28, color = ACCENT }: { size?: number; color?: string }) {
  const pad = size * 0.10;
  const W   = size - pad * 2;
  const H   = W * (Math.sqrt(3) / 2);
  const ty  = (size - H) / 2;
  const by  = ty + H;
  const TX  = size / 2, TY = ty;
  const BLX = pad,      BLY = by;
  const BRX = pad + W,  BRY = by;
  const GL  = BLX + W * 0.30;
  const GR  = BLX + W * 0.70;
  const d   = `M ${TX} ${TY} L ${BLX} ${BLY} L ${GL} ${BLY} M ${GR} ${BRY} L ${BRX} ${BRY} L ${TX} ${TY}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ display: 'block' }}>
      <path d={d} stroke={color} strokeWidth={size * 0.055} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Logo({ size = 32 }: { size?: number }) {
  const r = Math.round(size * 0.22);
  return (
    <div style={{ width: size, height: size, borderRadius: r, backgroundColor: '#080808',
      border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ValDeltaSVG size={Math.round(size * 0.82)} color={CYAN} />
    </div>
  );
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

// ─── FindingCard → opens the full homeowner card (price · pros · videos · Ask Ledrix) ──
function FindingCard({ a, zip, cityState, shareId }: { a: Anomaly; zip?: string; cityState?: string; shareId: string }) {
  const sev = a.severity ?? 'cosmetic';
  const color = SEV_COLOR[sev] ?? MED;
  const [open, setOpen] = useState(false);
  return (
    <>
      <div onClick={() => setOpen(true)} style={{
        background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${color}`,
        borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ background: `${color}18`, color, fontSize: 7, fontWeight: 900, letterSpacing: 1,
            padding: '3px 8px', borderRadius: 99, border: `1px solid ${color}44`, whiteSpace: 'nowrap',
            fontFamily: 'Roboto Mono, monospace' }}>{SEV_LABEL[sev] ?? sev.toUpperCase()}</span>
          <span style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 800, flex: 1, minWidth: 0 }}>
            {(a.unit ?? 'COMPONENT').toUpperCase()}</span>
          {a.location && <span style={{ color: DIM, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{a.location}</span>}
        </div>
        {a.imageUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.imageUri} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}`, marginBottom: 8 }} />
        )}
        <p style={{ color: TEXT, fontSize: 12, lineHeight: 1.65, margin: 0 }}>{a.description ?? ''}</p>
        <div style={{ marginTop: 6, color: ACCENT, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>TAP TO OPEN →</div>
      </div>
      {open && <FindingDetailModal a={a} zip={zip} cityState={cityState} shareId={shareId} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── FindingDetailModal — the homeowner card ───────────────────────────────────
function CardSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 1.5, marginBottom: 8, fontFamily: 'Roboto Mono, monospace' }}>{label}</div>
      {children}
    </div>
  );
}
function FindingDetailModal({ a, zip, cityState, shareId, onClose }: { a: Anomaly; zip?: string; cityState?: string; shareId: string; onClose: () => void }) {
  const sev = a.severity ?? 'cosmetic';
  const color = SEV_COLOR[sev] ?? MED;
  const staticCost = a.estimatedCost && a.estimatedCost !== 'N/A' ? a.estimatedCost : null;
  const [price, setPrice] = useState<string | null>(staticCost);
  const [priceSrc, setPriceSrc] = useState<'local' | 'static' | null>(staticCost ? 'static' : null);
  const [priceLoading, setPriceLoading] = useState(false);

  const trade = (a.prosToCall && a.prosToCall !== 'N/A' ? a.prosToCall : a.unit) || 'home repair contractor';
  const where = zip || cityState || '';
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${a.unit ?? ''} ${(a.description ?? '').slice(0, 60)} how to fix`)}`;

  const [pros, setPros] = useState<{ name: string; rating?: number; reviews?: number; phone?: string; website?: string }[]>([]);
  const [prosLoading, setProsLoading] = useState(false);

  const [msgs, setMsgs] = useState<{ role: 'user' | 'ledrix'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // Top-3 local pros (by reviews) — tappable call list, fetched server-side from Places.
  useEffect(() => {
    let alive = true;
    if (!where) return;
    setProsLoading(true);
    fetch(`/api/pros?zip=${encodeURIComponent(where)}&trade=${encodeURIComponent(trade)}`)
      .then(r => r.json())
      .then(j => { if (alive) setPros(Array.isArray(j.pros) ? j.pros : []); })
      .catch(() => {})
      .finally(() => { if (alive) setProsLoading(false); });
    return () => { alive = false; };
  }, [where, trade]);

  // Location-aware AI price (signed-in homeowner only — else the static range stands).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!where) return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      setPriceLoading(true);
      try {
        const r = await fetch('/api/ledrix', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ shareId, mode: 'price', finding: `${a.unit ?? ''}: ${a.description ?? ''}` }),
        });
        const j = await r.json();
        if (alive && r.ok && typeof j.text === 'string' && /\$/.test(j.text)) { setPrice(j.text.trim()); setPriceSrc('local'); }
      } catch { /* keep static */ } finally { if (alive) setPriceLoading(false); }
    })();
    return () => { alive = false; };
  }, [where, shareId]);

  const ask = async () => {
    const q = input.trim(); if (!q || busy) return;
    setMsgs(m => [...m, { role: 'user', text: q }]); setInput(''); setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setMsgs(m => [...m, { role: 'ledrix', text: 'Sign in (top-right) to ask Ledrix about this finding.' }]); return; }
      const seeded = [{ role: 'user' as const, content: `About the finding "${a.unit ?? ''}: ${a.description ?? ''}"${a.location ? ` (${a.location})` : ''} — ${q}` }];
      const r = await fetch('/api/ledrix', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shareId, mode: 'chat', messages: seeded }),
      });
      const j = await r.json();
      setMsgs(m => [...m, { role: 'ledrix', text: r.ok ? (j.text ?? '…') : (j.error ?? 'Ledrix is unavailable.') }]);
    } catch { setMsgs(m => [...m, { role: 'ledrix', text: 'Network error.' }]); }
    finally { setBusy(false); }
  };

  const cta: CSSProperties = {
    display: 'inline-block', background: CARD2, border: `1px solid ${BORDER}`, color: '#e2e8f0',
    fontSize: 12, fontWeight: 700, padding: '10px 14px', borderRadius: 10, textDecoration: 'none',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: 20, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ background: `${color}18`, color, fontSize: 8, fontWeight: 900, letterSpacing: 1, padding: '4px 10px', borderRadius: 99, border: `1px solid ${color}44`, fontFamily: 'Roboto Mono, monospace' }}>{SEV_LABEL[sev] ?? sev.toUpperCase()}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MED, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {a.imageUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.imageUri} alt={a.unit ?? 'Finding photo'} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 12, border: `1px solid ${BORDER}`, marginBottom: 14 }} />
        )}
        <h3 style={{ color: '#e2e8f0', fontSize: 17, fontWeight: 800, margin: '0 0 3px' }}>{a.unit ?? 'Finding'}</h3>
        {a.location && <div style={{ color: DIM, fontSize: 10, fontWeight: 700, marginBottom: 12 }}>{a.location}</div>}
        <p style={{ color: TEXT, fontSize: 13, lineHeight: 1.65, margin: '0 0 8px' }}>{a.description}</p>
        {a.recommendation && <p style={{ color: MED, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{a.recommendation}</p>}

        <CardSection label="ESTIMATED COST">
          <div style={{ color: GREEN, fontSize: 22, fontWeight: 900 }}>{price ?? (priceLoading ? '…' : 'Ask Ledrix for an estimate')}</div>
          {priceSrc && <div style={{ color: DIM, fontSize: 9, fontWeight: 700, marginTop: 2, letterSpacing: 0.5 }}>{priceSrc === 'local' ? `BASED ON ${(cityState || where).toUpperCase()}` : 'TYPICAL RANGE'}</div>}
        </CardSection>

        <CardSection label="TOP-RATED LOCAL PROS">
          {pros.length > 0 ? pros.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', marginBottom: 7 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ color: MED, fontSize: 10, marginTop: 1 }}>{p.rating ? `★ ${p.rating}` : ''}{p.reviews ? `  (${p.reviews.toLocaleString()})` : ''}</div>
              </div>
              {p.phone && <a href={`tel:${p.phone}`} style={{ ...cta, padding: '8px 12px', color: GREEN, textDecoration: 'none' }}>📞 Call</a>}
              {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={{ ...cta, padding: '8px 12px' }}>Site</a>}
            </div>
          )) : (
            <div style={{ color: DIM, fontSize: 11 }}>{prosLoading ? 'Finding local pros…' : 'No local pros found for this area yet.'}</div>
          )}
        </CardSection>

        <CardSection label="REPAIR VIDEOS">
          <a href={ytUrl} target="_blank" rel="noreferrer" style={cta}>▶ Watch how-to videos</a>
          <p style={{ color: '#c9a94e', fontSize: 10.5, lineHeight: 1.5, marginTop: 8, background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 8, padding: '8px 10px' }}>
            Videos are a guide for minor upkeep only. For anything structural, electrical, gas, or plumbing — use a licensed pro.
          </p>
        </CardSection>

        <CardSection label="ASK LEDRIX ABOUT THIS">
          {msgs.map((m, i) => (
            <div key={i} style={{ marginBottom: 8, textAlign: m.role === 'user' ? 'right' : 'left' }}>
              <span style={{ display: 'inline-block', background: m.role === 'user' ? '#13202a' : '#0d0d0d', border: `1px solid ${BORDER}`, color: m.role === 'user' ? '#cfe' : '#aaa', fontSize: 12, lineHeight: 1.5, padding: '8px 11px', borderRadius: 10, maxWidth: '85%', textAlign: 'left' }}>{m.text}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(); }} placeholder="Is this urgent? Can I DIY it?" style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={ask} disabled={busy || !input.trim()} style={{ background: ACCENT, color: '#000', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 900, fontSize: 12, cursor: 'pointer', opacity: busy || !input.trim() ? 0.4 : 1 }}>{busy ? '…' : 'ASK'}</button>
          </div>
        </CardSection>
      </div>
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
    width: '100%', background: '#0c0f10', border: `1px solid ${BORDER}`,
    borderRadius: 8, padding: '10px 12px', color: '#e2e8f0',
    fontSize: 12, outline: 'none', fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0a0c0e', border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0',
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

// ─── NavBar ───────────────────────────────────────────────────────────────────
function NavBar({ address, onShare, copied, active, onBack, signedIn, onSignOut }: { address: string; onShare: () => void; copied: boolean; active: Tab; onBack: () => void; signedIn?: boolean; onSignOut?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(7,7,7,0.9)',
      position: 'sticky', top: 0, zIndex: 90, backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)', maxWidth: 430, width: '100%', boxSizing: 'border-box',
    }}>
      {active === 'home' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Logo size={30} />
          <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 2, color: DIM, fontFamily: 'Roboto Mono, monospace' }}>HOME RECORD</span>
        </div>
      ) : (
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: ACCENT, fontFamily: 'Roboto Mono, monospace', fontSize: 10, fontWeight: 900, letterSpacing: 1.5 }}>
          <span style={{ fontSize: 20, lineHeight: 1, marginTop: -2 }}>‹</span>
          <span>{active.toUpperCase()}</span>
        </button>
      )}
      <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
        {address && (
          <div style={{ color: '#aaa', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {address}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {signedIn && (
          <button onClick={onSignOut} title="Signed in to Ledrix — tap to sign out" style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${CYAN}14`, border: `1px solid ${CYAN}33`, borderRadius: 8, padding: '7px 9px', cursor: 'pointer' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: CYAN, display: 'inline-block' }} />
            <span style={{ color: CYAN, fontSize: 8, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace' }}>LEDRIX</span>
          </button>
        )}
        <button onClick={onShare} style={{
          background: copied ? `${GREEN}20` : `${ACCENT}15`, border: `1px solid ${copied ? GREEN + '44' : ACCENT + '33'}`,
          color: copied ? GREEN : ACCENT, borderRadius: 8, padding: '7px 12px',
          fontSize: 9, fontWeight: 900, letterSpacing: 1, cursor: 'pointer',
          fontFamily: 'Roboto Mono, monospace',
        }}>{copied ? 'COPIED' : 'SHARE'}</button>
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <div style={{ padding: '20px 16px 100px', textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Logo size={30} /></div>
      <div style={{ color: DIM, fontSize: 8, fontWeight: 700, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>LEDRIX SPATIAL OS</div>
      <a href="https://ledrixlabs.com" style={{ color: MED, fontSize: 10, fontWeight: 600, textDecoration: 'none' }}>ledrixlabs.com</a>
    </div>
  );
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
function HomeTab({ record, anomalies, projects, reminders, repairs, onTabChange, access, shareId, onUnlock }: {
  record: HomeRecord; anomalies: Anomaly[];
  projects: Project[]; reminders: Reminder[]; repairs: RepairRow[];
  onTabChange: (t: Tab) => void;
  access: boolean; shareId: string; onUnlock: () => void;
}) {
  const { score, grade, color: scoreColor } = scoreCalc(anomalies);
  const subAddress = [record.city, record.state, record.zip].filter(Boolean).join(', ');
  const critical = anomalies.filter(a => a.severity === 'critical');
  const deficien = anomalies.filter(a => a.severity === 'anomaly');
  const maint    = anomalies.filter(a => a.severity !== 'critical' && a.severity !== 'anomaly').length;
  const openProjects = projects.filter(p => p.status !== 'resolved');
  const dueReminders = reminders.filter(r => !r.completed);

  const includedRepairs = repairs.filter(r => r.status === 'included').length;
  const pillars: [Tab, IconName, string, string, number | string][] = [
    ['report', 'docs', 'FULL REPORT', ACCENT, anomalies.length],
    ['findings', 'findings', 'FINDINGS', anomalies.length > 0 ? CRITICAL : GREEN, anomalies.length],
    ['repairs', 'projects', 'REPAIR REQUEST', includedRepairs > 0 ? CYAN : DIM, includedRepairs],
    ['projects', 'projects', 'PROJECTS', openProjects.length > 0 ? WARN : GREEN, `${projects.filter(p=>p.status==='resolved').length}/${projects.length}`],
    ['reminders', 'reminders', 'REMINDERS', dueReminders.length > 0 ? ACCENT : GREEN, dueReminders.length],
    ['docs', 'docs', 'DOCS', DIM, '—'],
  ];
  const urgent = critical.concat(deficien).slice(0, 3);

  return (
    <div>
      {/* Cover photo — clean. Everything is pulled OFF the image into the record
          header below. Falls back to the gridded gradient when no cover published. */}
      <div style={{ margin: '16px 16px 0', borderRadius: 16, overflow: 'hidden', border: `1px solid rgba(0,243,255,0.16)`, height: 188 }}>
        {record.cover_url ? (
          <img src={record.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#0a1520 0%,#060c14 100%)',
            backgroundImage: 'linear-gradient(rgba(0,243,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,243,255,0.04) 1px,transparent 1px)',
            backgroundSize: '28px 28px' }} />
        )}
      </div>

      {/* Record header — pulled off the photo, Ledrix style: title + L-Index + stats */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: ACCENT, fontSize: 7.5, fontWeight: 700, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 6 }}>LEDRIX HOME RECORD · VERIFIED</div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, lineHeight: 1.15, letterSpacing: -0.5 }}>{record.address ?? 'ADDRESS PENDING'}</div>
            {subAddress && <div style={{ color: MED, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, marginTop: 5, fontFamily: 'Roboto Mono, monospace' }}>{subAddress}</div>}
            <div style={{ color: DIM, fontSize: 8, fontWeight: 700, letterSpacing: 1, marginTop: 7, fontFamily: 'Roboto Mono, monospace' }}>INSPECTED {fmtDate(record.inspection_date).toUpperCase()}</div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <ScoreRing score={score} grade={grade} color={scoreColor} />
            <div style={{ color: DIM, fontSize: 7, fontWeight: 900, letterSpacing: 2, marginTop: 3, fontFamily: 'Roboto Mono, monospace' }}>L-INDEX</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {([
            [critical.length, 'SAFETY',     critical.length > 0 ? CRITICAL : DIM],
            [deficien.length, 'DEFICIENCY', deficien.length > 0 ? WARN     : DIM],
            [maint,           'MAINT.',     maint           > 0 ? INFO     : DIM],
            [anomalies.length,'TOTAL',      TEXT],
          ] as [number, string, string][]).map(([v, l, c]) => (
            <div key={l} style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
              <div style={{ color: c, fontSize: 19, fontWeight: 900, lineHeight: 1 }}>{v}</div>
              <div style={{ color: DIM, fontSize: 6.5, fontWeight: 900, letterSpacing: 1, marginTop: 4, fontFamily: 'Roboto Mono, monospace' }}>{l}</div>
            </div>
          ))}
        </div>

        <button onClick={() => onTabChange('report')} style={{ marginTop: 14, width: '100%', background: ACCENT, color: '#04141a', border: 'none', borderRadius: 12, padding: 15, fontSize: 13, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          📄 VIEW FULL REPORT
        </button>
      </div>

      {/* Ledrix Insight — the AI intelligence layer (paid; locked teaser when not) */}
      <div style={{ marginTop: 16 }}>
        <InsightSection access={access} shareId={shareId} onUnlock={onUnlock} />
      </div>

      {/* Needs attention — the genuinely useful surface (top safety/deficiency) */}
      {urgent.length > 0 && (
        <div style={{ padding: '16px 16px 4px' }}>
          <div style={{ color: CRITICAL, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>
            NEEDS ATTENTION
          </div>
          {urgent.map((a, i) => (
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

      {/* The four screens (the home dashboard) */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {pillars.map(([tab, icon, label, color, count]) => (
            <button key={tab} onClick={() => onTabChange(tab)} style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
              padding: '16px 16px', textAlign: 'left', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <Icon name={icon} size={22} color={color} />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 900, letterSpacing: 0.5 }}>{label}</span>
                <span style={{ color, fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{count}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Property Passport — slimmed to a single confident line */}
      <div style={{ margin: '0 16px 16px', display: 'flex', alignItems: 'center', gap: 10,
        background: `${ACCENT}06`, border: `1px solid ${ACCENT}1c`, borderRadius: 12, padding: '12px 14px' }}>
        <Icon name="docs" size={16} color={ACCENT} />
        <p style={{ color: TEXT, fontSize: 10.5, lineHeight: 1.55, margin: 0 }}>
          <span style={{ color: ACCENT, fontWeight: 800 }}>Property Passport.</span> Permanently linked to this home and transfers to every future owner.
        </p>
      </div>

      <Footer />
    </div>
  );
}

// ─── FINDINGS TAB ─────────────────────────────────────────────────────────────
function FindingsTab({ anomalies, record, shareId }: { anomalies: Anomaly[]; record: HomeRecord; shareId: string }) {
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
      ) : filtered.map((a, i) => (
        <FindingCard key={i} a={a} zip={record.zip} cityState={[record.city, record.state].filter(Boolean).join(', ')} shareId={shareId} />
      ))}
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

// ─── REPORT TAB ──────────────────────────────────────────────────────────────
// Spectora-style: findings grouped into SYSTEM sections with a sticky, clickable
// table of contents. Additive — does not touch the other tabs.
// White, Spectora-style web report: left-sidebar system ToC (with counts) + hero + sections.
type RC = { ink: string; sub: string; line: string; accent: string };
function ReportRow({ a, C }: { a: Anomaly; C: RC }) {
  const color = PRIO_COLOR[a.severity ?? 'deficiency'] ?? '#d97706';
  const label = PRIO_LABEL[a.severity ?? 'deficiency'] ?? 'REPAIR';
  const desc  = (a.description ?? '').replace(/^LOCATION:.*\n?/i, '').trim();
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderLeft: `4px solid ${color}`, borderRadius: 8, padding: 14, marginBottom: 10, display: 'flex', gap: 14 }}>
      {a.imageUri ? <img src={a.imageUri} alt="" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
          <span style={{ background: `${color}1a`, color, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: '3px 9px', borderRadius: 5 }}>{label}</span>
          {isSafetyFinding(a) ? <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 5 }}>⚠ SAFETY</span> : null}
          {a.location ? <span style={{ color: C.sub, fontSize: 12 }}>{a.location}</span> : null}
        </div>
        {a.unit ? <div style={{ color: C.ink, fontSize: 14, fontWeight: 700 }}>{a.unit}</div> : null}
        {desc ? <div style={{ color: '#4b5563', fontSize: 13.5, lineHeight: 1.55, marginTop: 3 }}>{desc}</div> : null}
        {a.recommendation ? <div style={{ color: C.accent, fontSize: 12.5, fontWeight: 600, marginTop: 6 }}>Recommendation: {a.recommendation}</div> : null}
      </div>
    </div>
  );
}
// Condensed summary: findings grouped by priority tier, one compact line each.
function ReportSummary({ anomalies, C }: { anomalies: Anomaly[]; C: RC }) {
  if (anomalies.length === 0) return <div style={{ color: C.sub, fontSize: 14, textAlign: 'center', padding: '48px 0' }}>No findings were recorded for this inspection.</div>;
  const TIERS: { label: string; color: string }[] = [
    { label: 'IMMEDIATE', color: '#dc2626' },
    { label: 'REPAIR', color: '#d97706' },
    { label: 'MAINTENANCE', color: '#6b7280' },
    { label: 'NOTE', color: '#9ca3af' },
  ];
  const byLabel = new Map<string, Anomaly[]>();
  for (const a of anomalies) {
    const l = PRIO_LABEL[a.severity ?? 'deficiency'] ?? 'REPAIR';
    if (!byLabel.has(l)) byLabel.set(l, []);
    byLabel.get(l)!.push(a);
  }
  return (
    <div>
      {TIERS.filter(t => byLabel.has(t.label)).map(t => (
        <section key={t.label} style={{ paddingTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: t.color, margin: '0 0 8px', borderBottom: `2px solid ${t.color}`, paddingBottom: 6 }}>{t.label} <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>({byLabel.get(t.label)!.length})</span></h2>
          {byLabel.get(t.label)!.map((a, j) => (
            <div key={a.id ?? j} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: `1px solid ${C.line}` }}>
              <span style={{ width: 14, flexShrink: 0, color: '#dc2626', fontSize: 12 }}>{isSafetyFinding(a) ? '⚠' : ''}</span>
              <span style={{ fontWeight: 700, color: C.ink, fontSize: 13, minWidth: 110, flexShrink: 0 }}>{reportSystem(a)}</span>
              <span style={{ color: '#4b5563', fontSize: 13, flex: 1 }}>{a.unit ? `${a.unit} — ` : ''}{(a.description ?? '').replace(/^LOCATION:.*\n?/i, '').trim().slice(0, 130)}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
function ReportTab({ anomalies, record }: { anomalies: Anomaly[]; record: HomeRecord }) {
  const [view, setView] = useState<'full' | 'summary'>('full');
  const C: RC = { ink: '#1f2937', sub: '#6b7280', line: '#e5e7eb', accent: '#0e7490' };
  const groups = new Map<string, Anomaly[]>();
  for (const a of anomalies) {
    const s = reportSystem(a);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s)!.push(a);
  }
  const sections = REPORT_SYS_ORDER.filter(s => groups.has(s)).map(s => ({
    system: s,
    items: groups.get(s)!.slice().sort((x, y) => prioRank(x.severity) - prioRank(y.severity)),
  }));
  const slug = (s: string) => 'rpt-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const sub = [record.city, record.state, record.zip].filter(Boolean).join(', ');
  const sop = SOP_SCOPE[(record.sop_mode ?? 'INTERNACHI').toUpperCase()] ?? SOP_SCOPE.INTERNACHI;

  return (
    <div className="rpt">
      <aside className="rpt-side">
        <button onClick={() => jump('rpt-overview')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${C.line}`, padding: '13px 16px', color: C.accent, fontSize: 14, fontWeight: 800, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }}>
          <span>📋</span><span style={{ flex: 1 }}>Inspection Details</span>
        </button>
        {sections.map(sec => (
          <button key={sec.system} onClick={() => jump(slug(sec.system))}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${C.line}`, padding: '13px 16px', color: C.ink, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }}>
            <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}>{REPORT_ICON[sec.system] ?? '•'}</span>
            <span style={{ flex: 1 }}>{sec.system}</span>
            <span style={{ background: C.accent, color: '#fff', fontSize: 11, fontWeight: 800, minWidth: 22, height: 22, borderRadius: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0 }}>{sec.items.length}</span>
          </button>
        ))}
      </aside>

      <div className="rpt-main" style={{ color: C.ink }}>
        <div style={{ position: 'relative', minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 24, background: record.cover_url ? `linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.6)), url(${record.cover_url}) center/cover` : '#0f172a' }}>
          <div style={{ color: '#fff', fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{record.address ?? 'Property'}</div>
          <div style={{ color: '#e5e7eb', fontSize: 15, marginTop: 2 }}>{sub}{record.inspection_date ? ` · ${fmtDate(record.inspection_date)}` : ''}</div>
          {(record.inspector || record.company) ? (
            <div style={{ position: 'absolute', right: 20, bottom: 20, background: '#fff', borderRadius: 999, padding: '8px 18px 8px 10px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
              <div style={{ width: 38, height: 38, borderRadius: 19, background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{(record.inspector ?? 'I').slice(0, 1).toUpperCase()}</div>
              <div>
                <div style={{ fontSize: 8, color: C.sub, letterSpacing: 1, fontWeight: 800 }}>INSPECTOR</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{record.inspector ?? '—'}</div>
                {record.company ? <div style={{ fontSize: 11, color: C.sub }}>{record.company}</div> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ background: '#374151', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', position: 'sticky', top: 0, zIndex: 4 }}>
          {(['full', 'summary'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: view === v ? C.accent : 'transparent', color: '#fff', border: view === v ? 'none' : '1px solid rgba(255,255,255,0.25)', fontSize: 12, fontWeight: 800, padding: '7px 14px', borderRadius: 6, cursor: 'pointer' }}>
              {v === 'full' ? 'Full Report' : 'Summary'}
            </button>
          ))}
          <span style={{ marginLeft: 'auto' }} />
          {record.pdf_url ? <a href={record.pdf_url} target="_blank" rel="noreferrer" style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: 12, fontWeight: 800, padding: '7px 14px', borderRadius: 6, textDecoration: 'none' }}>⤓ PDF</a> : null}
        </div>

        <div style={{ padding: '0 24px 90px', background: '#fff' }}>
          <section id="rpt-overview" style={{ scrollMarginTop: 56, paddingTop: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>Inspection Details</h1>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', color: C.sub, fontSize: 13, marginBottom: 10 }}>
              {record.year_built ? <span>Built {record.year_built}</span> : null}
              {record.sqft ? <span>{record.sqft} sqft</span> : null}
              {record.beds ? <span>{record.beds} bd</span> : null}
              {record.baths ? <span>{record.baths} ba</span> : null}
              {record.inspection_type ? <span>{record.inspection_type}</span> : null}
            </div>
            <div style={{ borderTop: `2px solid ${C.accent}`, paddingTop: 14, color: '#4b5563', fontSize: 13.5, lineHeight: 1.65 }}>
              This inspection was performed in general accordance with <strong>{sop.name}</strong> — {sop.text}. It covered {sections.length > 0 ? <>the following system{sections.length !== 1 ? 's' : ''}: <strong>{sections.map(s => s.system).join(', ')}</strong></> : 'the home’s systems'}. <strong>{anomalies.length}</strong> finding{anomalies.length !== 1 ? 's were' : ' was'} documented. Conditions can change after the inspection date — download the full PDF for the complete report.
            </div>
          </section>
          {view === 'summary' ? (
            <ReportSummary anomalies={anomalies} C={C} />
          ) : sections.length === 0 ? (
            <div style={{ color: C.sub, fontSize: 14, textAlign: 'center', padding: '48px 0' }}>No findings were recorded for this inspection.</div>
          ) : sections.map((sec, i) => (
            <section key={sec.system} id={slug(sec.system)} style={{ scrollMarginTop: 56, paddingTop: 28 }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 12px', borderBottom: `2px solid ${C.accent}`, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{i + 1} · {sec.system}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: C.sub, fontWeight: 600 }}>{sec.items.length} finding{sec.items.length !== 1 ? 's' : ''}</span>
              </h2>
              {sec.items.map((a, j) => <ReportRow key={a.id ?? j} a={a} C={C} />)}
            </section>
          ))}
        </div>
      </div>
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
// Appliances & equipment carry make/model in their material string → a manual is
// one tap away. Material finishes (carpet/drywall/paint) are not "appliances".
const APPLIANCE_RE = /water heater|heating system|cooling system|hvac|furnace|condenser|air handler|boiler|panel|refrigerator|fridge|range|oven|cooktop|stove|dishwasher|washer|dryer|microwave|disposal|garbage disposal|generator|sump|water softener|water filtration|pool (pump|heater)|spa|softener/i;
const isAppliance = (s: Spec) => APPLIANCE_RE.test(`${s.category ?? ''} ${s.material ?? ''}`);
const manualUrl = (s: Spec) => {
  // First clause of the material is usually "Make Model" — the best manual query.
  const q = ((s.material ?? '').split(/[,(]/)[0].trim()) || (s.category ?? '');
  return `https://www.manualslib.com/search.php?q=${encodeURIComponent(`${q} user manual`)}`;
};
const yearOf = (s: Spec) => { const m = (s.material ?? '').match(/\b(19|20)\d{2}\b/); return m ? m[0] : null; };

function DocsTab({ record, specs }: { record: HomeRecord; specs: Spec[] }) {
  const [specsOpen, setSpecsOpen] = useState(false);
  const confirmedSpecs = specs.filter(s => s.status === 'confirmed');
  const appliances     = confirmedSpecs.filter(isAppliance);
  const materialSpecs  = confirmedSpecs.filter(s => !isAppliance(s));
  const subAddress = [record.city, record.state, record.zip].filter(Boolean).join(', ');

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 14 }}>DOCS</div>

      {/* PDF notice / link */}
      <div style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}22`, borderRadius: 14,
        padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ color: ACCENT, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 6 }}>
          INSPECTION REPORT PDF
        </div>
        <p style={{ color: TEXT, fontSize: 11, lineHeight: 1.65, marginBottom: 12 }}>
          Your full inspection report is a permanent legal document — an immutable record of this property&apos;s condition at the time of inspection.
          It never changes after it is generated.
        </p>
        {record.pdf_url ? (
          <a
            href={record.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textAlign: 'center',
              background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`,
              color: ACCENT, borderRadius: 10, padding: '12px',
              fontSize: 10, fontWeight: 900, letterSpacing: 1,
              fontFamily: 'Roboto Mono, monospace', textDecoration: 'none',
            }}
          >
            VIEW INSPECTION REPORT PDF ↗
          </a>
        ) : (
          <div style={{ color: DIM, fontSize: 9, fontFamily: 'Roboto Mono, monospace', fontWeight: 700 }}>
            PDF AVAILABLE IN LEDRIX APP · REQUEST A COPY FROM YOUR INSPECTOR
          </div>
        )}
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

      {/* Appliances & Manuals — every manual + warranty in one place */}
      {appliances.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 10 }}>APPLIANCES &amp; MANUALS</div>
          <p style={{ color: DIM, fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>
            Your equipment, captured at inspection — the manual a tap away. Keep these for warranty &amp; service calls.
          </p>
          {appliances.map((s, i) => {
            const yr = yearOf(s);
            const age = yr ? new Date().getFullYear() - Number(yr) : null;
            return (
              <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ color: DIM, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 5 }}>{(s.category ?? 'EQUIPMENT').toUpperCase()}</div>
                <div style={{ color: TEXT, fontSize: 14, fontWeight: 800, marginBottom: yr ? 4 : 12 }}>{s.material}</div>
                {yr && (
                  <div style={{ color: MED, fontSize: 10, fontWeight: 700, marginBottom: 12 }}>
                    Installed ~{yr}{age != null && age >= 0 ? ` · about ${age} yr${age === 1 ? '' : 's'} old` : ''}
                  </div>
                )}
                <a href={manualUrl(s)} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${CYAN}15`, border: `1px solid ${CYAN}44`, color: CYAN, borderRadius: 9, padding: '9px 14px', fontSize: 10, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', textDecoration: 'none' }}>
                  FIND MANUAL ↗
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Material specs */}
      {materialSpecs.length > 0 && (
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
              {materialSpecs.map((s, i) => (
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

// ─── Ledrix (Phase 1 experience layer) ──────────────────────────────────────
// Live chat + Insight are the paid tier. Cyan returns here ONLY as the AI accent.
// PLACEHOLDER pricing — set real numbers before launch.
const PLAN_BASE_PRICE  = '$4.99';
const PLAN_BASE_TOKENS = '500K tokens / mo · ~150 questions';
const PLAN_PAYG        = '$0.01 / 1K tokens';

function PlanCard({ title, price, sub, highlight }: { title: string; price: string; sub: string; highlight?: boolean }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${highlight ? CYAN + '55' : BORDER}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ color: highlight ? CYAN : '#e2e8f0', fontSize: 10, fontWeight: 900, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace' }}>{title}</span>
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 900 }}>{price}</span>
      </div>
      <div style={{ color: MED, fontSize: 10, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function SubscribeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [sent,  setSent]  = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState('');
  const sendLink = async () => {
    const e = email.trim();
    if (!e || !/.+@.+\..+/.test(e)) { setErr('Enter a valid email.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.href : undefined } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  };
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: BG, borderTop: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0', padding: '20px 18px 28px' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#222', margin: '0 auto 18px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <ValDeltaSVG size={20} color={CYAN} />
          <span style={{ color: CYAN, fontSize: 9, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace' }}>LEDRIX</span>
        </div>
        <div style={{ color: '#fff', fontSize: 21, fontWeight: 900, letterSpacing: -0.5, marginBottom: 7 }}>Make your home record live.</div>
        <p style={{ color: TEXT, fontSize: 12, lineHeight: 1.6, marginBottom: 20 }}>Ask Ledrix anything about your home — what a finding means, repair priorities, costs, what to do next — and get a living AI Insight that stays current with your record. Free members get the record; Ledrix members get the intelligence.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <PlanCard title="LEDRIX PLUS" price={`${PLAN_BASE_PRICE}/mo`} sub={PLAN_BASE_TOKENS} highlight />
          <PlanCard title="PAY AS YOU GO" price={PLAN_PAYG} sub="Only pay for what you ask — no monthly commitment." />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', marginBottom: 18 }}>
          <span style={{ color: CYAN, fontSize: 11, flexShrink: 0, marginTop: 1 }}>ⓘ</span>
          <p style={{ color: MED, fontSize: 10, lineHeight: 1.55 }}>Most homeowners ask ~150 questions a month; a typical question costs about 3,000 tokens. You&apos;ll always see your balance, and we&apos;ll help you pick the right plan.</p>
        </div>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
            <div style={{ color: CYAN, fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Check your email ✉</div>
            <p style={{ color: TEXT, fontSize: 11, lineHeight: 1.5 }}>We sent a sign-in link to <b style={{ color: '#fff' }}>{email}</b>. Tap it to unlock Ledrix.</p>
          </div>
        ) : (
          <>
            <input value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && sendLink()} placeholder="you@email.com" type="email"
              style={{ width: '100%', background: CARD, border: `1px solid ${err ? CRITICAL : BORDER}`, borderRadius: 12, padding: 14, color: '#fff', fontSize: 14, outline: 'none', marginBottom: 8 }} />
            {err && <div style={{ color: CRITICAL, fontSize: 10, marginBottom: 8 }}>{err}</div>}
            <button onClick={sendLink} disabled={busy} style={{ width: '100%', background: CYAN, color: '#001018', border: 'none', borderRadius: 12, padding: 15, fontSize: 12, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', opacity: busy ? 0.6 : 1 }}>{busy ? 'SENDING…' : 'CONTINUE WITH EMAIL'}</button>
          </>
        )}
        <button onClick={onClose} style={{ width: '100%', background: 'none', border: 'none', color: DIM, fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: 12, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>MAYBE LATER</button>
      </div>
    </div>
  );
}

function InsightSection({ access, shareId, onUnlock }: { access: boolean; shareId: string; onUnlock: () => void }) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!access || insight) return;
    let live = true;
    const cacheKey = `ledrix_insight_${shareId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const o = JSON.parse(cached);
        if (o?.text && Date.now() - o.t < 12 * 3600 * 1000) { setInsight(o.text); return; }
      }
    } catch { /* no cache */ }
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        const resp = await fetch('/api/ledrix', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ shareId, mode: 'insight' }) });
        const j = await resp.json().catch(() => ({}));
        if (!live) return;
        if (resp.ok && j.text) {
          setInsight(j.text);
          try { localStorage.setItem(cacheKey, JSON.stringify({ text: j.text, t: Date.now() })); } catch { /* quota */ }
        } else if (j.error) {
          setInsight(j.error);   // surface e.g. the daily-cap message
        }
      } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, shareId]);
  return (
    <div style={{ margin: '4px 16px 16px', position: 'relative', background: CARD, border: `1px solid ${CYAN}22`, borderRadius: 14, padding: '14px 16px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ValDeltaSVG size={14} color={CYAN} />
        <span style={{ color: CYAN, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace' }}>LEDRIX INSIGHT</span>
      </div>
      {access ? (
        <p style={{ color: loading ? MED : TEXT, fontSize: 12, lineHeight: 1.65 }}>{loading ? 'Analyzing your home…' : (insight ?? 'No insight available yet — ask Ledrix anything below.')}</p>
      ) : (
        <>
          <p style={{ color: TEXT, fontSize: 12, lineHeight: 1.65, filter: 'blur(4.5px)', userSelect: 'none' }}>
            Your home is in strong overall condition, with a few maintenance items worth scheduling before winter. The water heater is approaching the end of its typical service life, and the panel shows&hellip;
          </p>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(180deg, rgba(10,10,10,0.25), rgba(10,10,10,0.86))' }}>
            <button onClick={onUnlock} style={{ background: CYAN, color: '#001018', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 10, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>UNLOCK LEDRIX INSIGHT</button>
            <span style={{ color: MED, fontSize: 9, fontFamily: 'Roboto Mono, monospace' }}>Live AI analysis of your home</span>
          </div>
        </>
      )}
    </div>
  );
}

function LedrixPanel({ open, onClose, shareId }: { open: boolean; onClose: () => void; shareId: string }) {
  const [msgs, setMsgs]   = useState<{ role: 'ledrix' | 'user'; text: string }[]>([
    { role: 'ledrix', text: "Hi — I'm Ledrix. Ask me anything about your home: a finding, a repair, what something costs, or what to do next." },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy]   = useState(false);
  const [recording, setRecording] = useState(false);
  const [vp, setVp]       = useState<{ h: number; top: number } | null>(null);
  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Size the panel to the VISIBLE viewport so the input stays above the mobile
  // keyboard instead of being hidden under it.
  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => setVp({ h: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [open]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs, busy]);

  if (!open) return null;

  const send = async (text?: string) => {
    const t = (text ?? input).trim(); if (!t || busy) return;
    const next = [...msgs, { role: 'user' as const, text: t }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const resp = await fetch('/api/ledrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ shareId, mode: 'chat', messages: next.map(m => ({ role: m.role === 'ledrix' ? 'assistant' : 'user', content: m.text })) }),
      });
      const j = await resp.json().catch(() => ({}));
      setMsgs(m => [...m, { role: 'ledrix', text: resp.ok ? (j.text || '…') : (j.error || 'Ledrix is unavailable.') }]);
    } catch {
      setMsgs(m => [...m, { role: 'ledrix', text: 'Network error — please try again.' }]);
    } finally { setBusy(false); }
  };

  const toggleMic = async () => {
    if (recording) { mediaRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (!blob.size) return;
        setBusy(true);
        try {
          const { data } = await supabase.auth.getSession();
          const fd = new FormData();
          fd.append('audio', blob, 'voice.webm');
          const resp = await fetch('/api/transcribe', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: fd });
          const j = await resp.json().catch(() => ({}));
          if (resp.ok && j.text) setInput(prev => (prev ? prev + ' ' : '') + j.text);
        } finally { setBusy(false); }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch { /* mic denied / unsupported */ }
  };

  return (
    <div style={{ position: 'fixed', top: vp ? vp.top : 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430, height: vp ? vp.h : '100dvh', zIndex: 210, background: BG, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <ValDeltaSVG size={20} color={CYAN} />
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 900, flex: 1 }}>Ledrix</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '82%',
            background: m.role === 'user' ? '#161616' : `${CYAN}10`, border: `1px solid ${m.role === 'user' ? BORDER : CYAN + '2a'}`,
            borderRadius: 12, padding: '10px 13px', color: m.role === 'user' ? '#e2e8f0' : TEXT, fontSize: 13, lineHeight: 1.55 }}>{m.text}</div>
        ))}
        {busy && <div style={{ alignSelf: 'flex-start', color: MED, fontSize: 11, fontFamily: 'Roboto Mono, monospace' }}>Ledrix is thinking…</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: `1px solid ${BORDER}`, flexShrink: 0, alignItems: 'flex-end' }}>
        <button onClick={toggleMic} aria-label="Voice" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 10,
          background: recording ? CRITICAL : CARD, border: `1px solid ${recording ? CRITICAL : BORDER}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={recording ? '#fff' : ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
          </svg>
        </button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder={recording ? 'Listening…' : 'Ask Ledrix about your home…'} enterKeyHint="send"
          style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 16, outline: 'none', minWidth: 0 }} />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{ flexShrink: 0, height: 44, padding: '0 16px',
          background: CYAN, color: '#001018', border: 'none', borderRadius: 10, fontWeight: 900, fontSize: 11, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', opacity: (busy || !input.trim()) ? 0.45 : 1 }}>SEND</button>
      </div>
    </div>
  );
}

function LedrixFab({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Ask Ledrix" style={{ position: 'fixed', bottom: 24, right: 'max(20px, calc(50% - 195px))', zIndex: 120,
      width: 56, height: 56, borderRadius: '50%', background: CYAN, border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 6px 22px ${CYAN}40` }}>
      <ValDeltaSVG size={26} color="#001018" />
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
// ─── REPAIR REQUEST TAB ──────────────────────────────────────────────────────
// The buyer's repair request to the seller. The BUYER decides what to include and
// owns the wording; findings + AI drafts are advisory. Reads/writes home_repairs.
function repairRefOf(a: Anomaly, i: number): string { return a.id || `a${i}`; }
function repairFp(a: Anomaly): string { return `${a.id ?? ''}:${a.severity ?? ''}:${(a.description ?? '').slice(0, 40)}`; }
function repairText(r: RepairRow): string { return (r.edited_text && r.edited_text.trim()) || r.generated_text || ''; }

// Plain-text handoff document — copy/paste into an email, form, or text.
function buildRepairText(record: HomeRecord, items: RepairRow[]): string {
  const head = `REPAIR REQUEST\n${record.address ?? ''}${record.inspection_date ? ` · Inspected ${record.inspection_date}` : ''}\n`;
  const body = items.map((r, i) => {
    const ctx = [r.item, r.location].filter(Boolean).join(' · ');
    return `${i + 1}. ${repairText(r)}${ctx ? `\n   (${ctx})` : ''}`;
  }).join('\n\n');
  return `${head}\n${body}\n\nThis is a buyer-prepared repair request based on the inspection findings. It is not a legal form or legal advice.\nPrepared with Ledrix · ledrixlabs.com`;
}

async function draftRepairRequest(a: Anomaly): Promise<{ item: string; remedy: string; request: string } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await fetch('/api/ledrix/repair', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ finding: { unit: a.unit, location: a.location, severity: a.severity, description: a.description } }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.request ? j : null;
  } catch { return null; }
}

function RepairItemCard({ r, index, busy, onRemove, onSave }: { r: RepairRow; index: number; busy: boolean; onRemove: () => void; onSave: (t: string) => void }) {
  const [text, setText] = useState(repairText(r));
  useEffect(() => { setText(repairText(r)); }, [r.generated_text, r.edited_text]);
  const sev = (r.severity ?? '').toLowerCase();
  const tagColor = SEV_COLOR[sev] ?? INFO;
  const tagLabel = SEV_LABEL[sev] ?? 'MAINTENANCE';
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '13px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: ACCENT, fontSize: 9, fontWeight: 900, fontFamily: 'Roboto Mono, monospace' }}>{index}.</span>
        <span style={{ color: tagColor, fontSize: 7.5, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', border: `1px solid ${tagColor}44`, borderRadius: 6, padding: '2px 6px' }}>{tagLabel}</span>
        {r.item && <span style={{ color: MED, fontSize: 9, fontWeight: 700, letterSpacing: 0.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item}{r.location ? ` · ${r.location}` : ''}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={onRemove} title="Remove from request" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 17, lineHeight: 1 }}>×</button>
      </div>
      {busy && !r.generated_text ? (
        <div style={{ color: DIM, fontSize: 10, fontStyle: 'italic', animation: 'pulse 1.4s infinite', padding: '4px 2px' }}>Ledrix is drafting the request…</div>
      ) : (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={() => onSave(text)}
          rows={2}
          style={{ width: '100%', background: 'rgba(0,0,0,0.25)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 12.5, lineHeight: 1.55, padding: '9px 11px', resize: 'vertical', fontFamily: 'Inter, system-ui, sans-serif' }}
        />
      )}
    </div>
  );
}

function AddFindingRow({ a, busy, onAdd }: { a: Anomaly; busy: boolean; onAdd: () => void }) {
  const tagColor = SEV_COLOR[(a.severity ?? '').toLowerCase()] ?? INFO;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: tagColor, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: TEXT, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.unit || 'Finding'}{a.location ? ` · ${a.location}` : ''}</div>
        <div style={{ color: DIM, fontSize: 9.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.description ?? ''}</div>
      </div>
      <button onClick={onAdd} disabled={busy} style={{ flexShrink: 0, background: busy ? CARD2 : `${ACCENT}15`, border: `1px solid ${ACCENT}44`, color: ACCENT, borderRadius: 8, padding: '6px 12px', fontSize: 8, fontWeight: 900, letterSpacing: 1, cursor: busy ? 'default' : 'pointer', fontFamily: 'Roboto Mono, monospace' }}>{busy ? '…' : 'ADD'}</button>
    </div>
  );
}

function RepairsTab({ anomalies, shareId, repairs, record, onRefresh, signedIn }: {
  anomalies: Anomaly[]; shareId: string; repairs: RepairRow[]; record: HomeRecord; onRefresh: () => Promise<void> | void; signedIn: boolean;
}) {
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const setBusyRef = (ref: string, on: boolean) => setBusy(s => { const n = new Set(s); if (on) n.add(ref); else n.delete(ref); return n; });

  const byRef = new Map(repairs.map(r => [r.anomaly_ref ?? '', r]));
  const included = repairs.filter(r => r.status === 'included').sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
  const available = anomalies.map((a, i) => ({ a, ref: repairRefOf(a, i) })).filter(({ ref }) => !byRef.has(ref));

  const addOne = async (a: Anomaly, ref: string) => {
    if (busy.has(ref)) return;
    setBusyRef(ref, true);
    try {
      await supaPost('home_repairs', {
        share_id: shareId, anomaly_ref: ref, item: a.unit ?? null, location: a.location ?? null,
        severity: a.severity ?? null, status: 'included', sort_order: Date.now(),
      });
      await onRefresh();
      const w = await draftRepairRequest(a);
      if (w) {
        await supaPatch('home_repairs', `share_id=eq.${encodeURIComponent(shareId)}&anomaly_ref=eq.${encodeURIComponent(ref)}`,
          { item: w.item || a.unit || null, remedy: w.remedy, generated_text: w.request, source_fp: repairFp(a), updated_at: new Date().toISOString() });
        await onRefresh();
      }
    } finally { setBusyRef(ref, false); }
  };
  const addAll = async () => { for (const { a, ref } of available) await addOne(a, ref); };
  const remove = async (r: RepairRow) => { await supaDelete('home_repairs', `id=eq.${encodeURIComponent(r.id)}`); await onRefresh(); };
  const saveText = async (r: RepairRow, text: string) => {
    const v = text.trim();
    if (v === repairText(r)) return;
    await supaPatch('home_repairs', `id=eq.${encodeURIComponent(r.id)}`, { edited_text: v || null, updated_at: new Date().toISOString() });
    await onRefresh();
  };
  const copyText = async () => {
    try { await navigator.clipboard.writeText(buildRepairText(record, included)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  // The public, no-login hand-off link the buyer sends the seller/agent.
  const shareLink = async () => {
    const url = `${window.location.origin}/share/${shareId}/repairs`;
    try {
      if (navigator.share) await navigator.share({ title: 'Repair Request', url });
      else { await navigator.clipboard.writeText(url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }
    } catch {}
  };

  if (!signedIn) {
    return (
      <div style={{ padding: '40px 28px', textAlign: 'center', color: MED }}>
        <div style={{ fontSize: 22, marginBottom: 10 }}>🔑</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.7 }}>Sign in (top-right) to build your repair request. Ledrix drafts neutral wording from the findings — <b style={{ color: TEXT }}>you choose</b> what to ask the seller to repair.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 6 }}>REPAIR REQUEST</div>
      <p style={{ color: MED, fontSize: 10.5, lineHeight: 1.6, marginBottom: 16 }}>
        Your list to give the seller — <b style={{ color: TEXT }}>you decide</b> what to ask to be repaired. Ledrix drafts neutral wording; edit anything. This is a draft, not legal advice.
      </p>

      {included.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={shareLink} style={{ width: '100%', background: linkCopied ? `${GREEN}20` : `${ACCENT}1e`, border: `1px solid ${linkCopied ? GREEN + '55' : ACCENT + '55'}`, color: linkCopied ? GREEN : ACCENT, borderRadius: 9, padding: '11px', fontSize: 9.5, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>{linkCopied ? 'LINK COPIED ✓' : 'SHARE REQUEST LINK'}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyText} style={{ flex: 1, background: copied ? `${GREEN}20` : `${ACCENT}15`, border: `1px solid ${copied ? GREEN + '44' : ACCENT + '44'}`, color: copied ? GREEN : ACCENT, borderRadius: 9, padding: '9px', fontSize: 9, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>{copied ? 'COPIED ✓' : 'COPY TEXT'}</button>
            <button onClick={() => window.print()} style={{ flex: 1, background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, color: ACCENT, borderRadius: 9, padding: '9px', fontSize: 9, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>PRINT / PDF</button>
          </div>
        </div>
      )}

      {included.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0 26px', color: DIM }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>📝</div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace' }}>NOTHING REQUESTED YET</div>
          <div style={{ fontSize: 10.5, marginTop: 6, color: MED }}>Add findings below to build your request.</div>
        </div>
      ) : included.map((r, i) => (
        <RepairItemCard key={r.id} r={r} index={i + 1} busy={busy.has(r.anomaly_ref ?? '')} onRemove={() => remove(r)} onSave={t => saveText(r, t)} />
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 12px' }}>
        <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace' }}>ADD FROM FINDINGS</div>
        {available.length > 0 && (
          <button onClick={addAll} style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, color: ACCENT, borderRadius: 8, padding: '6px 12px', fontSize: 8, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>+ ADD ALL ({available.length})</button>
        )}
      </div>
      {available.length === 0 ? (
        <div style={{ color: GREEN, fontSize: 9, fontWeight: 900, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace', padding: '4px 0 24px' }}>✓ EVERY FINDING ADDED</div>
      ) : available.map(({ a, ref }) => (
        <AddFindingRow key={ref} a={a} busy={busy.has(ref)} onAdd={() => addOne(a, ref)} />
      ))}
      <div style={{ height: 28 }} />

      {/* Print/PDF document — off-screen on screen; @media print reveals only this. */}
      <div id="repair-print" style={{ position: 'fixed', left: -10000, top: 0, width: 640, background: '#fff', color: '#111', padding: 32, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>Repair Request</div>
        <div style={{ fontSize: 12.5, color: '#444', marginTop: 4 }}>
          {record.address ?? ''}{record.inspection_date ? ` · Inspected ${record.inspection_date}` : ''}
        </div>
        <div style={{ borderTop: '2px solid #111', margin: '14px 0 18px' }} />
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          {included.map(r => (
            <li key={r.id} style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.5 }}>
              {repairText(r)}
              {(r.item || r.location) && (
                <div style={{ fontSize: 11, color: '#777', marginTop: 3 }}>{[r.item, r.location].filter(Boolean).join(' · ')}</div>
              )}
            </li>
          ))}
        </ol>
        <p style={{ fontSize: 10.5, color: '#666', marginTop: 22, lineHeight: 1.5 }}>
          This is a buyer-prepared repair request based on the inspection findings. It is not a legal form or legal advice.
        </p>
        <div style={{ fontSize: 10.5, color: '#999', marginTop: 8 }}>Prepared with Ledrix · ledrixlabs.com</div>
      </div>
    </div>
  );
}

export default function SharePage() {
  const params  = useParams();
  const shareId = params?.id as string;

  const [record,    setRecord]    = useState<HomeRecord | null>(null);
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [repairs,   setRepairs]   = useState<RepairRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [tab,       setTab]       = useState<Tab>('home');
  const [hist,      setHist]      = useState<Tab[]>([]);
  const [copied,    setCopied]    = useState(false);

  // Tile drill-in navigation (no bottom rail): go pushes the current screen onto
  // history; back returns to wherever you came from (home if the stack is empty).
  const go   = (t: Tab) => { setHist(h => [...h, tab]); setTab(t); };
  const back = () => setHist(h => { const n = [...h]; setTab(n.pop() ?? 'home'); return n; });

  // Ledrix access via Supabase magic-link auth. Phase 2: signed-in === access
  // (Stripe subscription gating layers on in Phase 3).
  const [session, setSession]       = useState<any>(null);
  const [subOpen, setSubOpen]       = useState(false);
  const [ledrixOpen, setLedrixOpen] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  const access = !!session;
  const openLedrix = () => (access ? setLedrixOpen(true) : setSubOpen(true));
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

  const loadRepairs = useCallback(async () => {
    if (!shareId) return;
    const data = await supaGet<RepairRow>(`home_repairs?share_id=eq.${encodeURIComponent(shareId)}&order=sort_order.asc`);
    setRepairs(data);
  }, [shareId]);

  useEffect(() => {
    if (!shareId) { setLoading(false); setNotFound(true); return; }
    fetch(`/api/proxy?path=${encodeURIComponent(`home_records?share_id=eq.${encodeURIComponent(shareId)}&limit=1`)}`)
      .then(r => r.json())
      .then(async (data: HomeRecord[]) => {
        if (!Array.isArray(data) || data.length === 0) { setNotFound(true); return; }
        const rec = data[0]; setRecord(rec);
        await Promise.all([loadProjects(), loadReminders(), loadRepairs()]).catch(() => {});
        if (!seeded.current) {
          seeded.current = true;
          seedIfEmpty(shareId, rec.anomalies ?? [], rec.specs ?? [])
            .then(() => Promise.all([loadProjects(), loadReminders()]).catch(() => {}))
            .catch(() => {});
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [shareId, loadProjects, loadReminders, loadRepairs]);

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
        <NavBar address="" onShare={() => {}} copied={false} active="home" onBack={() => {}} />
        <Skeleton />
      </div>
    );
  }
  if (notFound || !record) {
    return (
      <div style={{ background: BG, minHeight: '100vh', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        <NavBar address="" onShare={() => {}} copied={false} active="home" onBack={() => {}} />
        <NotFound />
        <Footer />
      </div>
    );
  }

  const anomalies = Array.isArray(record.anomalies) ? record.anomalies : [];
  const specs     = Array.isArray(record.specs)     ? record.specs     : [];

  return (
    <div style={{ background: BG, minHeight: '100vh', maxWidth: tab === 'report' ? 1400 : 430, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif', paddingBottom: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Roboto+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{display:none}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        input::placeholder{color:#222}
        button{-webkit-tap-highlight-color:transparent}
        .rpt{display:flex;align-items:flex-start;background:#fff;min-height:100vh}
        .rpt-side{width:250px;flex-shrink:0;position:sticky;top:0;max-height:100vh;overflow-y:auto;background:#fff}
        .rpt-main{flex:1;min-width:0}
        @media (max-width:860px){
          .rpt{flex-direction:column}
          .rpt-side{position:static;width:100%;max-height:none;overflow-x:auto;overflow-y:hidden;flex-direction:row;border-bottom:1px solid #e5e7eb}
          .rpt-side>button{width:auto!important;border-bottom:none!important;border-right:1px solid #e5e7eb}
        }
        @media print {
          body * { visibility: hidden !important; }
          #repair-print, #repair-print * { visibility: visible !important; }
          #repair-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 24px !important; }
        }
      `}</style>

      <NavBar address={record.address ?? ''} onShare={handleShare} copied={copied} active={tab} onBack={back} signedIn={access} onSignOut={() => supabase.auth.signOut()} />

      {tab === 'home'      && <HomeTab record={record} anomalies={anomalies} projects={projects} reminders={reminders} repairs={repairs} onTabChange={go} access={access} shareId={shareId} onUnlock={() => setSubOpen(true)} />}
      {tab === 'findings'  && <FindingsTab anomalies={anomalies} record={record} shareId={shareId} />}
      {tab === 'report'    && <ReportTab anomalies={anomalies} record={record} />}
      {tab === 'repairs'   && <RepairsTab anomalies={anomalies} shareId={shareId} repairs={repairs} record={record} onRefresh={loadRepairs} signedIn={access} />}
      {tab === 'projects'  && <ProjectsTab projects={projects} shareId={shareId} address={record.address} onRefresh={loadProjects} />}
      {tab === 'reminders' && <RemindersTab reminders={reminders} onRefresh={loadReminders} />}
      {tab === 'docs'      && <DocsTab record={record} specs={specs} />}

      <LedrixFab onClick={openLedrix} />
      <SubscribeSheet open={subOpen} onClose={() => setSubOpen(false)} />
      <LedrixPanel open={ledrixOpen} onClose={() => setLedrixOpen(false)} shareId={shareId} />
    </div>
  );
}
