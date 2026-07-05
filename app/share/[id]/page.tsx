'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ValVoiceVisualizer from '../../../components/ValVoiceVisualizer';
import { LedrixDelta as ValDeltaSVG } from '@/components/LedrixDelta';
import ValOrbVoice from '@/components/ValOrbVoice';
import { ValMark } from '@/components/ValMark';
import { ETHIX_CATEGORIES, ETHIX_CATEGORY_KEYS } from '@/lib/ethix';

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
// Blue + dark-glass — matches the Ledrix inspector app's GradientCard aesthetic.
// Blue is the primary UI accent; color is still reserved for MEANING (severity).
// Stage 2: light theme. Accent is a readable brand blue (deep #1A63C8 stays legible on the light ground).
const BLUE     = '#1A63C8';   // readable brand blue accent on light
const ACCENT   = '#1A63C8';   // primary UI accent
const CRITICAL = '#DC2626';   // safety (readable on light)
const WARN     = '#CA8A04';   // deficiency (amber, readable on light)
const GREEN    = '#16A34A';   // satisfactory / resolved
const INFO     = '#5B7183';   // slate — maintenance + in-progress
const PURPLE   = INFO;        // legacy alias → muted (no rainbow)
const BG       = '#F5F6F3';   // light paper
// Surfaces: clean white cards on the paper ground.
const CARD     = '#FFFFFF';
const CARD2    = '#FBFCFB';
const BORDER   = 'rgba(16,24,28,0.10)';
const DIM      = '#97A4A8';   // faint muted (was dark) — light secondary
const MED      = '#64757B';   // muted body/secondary
const TEXT     = '#16242A';   // dark ink text

// ─── Types ────────────────────────────────────────────────────────────────────
type Anomaly = {
  id?: string; description?: string; severity?: string; unit?: string; component?: string;
  location?: string; estimatedCost?: string; recommendation?: string; prosToCall?: string;
  imageUri?: string; isSafety?: boolean;   // real synced Safety flag (app's isSafetyConcern)
  issueTitle?: string; observationBullets?: string[];   // canonical finding card: title + bullets
};
type Spec = { category?: string; material?: string; status?: string; };
type HomeRecord = {
  id: string; share_id: string; address?: string; city?: string; state?: string;
  zip?: string; year_built?: string; sqft?: string; beds?: string; baths?: string;
  garage?: string; inspector?: string; company?: string; license_number?: string;
  inspection_date?: string; inspection_type?: string; sop_mode?: string;
  anomalies: Anomaly[]; specs: Spec[]; created_at: string; pdf_url?: string; cover_url?: string; share_token?: string;
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
// The home's permanent service history (home_maintenance_log) — the Carfax spine:
// the inspection is the baseline; every logged service/repair/improvement accrues here.
type MaintenanceLog = {
  id: string; share_id: string; title: string; system?: string;
  kind?: string; note?: string; photo_url?: string; done_date: string;
  source?: string; reminder_id?: string; created_at?: string;
};

type Tab = 'home' | 'findings' | 'repairs' | 'projects' | 'reminders' | 'docs' | 'report' | 'ethix';

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
// ── Unified priority taxonomy (matches the app). Safety is an overlay flag — a true
// hazard shows red "SAFETY" regardless of its repair tier; otherwise the severity tier
// maps 1:1. `color` = dark (Home App); `report` = darker for the light/print report.
const PRIO = {
  safety: { label: 'SAFETY',          color: '#FF3B3B', report: '#DC2626', rank: 0 },
  major:  { label: 'MAJOR REPAIR',    color: '#F97316', report: '#EA580C', rank: 1 },
  minor:  { label: 'MINOR REPAIR',    color: '#EAB308', report: '#CA8A04', rank: 2 },
  maint:  { label: 'MAINT & IMPROVE', color: '#64748B', report: '#475569', rank: 3 },
  wear:   { label: 'TYPICAL WEAR',    color: '#38BDF8', report: '#0284C7', rank: 4 },
  good:   { label: 'GOOD',            color: '#22C55E', report: '#16A34A', rank: 5 },
} as const;
type PrioKey = keyof typeof PRIO;
const PRIO_ORDER: PrioKey[] = ['safety', 'major', 'minor', 'maint', 'wear', 'good'];
const PRIO_SHORT: Record<PrioKey, string> = { safety: 'Safety', major: 'Major', minor: 'Minor', maint: 'Maint', wear: 'Wear', good: 'Good' };
const SEV_TO_PRIO: Record<string, PrioKey> = {
  critical: 'major', deficiency: 'minor', anomaly: 'minor',
  maintenance: 'maint', cosmetic: 'maint', characteristic: 'wear', spec: 'good',
};
const prioKeyOf = (s?: string): PrioKey => SEV_TO_PRIO[(s ?? 'deficiency').toLowerCase()] ?? 'minor';
// Legacy string-keyed lookups, derived from PRIO (no safety overlay — for callers that
// only have a severity string). Finding displays use priorityOf(a) for the safety overlay.
const SEV_COLOR: Record<string,string> = { critical: PRIO.major.color, deficiency: PRIO.minor.color, anomaly: PRIO.minor.color, maintenance: PRIO.maint.color, cosmetic: PRIO.maint.color, characteristic: PRIO.wear.color, spec: PRIO.good.color };
const SEV_LABEL: Record<string,string> = { critical: PRIO.major.label, deficiency: PRIO.minor.label, anomaly: PRIO.minor.label, maintenance: PRIO.maint.label, cosmetic: PRIO.maint.label, characteristic: PRIO.wear.label, spec: PRIO.good.label };

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
  // Trust the app's classification (`unit`) FIRST. The description often mentions
  // "insulation" about something else — refrigerant-line insulation on an AC unit,
  // or conductor insulation in a panel — which otherwise false-matches the
  // Attic & Insulation pattern (checked before HVAC/Electrical) and misfiles it.
  const unit = (a.unit ?? '').trim();
  if (unit) { for (const [re, name] of REPORT_SYS) if (re.test(unit)) return name; }
  const t = `${a.location ?? ''} ${a.description ?? ''}`;
  for (const [re, name] of REPORT_SYS) if (re.test(t)) return name;
  return 'General';
}
// Tier label/color/rank (no safety overlay), derived from PRIO — for string-keyed callers.
const PRIO_LABEL: Record<string,string> = SEV_LABEL;
const PRIO_COLOR: Record<string,string> = SEV_COLOR;
const prioRank = (s?: string): number => PRIO[prioKeyOf(s)].rank;
// SAFETY: a true HAZARD (danger to people) — overrides the tier to the top "Safety"
// level. Property-damage items (water intrusion, structural, roof) stay Major Repair.
// Prefer the REAL synced flag (the app's isSafetyConcern, derived from the AI
// defectType); fall back to keyword derivation only for legacy records published
// before is_safety existed.
function isSafetyFinding(a: Anomaly): boolean {
  if (typeof a.isSafety === 'boolean') return a.isSafety;
  return /smoke detector|carbon monoxide|gas leak|open (wire|conductor)|exposed (wire|conductor|electrical)|knob.?and.?tube|\bmold\b|microbial|asbestos|\bradon\b|trip hazard|missing (handrail|guardrail|rail|guard)|\bhandrail|guardrail|won'?t (lock|latch|close)|not (locking|latching|securing)|scald|fire hazard/i.test(`${a.unit ?? ''} ${a.location ?? ''} ${a.description ?? ''}`);
}
function priorityOf(a: Anomaly): { key: PrioKey; label: string; color: string; report: string; rank: number } {
  const key: PrioKey = isSafetyFinding(a) ? 'safety' : prioKeyOf(a.severity);
  return { key, ...PRIO[key] };
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
function buildMaintenanceReminders(shareId: string, specs: Spec[], anomalies: Anomaly[] = []): object[] {
  const rem: object[] = [];
  const mk = (title: string, system: string, days: number, recurrence: string) =>
    ({ share_id: shareId, title, system, due_date: addDays(days), recurrence, completed: false, seeded: true });

  // Presence detection — build the schedule ONLY from what the report actually recorded, so a home with
  // no gutters never gets a "clean gutters" task, a tankless heater never gets a "flush", etc. Draw on the
  // confirmed specs + the systems the findings touched.
  const corpus = [
    ...specs.filter(s => s.status === 'confirmed').map(s => `${s.category ?? ''} ${s.material ?? ''}`),
    ...anomalies.map(a => `${a.unit ?? ''} ${a.location ?? ''}`),
  ].join(' | ').toLowerCase();
  const has = (...kw: string[]) => kw.some(k => corpus.includes(k));

  // Universal — every home, regardless of specs
  rem.push(mk('Test smoke & CO detectors',                'Safety',     90,  '180d'));
  rem.push(mk('Test GFCI outlets',                        'Electrical', 180, '365d'));
  rem.push(mk('Inspect exterior caulking & weatherstrip', 'Exterior',   180, '365d'));

  // HVAC — only with heating/cooling equipment; pull the filter size if the report captured it
  if (has('furnace', 'hvac', 'heat pump', 'air handler', 'air condition', 'a/c', 'central air', 'mini split', 'mini-split', 'condenser')) {
    const m = corpus.match(/(\d{1,2})\s*[x×]\s*(\d{1,2})\s*[x×]\s*(\d{1,2})/);
    const size = m ? ` (${m[1]}×${m[2]}×${m[3]})` : '';
    rem.push(mk(`Replace HVAC air filter${size}`, 'HVAC', 30, '90d'));
    rem.push(mk('Schedule an HVAC tune-up',        'HVAC', 180, '365d'));
  }

  // Water heater — only if present; tankless gets a descale, not a flush
  if (has('water heater', 'hot water')) {
    if (has('tankless', 'on-demand', 'on demand')) rem.push(mk('Descale the tankless water heater', 'Water Heater', 365, '365d'));
    else { rem.push(mk('Flush water heater sediment', 'Water Heater', 180, '365d')); rem.push(mk('Check the water heater anode rod', 'Water Heater', 365, '730d')); }
  }

  // Everything below is conditional on the home actually having it
  if (has('gutter', 'downspout'))                                          rem.push(mk('Clean gutters & downspouts', 'Exterior', 60,  '180d'));
  if (has('roof', 'shingle', 'asphalt', 'metal roof', 'tile roof', 'flat roof')) rem.push(mk('Inspect the roof for damage', 'Roof', 270, '365d'));
  if (has('dryer', 'laundry'))                                             rem.push(mk('Clean the dryer vent',       'Laundry',  180, '365d'));
  if (has('deck'))                                                         rem.push(mk('Reseal or restain the deck', 'Exterior', 300, '730d'));
  if (has('fireplace', 'chimney', 'wood stove', 'wood-burning'))           rem.push(mk('Chimney sweep & inspection', 'Fireplace',300, '365d'));
  if (has('sump'))                                                         rem.push(mk('Test the sump pump',         'Basement', 120, '180d'));
  if (has('septic'))                                                       rem.push(mk('Pump the septic tank',       'Plumbing', 900, '1095d'));
  if (has('irrigation', 'sprinkler'))                                      rem.push(mk('Winterize the irrigation',   'Exterior', 210, '365d'));
  if (has('pool', 'spa', 'hot tub'))                                       rem.push(mk('Service the pool / spa',     'Exterior', 60,  '90d'));

  return rem;
}

// ─── Seeding ─────────────────────────────────────────────────────────────────
async function seedIfEmpty(shareId: string, anomalies: Anomaly[], specs: Spec[]) {
  // Projects + repair requests start EMPTY — the homeowner adds items themselves (manually or from a
  // finding). Only the spec-conditional maintenance schedule is auto-derived below.
  const existRem = await supaGet<{id:string;title:string}>(`home_reminders?share_id=eq.${encodeURIComponent(shareId)}&select=id,title&limit=200`);
  // Clear any previously auto-seeded projects — Projects are empty-by-default now (user-added rows are seeded:false).
  await supaDelete('home_projects', `share_id=eq.${encodeURIComponent(shareId)}&seeded=eq.true`);

  // Reconcile the spec-conditional schedule against the CURRENT specs: migrate legacy sets, then add any
  // implied task that isn't already present. This is what makes it a LIVING schedule — a spec added after
  // the first seed (e.g. a dryer vent added later) now gets its maintenance task, with no duplicates and
  // nothing removed that's already there.
  const isLegacy = existRem.some(r =>
    r.title.startsWith('Address:') ||
    r.title === 'Clean gutters' || r.title === 'Inspect roof & attic for leaks' ||
    r.title === 'Replace HVAC air filter' || r.title === 'Inspect caulking & weatherstripping');
  if (isLegacy) await supaDelete('home_reminders', `share_id=eq.${encodeURIComponent(shareId)}&seeded=eq.true`);
  const implied = buildMaintenanceReminders(shareId, specs, anomalies);
  const have = new Set((isLegacy ? [] : existRem).map(r => r.title));
  const missing = implied.filter(r => !have.has((r as { title: string }).title));
  if (missing.length > 0) await supaPost('home_reminders', missing);
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
function Logo({ size = 32 }: { size?: number }) {
  const r = Math.round(size * 0.22);
  return (
    <div style={{ width: size, height: size, borderRadius: r, backgroundColor: '#080808',
      border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ValDeltaSVG size={Math.round(size * 0.82)} color={BLUE} sheen />
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
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ filter: `drop-shadow(0 0 ${(size * 0.06).toFixed(1)}px ${color})` }} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.24} fontWeight="900"
        fill={color} fontFamily="Inter,system-ui,sans-serif">{score}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={size * 0.13} fontWeight="900"
        fill={color} fontFamily="Inter,system-ui,sans-serif" letterSpacing="2">{grade}</text>
    </svg>
  );
}

// ─── FindingCard → opens the full homeowner card (price · pros · videos · Ask Ledrix) ──
// Resolve an anomaly's photo to a loadable URL: absolute stays as-is; a private evidence
// storage path routes through the /api/photo signing proxy; a never-uploaded file:// → none.
function photoUrl(uri?: string | null): string | null {
  if (!uri) return null;
  if (/^https?:\/\//.test(uri)) {
    // Finding photos live in the inspection-pdfs bucket (may be private) → sign server-side.
    // Any other absolute URL is already public/external and passes through untouched.
    return uri.includes('/inspection-pdfs/') ? `/api/report-asset?path=${encodeURIComponent(uri)}` : uri;
  }
  if (uri.startsWith('file')) return null;
  return `/api/photo?path=${encodeURIComponent(uri)}`;
}

// Fullscreen image viewer — tap anywhere or ✕ to close.
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      <button aria-label="Close" style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16, width: 40, height: 40, borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>✕</button>
    </div>
  );
}

// Split a prose observation into short bullets at sentence boundaries — mirrors the app's proseToBullets
// so a legacy finding (no observationBullets) still renders in the canonical bulleted format.
function splitBullets(text: string): string[] {
  const t = (text ?? '').trim();
  if (!t) return [];
  return t.replace(/([.!?])\s+/g, '$1').split('').map(s => s.trim()).filter(Boolean);
}
// Uppercase field label — matches the AnalysisConfirmSheet / PDF canonical card sections.
function FLabel({ children }: { children: ReactNode }) {
  return <div style={{ color: DIM, fontSize: 8, fontWeight: 900, letterSpacing: 1.2, fontFamily: 'Roboto Mono, monospace', marginBottom: 2 }}>{children}</div>;
}

// The printable PDF link. Routed through the /api/report-asset signing proxy (keyed on the
// canonical share_id storage path) so it works when the inspection-pdfs bucket is private —
// and regardless of whether the pdf_url column was ever stamped. If pdf_url holds a full
// public inspection-pdfs URL, the proxy normalizes it back to the object path and signs it.
function pdfHref(record: HomeRecord): string | null {
  const src = record.pdf_url || (record.share_id ? `${record.share_id}/report.pdf` : '');
  return src ? `/api/report-asset?path=${encodeURIComponent(src)}` : null;
}

function FindingCard({ a, zip, cityState, shareId }: { a: Anomaly; zip?: string; cityState?: string; shareId: string }) {
  const p = priorityOf(a);
  const color = p.color;
  const [open, setOpen] = useState(false);
  const img = photoUrl(a.imageUri);
  return (
    <>
      <div onClick={() => setOpen(true)} style={{
        background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${color}`,
        borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
      }}>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" style={{ width: '100%', height: 190, objectFit: 'cover', borderRadius: 10, border: `1px solid ${BORDER}`, marginBottom: 12 }} />
        )}
        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FLabel>SYSTEM</FLabel>
            <div style={{ color: TEXT, fontSize: 12.5, fontWeight: 700 }}>{a.component || a.unit || 'Component'}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FLabel>PRIORITY</FLabel>
            <div style={{ color, fontSize: 12.5, fontWeight: 800 }}>{p.label}</div>
          </div>
        </div>
        {a.location && (
          <div style={{ marginBottom: 10 }}>
            <FLabel>LOCATION</FLabel>
            <div style={{ color: TEXT, fontSize: 12.5, fontWeight: 600 }}>{a.location}</div>
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <FLabel>ISSUE</FLabel>
          <div style={{ color: TEXT, fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>{(a.issueTitle && a.issueTitle.trim()) || a.unit || 'Finding'}</div>
        </div>
        <div>
          <FLabel>OBSERVATIONS</FLabel>
          {(a.observationBullets && a.observationBullets.length ? a.observationBullets : splitBullets(a.description ?? '')).map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, marginTop: 4 }}>
              <span style={{ color, flexShrink: 0, lineHeight: 1.5 }}>•</span>
              <span style={{ color: TEXT, fontSize: 12, lineHeight: 1.5 }}>{b}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, color: ACCENT, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>TAP FOR DETAILS →</div>
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
  const [zoom, setZoom] = useState<string | null>(null);
  const img = photoUrl(a.imageUri);

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
    display: 'inline-block', background: CARD2, border: `1px solid ${BORDER}`, color: TEXT,
    fontSize: 12, fontWeight: 700, padding: '10px 14px', borderRadius: 10, textDecoration: 'none',
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: 20, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ background: `${color}18`, color, fontSize: 8, fontWeight: 900, letterSpacing: 1, padding: '4px 10px', borderRadius: 99, border: `1px solid ${color}44`, fontFamily: 'Roboto Mono, monospace' }}>{SEV_LABEL[sev] ?? sev.toUpperCase()}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MED, fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} onClick={() => setZoom(img)} alt={a.unit ?? 'Finding photo'} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 12, border: `1px solid ${BORDER}`, marginBottom: 14, cursor: 'zoom-in' }} />
        )}
        {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
        <h3 style={{ color: TEXT, fontSize: 17, fontWeight: 800, margin: '0 0 3px' }}>{a.unit ?? 'Finding'}</h3>
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
                <div style={{ color: TEXT, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
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
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(); }} placeholder="Is this urgent? Can I DIY it?" style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', color: TEXT, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={ask} disabled={busy || !input.trim()} style={{ background: 'rgba(33,123,232,0.10)', color: BLUE, border: '1px solid rgba(33,123,232,0.45)', borderRadius: 8, padding: '0 16px', fontWeight: 900, fontSize: 12, cursor: 'pointer', boxShadow: '0 0 14px rgba(33,123,232,0.25)', opacity: busy || !input.trim() ? 0.4 : 1 }}>{busy ? '…' : 'ASK'}</button>
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
            <div style={{ color: TEXT, fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{p.title}</div>
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
    width: '100%', background: CARD, border: `1px solid ${BORDER}`,
    borderRadius: 8, padding: '10px 12px', color: TEXT,
    fontSize: 12, outline: 'none', fontFamily: 'Inter, sans-serif',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px 20px 0 0',
        padding: 24, width: '100%', maxWidth: 430, maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ color: PURPLE, fontSize: 9, fontWeight: 900, letterSpacing: 3,
          fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>REPLACE APPLIANCE</div>
        <div style={{ color: TEXT, fontSize: 14, fontWeight: 900, marginBottom: 16 }}>
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
function ReminderCard({ r, onUpdate, access, onUnlock }: { r: Reminder; onUpdate: () => void; access: boolean; onUnlock: () => void }) {
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const overdue = r.due_date && r.due_date < today;
  const soon = r.due_date && r.due_date <= addDays(7) && !overdue;
  const dotColor = r.completed ? GREEN : overdue ? CRITICAL : soon ? WARN : ACCENT;

  const complete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!access) { onUnlock(); return; }
    setSaving(true);
    // Record the completion to the permanent service history (Carfax) before advancing the schedule.
    await supaPost('home_maintenance_log', [{ share_id: r.share_id, title: r.title, system: r.system ?? null, kind: 'service', source: 'task', reminder_id: r.id, done_date: today }]).catch(() => {});
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
          <div style={{ color: r.completed ? MED : TEXT, fontSize: 14, fontWeight: 700,
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
      padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, background: 'rgba(246,247,244,0.9)',
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
          <button onClick={onSignOut} title="Signed in to Ledrix — tap to sign out" style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${BLUE}14`, border: `1px solid ${BLUE}33`, borderRadius: 8, padding: '7px 9px', cursor: 'pointer' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: BLUE, display: 'inline-block' }} />
            <span style={{ color: BLUE, fontSize: 8, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace' }}>LEDRIX</span>
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
      <div style={{ color: DIM, fontSize: 8, fontWeight: 700, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace', marginBottom: 8 }}>LEDRIX INTELLIGENCE</div>
      <a href="https://ledrixlabs.com" style={{ color: MED, fontSize: 10, fontWeight: 600, textDecoration: 'none' }}>ledrixlabs.com</a>
    </div>
  );
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
// ─── PhotoAnalyze — homeowner snaps a photo, Ledrix analyzes it (premium) ────────
function PhotoAnalyze({ access, onUnlock, shareId }: { access: boolean; onUnlock: () => void; shareId: string }) {
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = () => { if (!access) { onUnlock(); return; } fileRef.current?.click(); };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    e.target.value = '';
    setErr(null); setResult(null); setBusy(true);
    try {
      const img = await compressPhoto(f);
      setPreview(img);
      const { data } = await supabase.auth.getSession();
      const resp = await fetch('/api/ledrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ mode: 'analyze', image: img, shareId }),
      });
      const j = await resp.json().catch(() => ({}));
      if (resp.ok && j.text) setResult(String(j.text));
      else setErr(j.error || 'Ledrix couldn’t analyze that photo.');
    } catch { setErr('Couldn’t read that photo.'); }
    setBusy(false);
  };
  const close = () => { setResult(null); setErr(null); setPreview(null); };

  return (
    <>
      <button onClick={pick} style={{ width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 15, padding: 15, fontSize: 14, fontWeight: 700, color: TEXT, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, boxShadow: '0 1px 2px rgba(16,24,28,0.03)' }}>
        <span style={{ fontSize: 17 }}>📷</span> Analyze a photo with Ledrix
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      {(busy || result || err) && (
        <div onClick={() => { if (!busy) close(); }} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(14,21,24,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: CARD, borderRadius: '20px 20px 0 0', padding: '20px 20px 28px', maxHeight: '86vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'Roboto Mono, monospace', fontSize: 10, letterSpacing: '0.16em', color: ACCENT, fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>Ledrix · Photo analysis</div>
            {preview && <img src={preview} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 12, border: `1px solid ${BORDER}`, marginBottom: 14 }} />}
            {busy
              ? <div style={{ color: MED, fontSize: 14, padding: '8px 0' }}>Ledrix is looking at your photo…</div>
              : err
              ? <div style={{ color: CRITICAL, fontSize: 14 }}>{err}</div>
              : <div style={{ color: TEXT, fontSize: 15, lineHeight: 1.6 }}>{result}</div>}
            {!busy && <button onClick={close} style={{ marginTop: 16, width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Done</button>}
          </div>
        </div>
      )}
    </>
  );
}

function HomeTab({ record, anomalies, projects, reminders, repairs, onTabChange, access, shareId, onUnlock, onAsk }: {
  record: HomeRecord; anomalies: Anomaly[];
  projects: Project[]; reminders: Reminder[]; repairs: RepairRow[];
  onTabChange: (t: Tab) => void;
  access: boolean; shareId: string; onUnlock: () => void; onAsk: () => void;
}) {
  const { score } = scoreCalc(anomalies);
  const subAddress = [record.city, record.state, record.zip].filter(Boolean).join(', ');
  const critical = anomalies.filter(a => a.severity === 'critical');
  const deficien = anomalies.filter(a => a.severity === 'anomaly');
  const prioCount = anomalies.reduce((m, a) => { const k = priorityOf(a).key; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<PrioKey, number>);
  const dueReminders = reminders.filter(r => !r.completed);
  const includedRepairs = repairs.filter(r => r.status === 'included').length;
  const urgent = critical.concat(deficien).slice(0, 3);

  // ── Stage-1 light theme tokens (Home tab is self-contained light + dark hero; other tabs stay dark until Stage 2) ──
  const P = { paper: '#F5F6F3', ink: '#0E1518', card: '#FFFFFF', text: '#16242A', muted: '#64757B', faint: '#97A4A8', line: '#E6E9E5', blue: '#1A63C8', bright: '#217BE8' };
  const SERIF = "'Iowan Old Style','Charter','Palatino Linotype',Georgia,serif";
  const MONO  = "ui-monospace,'SF Mono','Roboto Mono',Menlo,monospace";
  const cover = record.cover_url;
  const pillars: [Tab, IconName, string, number | string][] = [
    ['report', 'docs', 'Current report', ''],
    ['findings', 'findings', 'Findings', anomalies.length],
    ['repairs', 'projects', 'Repair request', includedRepairs],
    ['projects', 'projects', 'Projects', `${projects.filter(p => p.status === 'resolved').length}/${projects.length}`],
    ['reminders', 'reminders', 'Maintenance', dueReminders.length],
    ['docs', 'docs', 'Docs', '—'],
  ];

  return (
    <div style={{ background: P.paper, minHeight: '100%', color: P.text, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      {/* ── DARK HERO — cover photo, address, health ring ── */}
      <div style={{ position: 'relative', color: '#fff', overflow: 'hidden',
        background: cover
          ? `linear-gradient(180deg, rgba(10,14,16,0.30) 0%, rgba(10,14,16,0.32) 44%, rgba(8,12,14,0.86) 100%), url(${cover}) center/cover`
          : 'radial-gradient(120% 90% at 78% 8%, rgba(34,227,255,0.16), transparent 55%), linear-gradient(168deg,#1B2C34,#0E1518 62%,#0A1013)' }}>
        <div style={{ padding: '30px 20px 26px' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', color: P.bright, fontWeight: 600, textTransform: 'uppercase' }}>Your Home Record · Verified</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.01em' }}>{record.address ?? 'Address pending'}</div>
              <div style={{ fontFamily: MONO, fontSize: 11.5, color: 'rgba(255,255,255,0.74)', marginTop: 10, letterSpacing: '0.03em' }}>{subAddress ? subAddress + '  ·  ' : ''}Inspected {fmtDate(record.inspection_date)}</div>
            </div>
            <div style={{ flexShrink: 0, width: 92, height: 92, borderRadius: '50%', display: 'grid', placeItems: 'center', boxShadow: '0 0 34px rgba(34,227,255,0.18)',
              background: `conic-gradient(${P.bright} ${Math.max(0, Math.min(100, score))}%, rgba(255,255,255,0.14) 0)` }}>
              <div style={{ width: 74, height: 74, borderRadius: '50%', background: P.ink, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 700, lineHeight: 1 }}>{score}</div>
                  <div style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.18em', color: P.bright, marginTop: 2 }}>HEALTH</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── LIGHT BODY ── */}
      <div style={{ padding: '22px 18px 6px' }}>
        <button
          onClick={() => onTabChange('report')}
          aria-label="View the most recent inspection report"
          style={{ width: '100%', padding: 0, border: 'none', cursor: 'pointer', borderRadius: 16, overflow: 'hidden', display: 'block', textAlign: 'left', boxShadow: '0 12px 30px -14px rgba(0,0,0,0.45)' }}
        >
          <div style={{
            position: 'relative', minHeight: 172, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '18px 18px 16px',
            background: record.cover_url
              ? `linear-gradient(180deg, rgba(6,14,16,0.12) 0%, rgba(6,14,16,0.55) 58%, rgba(6,14,16,0.88) 100%), url(${record.cover_url}) center/cover`
              : 'linear-gradient(150deg,#12333C,#0C1E24)',
          }}>
            <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.2em', color: P.bright, marginBottom: 7 }}>INSPECTION REPORT</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.1 }}>View Recent Report</div>
                <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11.5, fontWeight: 600, marginTop: 4 }}>
                  {record.inspection_date ? `Inspected ${fmtDate(record.inspection_date)}` : 'Your full inspection report'}
                </div>
              </div>
              <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: P.bright, color: '#04121a', display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 900 }}>→</div>
            </div>
          </div>
        </button>
      </div>

      {/* Ask Ledrix — dark premium card with the VAL orb (opens the assistant) */}
      <div style={{ margin: '14px 18px 0' }}>
        <div style={{ background: 'linear-gradient(150deg,#12333C,#0C1E24)', borderRadius: 18, padding: '20px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onAsk} aria-label="Ask Ledrix" style={{ flexShrink: 0, width: 62, height: 62, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
            background: 'radial-gradient(circle at 50% 38%, #123840, #0a1e24)', boxShadow: '0 0 0 1px rgba(34,227,255,0.4), 0 0 26px rgba(34,227,255,0.35)' }}>
            <ValMark size={40} color="#217BE8" sheen />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600 }}>Ask Ledrix about your home</div>
            <div style={{ color: 'rgba(255,255,255,0.66)', fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>Is it urgent? Can I DIY it? What should I budget? Get answers drawn straight from your home.</div>
          </div>
        </div>
      </div>

      {/* Analyze a photo — homeowner vision (premium) */}
      <div style={{ margin: '10px 18px 0' }}>
        <PhotoAnalyze access={access} onUnlock={onUnlock} shareId={shareId} />
      </div>

      {/* Ledrix analysis — the AI intelligence layer (premium; locked teaser when not) */}
      <div style={{ margin: '14px 18px 0' }}>
        <InsightSection access={access} shareId={shareId} onUnlock={onUnlock} />
      </div>

      {/* Needs attention — top safety/major, light cards */}
      {urgent.length > 0 && (
        <div style={{ padding: '18px 18px 2px' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', color: PRIO.major.report, fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Needs attention</div>
          {urgent.map((a, i) => {
            const pr = priorityOf(a);
            return (
            <div key={i} onClick={() => onTabChange('findings')} style={{ background: P.card, border: `1px solid ${P.line}`, borderLeft: `3px solid ${pr.report}`, borderRadius: 12, padding: '12px 15px', marginBottom: 8, cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,28,0.03)' }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: pr.report, fontWeight: 700, textTransform: 'uppercase' }}>{pr.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{a.unit ?? 'Component'}{a.location ? ` · ${a.location}` : ''}</div>
              <div style={{ color: '#33454B', fontSize: 13, lineHeight: 1.5, marginTop: 3 }}>{(a.description ?? '').substring(0, 96)}{(a.description?.length ?? 0) > 96 ? '…' : ''}</div>
            </div>
            );
          })}
        </div>
      )}

      {/* Section tiles */}
      <div style={{ padding: '16px 18px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {pillars.map(([tab, icon, label, count]) => (
            <button key={tab} onClick={() => onTabChange(tab)} style={{ background: P.card, border: `1px solid ${P.line}`, borderRadius: 15, padding: '17px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 11, boxShadow: '0 1px 2px rgba(16,24,28,0.03)' }}>
              <Icon name={icon} size={20} color={P.blue} />
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
                {count !== '' && <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: P.blue }}>{count}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* The Carfax line */}
      <div style={{ margin: '4px 18px 20px', display: 'flex', alignItems: 'center', gap: 11, background: '#EAF6F6', border: '1px solid #CFE7E9', borderRadius: 13, padding: '13px 15px' }}>
        <Icon name="docs" size={16} color={P.blue} />
        <p style={{ color: '#2A4247', fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
          <b style={{ color: P.blue }}>The Carfax of your home.</b> A living record — inspection baseline plus every service you log — that transfers to every future owner.
        </p>
      </div>

      {/* Ethix — your data, your call (the values surface; dark card echoes the hero) */}
      <div onClick={() => onTabChange('ethix')} style={{ margin: '0 18px 22px', cursor: 'pointer', background: 'linear-gradient(135deg, #0B2A30, #06181C)', border: '1px solid rgba(11,143,166,0.4)', borderRadius: 16, padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 13, boxShadow: '0 3px 14px rgba(6,24,28,0.18)' }}>
        <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: 'rgba(33,123,232,0.10)', border: '1px solid rgba(33,123,232,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#217BE8', fontSize: 18, fontWeight: 800 }}>◇</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#EAF7F9', fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>Ethix</span>
            <span style={{ fontFamily: 'Roboto Mono, monospace', fontSize: 8, letterSpacing: '0.14em', color: '#217BE8', border: '1px solid rgba(33,123,232,0.32)', borderRadius: 5, padding: '2px 6px' }}>YOUR DATA, YOUR CALL</span>
          </div>
          <p style={{ color: '#9FC2C8', fontSize: 12, lineHeight: 1.5, margin: '4px 0 0' }}>Your home data is yours. Opt in, choose what&apos;s shared, keep what it earns — and it&apos;s never personal.</p>
        </div>
        <span style={{ color: '#217BE8', fontSize: 20, flexShrink: 0 }}>›</span>
      </div>

      <Footer />
    </div>
  );
}

// ─── ETHIX TAB — the user-owned data program (opt-in, category control, $0 dashboard) ──
function EthixTab({ access, onUnlock }: { access: boolean; onUnlock: () => void }) {
  const [consent, setConsent] = useState<{ opted_in: boolean; categories: string[]; earned_cents: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const MONO = 'Roboto Mono, monospace';

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? '';

  const load = useCallback(async () => {
    if (!access) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/ethix', { headers: { Authorization: `Bearer ${await token()}` } });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.consent) setConsent(j.consent);
    } catch { /* noop */ }
    setLoading(false);
  }, [access]);
  useEffect(() => { load(); }, [load]);

  const optedIn = !!consent?.opted_in;
  const cats = new Set(consent?.categories ?? []);

  const save = async (opted_in: boolean, categories: string[]) => {
    if (!access) { onUnlock(); return; }
    setConsent({ opted_in, categories, earned_cents: consent?.earned_cents ?? 0 });   // optimistic
    setSaving(true);
    try {
      const r = await fetch('/api/ethix', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ opted_in, categories }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.consent) setConsent(j.consent);
    } catch { /* noop */ }
    setSaving(false);
  };

  const toggleCat = (k: string) => {
    const next = new Set(cats);
    if (next.has(k)) next.delete(k); else next.add(k);
    save(true, Array.from(next));
  };

  return (
    <div style={{ padding: '18px 18px 40px' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', color: ACCENT, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Ethix · your data, your call</div>
      <h2 style={{ color: TEXT, fontSize: 22, fontWeight: 800, letterSpacing: -0.4, margin: '0 0 8px' }}>Your data is yours.</h2>
      <p style={{ color: MED, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px' }}>Opt in to share only anonymized, aggregate signals about your home — never anything personal — and keep what it earns. Ledrix already makes its money on your subscription, so this isn&apos;t ours to profit from. <a href="/ethix" target="_blank" rel="noopener" style={{ color: ACCENT, fontWeight: 700 }}>How Ethix works ›</a></p>

      {!access ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 15, padding: 18, textAlign: 'center' }}>
          <p style={{ color: MED, fontSize: 14, lineHeight: 1.6, margin: '0 0 14px' }}>Sign in to set your Ethix preferences. It&apos;s tied to your account, so only you can change it.</p>
          <button onClick={onUnlock} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Sign in</button>
        </div>
      ) : loading ? (
        <div style={{ color: MED, fontSize: 14, padding: '20px 0' }}>Loading your preferences…</div>
      ) : (
        <>
          <div style={{ background: CARD, border: `1px solid ${optedIn ? 'rgba(11,143,166,0.4)' : BORDER}`, borderRadius: 15, padding: 16, display: 'flex', alignItems: 'center', gap: 13, boxShadow: '0 1px 2px rgba(16,24,28,0.03)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>Share anonymized home data</div>
              <div style={{ color: MED, fontSize: 12.5, marginTop: 3 }}>{optedIn ? 'On — you’re sharing the categories below.' : 'Off — nothing is shared.'}</div>
            </div>
            <button onClick={() => optedIn ? save(false, []) : save(true, ETHIX_CATEGORY_KEYS)} aria-pressed={optedIn}
              style={{ flexShrink: 0, width: 52, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer', background: optedIn ? ACCENT : '#CBD5D8', position: 'relative', transition: 'background 0.15s' }}>
              <span style={{ position: 'absolute', top: 3, left: optedIn ? 25 : 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
          </div>

          {optedIn && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', color: MED, fontWeight: 700, textTransform: 'uppercase', margin: '22px 0 10px' }}>What you share</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {ETHIX_CATEGORIES.map(c => {
                  const on = cats.has(c.key);
                  return (
                    <div key={c.key} onClick={() => toggleCat(c.key)} style={{ background: CARD, border: `1px solid ${on ? 'rgba(11,143,166,0.4)' : BORDER}`, borderRadius: 13, padding: 14, cursor: 'pointer', display: 'flex', gap: 12 }}>
                      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${on ? ACCENT : '#CBD5D8'}`, background: on ? ACCENT : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, marginTop: 1 }}>{on ? '✓' : ''}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{c.label}</div>
                        <div style={{ color: MED, fontSize: 12, lineHeight: 1.5, marginTop: 3 }}><b style={{ color: GREEN, fontWeight: 700 }}>Shared:</b> {c.shares}</div>
                        <div style={{ color: DIM, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}><b style={{ fontWeight: 700 }}>Never:</b> {c.never}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: '#EAF6F6', border: '1px solid #CFE7E9', borderRadius: 14, padding: 16, marginTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ color: '#2A4247', fontSize: 13, fontWeight: 700 }}>Earned so far</span>
                  <span style={{ color: ACCENT, fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>$0.00</span>
                </div>
                <p style={{ color: '#3C575C', fontSize: 12, lineHeight: 1.55, margin: '8px 0 0' }}>Nothing is being sold yet — we&apos;re building this carefully. Your choice is saved, and we&apos;ll ask you again before a single dollar ever changes hands. You&apos;ll see every cent.</p>
              </div>

              <button onClick={() => save(false, [])} style={{ width: '100%', marginTop: 14, background: 'none', border: `1px solid ${BORDER}`, color: MED, borderRadius: 12, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Turn off &amp; stop sharing</button>
            </>
          )}
        </>
      )}
      {saving && <div style={{ color: DIM, fontSize: 11, textAlign: 'center', marginTop: 12 }}>Saving…</div>}
    </div>
  );
}

// ─── FINDINGS TAB ─────────────────────────────────────────────────────────────
function FindingsTab({ anomalies, record, shareId }: { anomalies: Anomaly[]; record: HomeRecord; shareId: string }) {
  const [filter, setFilter] = useState<'all' | PrioKey>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'priority' | 'system' | 'room'>('priority');
  const [specsOpen, setSpecsOpen] = useState(false);

  const prioCount = anomalies.reduce((m, a) => { const k = priorityOf(a).key; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<PrioKey, number>);

  const filtered = anomalies.filter(a => {
    if (filter !== 'all' && priorityOf(a).key !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (a.unit ?? '').toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q) || (a.location ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  // Sort: priority = flat, worst-first. system/room = grouped by that field, each
  // group sorted by priority within (so "both" — focus a trade, worst items first).
  const byPriority = (x: Anomaly, y: Anomaly) => priorityOf(x).rank - priorityOf(y).rank;
  const flatSorted = filtered.slice().sort(byPriority);
  const groups = sort === 'priority' ? null : (() => {
    const m = new Map<string, Anomaly[]>();
    for (const a of filtered) {
      const k = ((sort === 'system' ? a.unit : a.location) || '').trim() || (sort === 'system' ? 'Other' : 'Unspecified');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return Array.from(m.entries())
      .map(([key, items]) => ({ key, items: items.slice().sort(byPriority) }))
      .sort((a, b) => (a.items[0] ? priorityOf(a.items[0]).rank : 9) - (b.items[0] ? priorityOf(b.items[0]).rank : 9));
  })();

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 14 }}>FINDINGS</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
        {(([['all', 'All', anomalies.length, TEXT]] as ['all' | PrioKey, string, number, string][])
          .concat(PRIO_ORDER.filter(k => (prioCount[k] ?? 0) > 0).map(k => [k, PRIO_SHORT[k], prioCount[k], PRIO[k].color]))
        ).map(([key, label, count, c]) => (
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
          padding: '10px 12px 10px 30px', color: TEXT, fontSize: 12, outline: 'none',
          fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
        }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        <span style={{ color: DIM, fontSize: 9, fontWeight: 900, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace', flexShrink: 0 }}>SORT</span>
        {(['priority', 'system', 'room'] as const).map(key => (
          <button key={key} onClick={() => setSort(key)} style={{
            background: sort === key ? `${ACCENT}20` : CARD, border: `1px solid ${sort === key ? ACCENT + '55' : BORDER}`,
            color: sort === key ? ACCENT : DIM, borderRadius: 99, padding: '6px 14px', fontSize: 9,
            fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'capitalize',
          }}>{key}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: DIM }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: filter === 'all' ? GREEN : DIM, fontFamily: 'Roboto Mono, monospace' }}>
            {filter === 'all' ? 'NO FINDINGS LOGGED' : `NO ${filter.toUpperCase()} FINDINGS`}
          </div>
        </div>
      ) : sort === 'priority' ? (
        flatSorted.map((a, i) => (
          <FindingCard key={a.id ?? i} a={a} zip={record.zip} cityState={[record.city, record.state].filter(Boolean).join(', ')} shareId={shareId} />
        ))
      ) : (
        (groups ?? []).map(g => (
          <div key={g.key} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 2px 8px' }}>
              <span style={{ color: ACCENT, fontSize: 10, fontWeight: 900, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace', textTransform: sort === 'system' ? 'uppercase' : 'none' }}>{g.key}</span>
              <span style={{ color: DIM, fontSize: 10, fontWeight: 700 }}>({g.items.length})</span>
            </div>
            {g.items.map((a, i) => (
              <FindingCard key={a.id ?? `${g.key}-${i}`} a={a} zip={record.zip} cityState={[record.city, record.state].filter(Boolean).join(', ')} shareId={shareId} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

// ─── PROJECTS TAB ─────────────────────────────────────────────────────────────
function ProjectsTab({ projects, anomalies, shareId, address, onRefresh }: { projects: Project[]; anomalies: Anomaly[]; shareId: string; address?: string; onRefresh: () => void }) {
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const open   = projects.filter(p => p.status !== 'resolved');
  const shown  = statusFilter === 'open' ? open : projects;
  const resolved = projects.filter(p => p.status === 'resolved').length;
  const existingTitles = new Set(projects.map(p => (p.title ?? '').trim().toLowerCase()));
  const fromFindings = anomalies.filter(a => !existingTitles.has((a.description ?? '').trim().slice(0, 100).toLowerCase()));

  const addManual = async () => {
    const t = title.trim(); if (!t || busy) return;
    setBusy(true);
    await supaPost('home_projects', { share_id: shareId, title: t.slice(0, 100), status: 'identified', photos: [], seeded: false });
    setTitle(''); setBusy(false); onRefresh();
  };
  const addFromFinding = async (a: Anomaly) => {
    if (busy) return;
    setBusy(true);
    await supaPost('home_projects', {
      share_id: shareId, title: (a.description ?? 'Finding').slice(0, 100), system: a.unit ?? null,
      priority: a.severity === 'critical' ? 'critical' : a.severity === 'anomaly' ? 'high' : 'low',
      status: 'identified', description: a.description ?? null, recommendation: a.recommendation ?? null,
      budget_estimate: a.estimatedCost ?? null, contractor_type: a.prosToCall ?? null, photos: [], seeded: false,
    });
    setBusy(false); onRefresh();
  };

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
      {/* Add a project — manually or from a finding */}
      <button onClick={() => setShowAdd(v => !v)} style={{ width: '100%', background: showAdd ? CARD : `${ACCENT}12`, border: `1px solid ${showAdd ? BORDER : ACCENT + '44'}`, color: ACCENT, borderRadius: 11, padding: 12, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, cursor: 'pointer', marginBottom: 12 }}>{showAdd ? 'Close' : '+ Add a project'}</button>
      {showAdd && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 13, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: fromFindings.length ? 14 : 0 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManual()} placeholder="New project…" style={{ flex: 1, background: BG, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px', color: TEXT, fontSize: 13, outline: 'none' }} />
            <button onClick={addManual} disabled={busy || !title.trim()} style={{ background: ACCENT, color: '#04121a', border: 'none', borderRadius: 9, padding: '0 16px', fontSize: 12, fontWeight: 800, cursor: title.trim() ? 'pointer' : 'default', opacity: title.trim() ? 1 : 0.5 }}>Add</button>
          </div>
          {fromFindings.length > 0 && (
            <>
              <div style={{ color: DIM, fontSize: 9, fontWeight: 900, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace', marginBottom: 4 }}>OR ADD FROM A FINDING</div>
              {fromFindings.slice(0, 40).map((a, i) => (
                <div key={a.id ?? i} onClick={() => addFromFinding(a)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${BORDER}33`, cursor: 'pointer' }}>
                  <span style={{ color: priorityOf(a).color, fontSize: 16, flexShrink: 0, lineHeight: 1 }}>+</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: TEXT, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.unit ?? 'Finding'}</div>
                    <div style={{ color: DIM, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description ?? ''}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: DIM }}>
          {projects.length === 0
            ? <div style={{ fontSize: 12, lineHeight: 1.7 }}>No projects yet.<br />Add one above, or pull from a finding.</div>
            : <><div style={{ fontSize: 22, marginBottom: 8 }}>✓</div><div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, color: GREEN, fontFamily: 'Roboto Mono, monospace' }}>ALL PROJECTS RESOLVED</div></>}
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
  const p = priorityOf(a);
  const color = p.report;
  const label = p.label;
  const desc  = (a.description ?? '').replace(/^LOCATION:.*\n?/i, '').trim();
  return (
    <div style={{ background: '#fff', border: '1px solid #eef0f3', borderLeft: `4px solid ${color}`, borderRadius: 12, padding: 16, marginBottom: 12, display: 'flex', gap: 14, boxShadow: '0 1px 3px rgba(16,24,40,0.04)' }}>
      {photoUrl(a.imageUri) ? <img src={photoUrl(a.imageUri)!} alt="" style={{ width: 104, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
          <span style={{ background: `${color}14`, color, border: `1px solid ${color}33`, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: '3px 9px', borderRadius: 6 }}>{label}</span>
          {isSafetyFinding(a) ? <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 6 }}>⚠ SAFETY</span> : null}
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
  const byKey = new Map<PrioKey, Anomaly[]>();
  for (const a of anomalies) {
    const k = priorityOf(a).key;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(a);
  }
  return (
    <div>
      {PRIO_ORDER.filter(k => byKey.has(k)).map(k => {
        const color = PRIO[k].report;
        return (
        <section key={k} style={{ paddingTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color, margin: '0 0 8px', borderBottom: `2px solid ${color}`, paddingBottom: 6 }}>{PRIO[k].label} <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>({byKey.get(k)!.length})</span></h2>
          {byKey.get(k)!.map((a, j) => (
            <div key={a.id ?? j} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: `1px solid ${C.line}` }}>
              <span style={{ width: 14, flexShrink: 0, color: '#dc2626', fontSize: 12 }}>{isSafetyFinding(a) ? '⚠' : ''}</span>
              <span style={{ fontWeight: 700, color: C.ink, fontSize: 13, minWidth: 110, flexShrink: 0 }}>{reportSystem(a)}</span>
              <span style={{ color: '#4b5563', fontSize: 13, flex: 1 }}>{a.unit ? `${a.unit} — ` : ''}{(a.description ?? '').replace(/^LOCATION:.*\n?/i, '').trim().slice(0, 130)}</span>
            </div>
          ))}
        </section>
        );
      })}
    </div>
  );
}
// "What Matters" — the free triage: Safety + Immediate items, plain-language, with the Ledrix Insight
// upsell anchored right here (the homeowner just saw the brain work). Built from inspector-CONFIRMED
// findings only — Ledrix surfaces + explains, it doesn't invent.
function WhatMatters({ anomalies, C, onOpen }: { anomalies: Anomaly[]; C: RC; onOpen: () => void }) {
  const matters = anomalies.filter(a => isSafetyFinding(a) || a.severity === 'critical')
    .sort((x, y) => (isSafetyFinding(y) ? 1 : 0) - (isSafetyFinding(x) ? 1 : 0) || prioRank(x.severity) - prioRank(y.severity));
  const rest = anomalies.length - matters.length;
  return (
    <section style={{ paddingTop: 24 }}>
      <div style={{ background: 'linear-gradient(160deg,#fffaf2,#fff7ed)', border: '1px solid #fde4c8', borderRadius: 14, padding: 20, boxShadow: '0 2px 14px rgba(180,120,40,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>What Matters</span>
          <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>— {matters.length} thing{matters.length !== 1 ? 's' : ''} Ledrix flagged</span>
        </div>
        {matters.length === 0 ? (
          <div style={{ color: '#16a34a', fontSize: 14, fontWeight: 600 }}>✓ No safety or immediate-attention items — nothing urgent.</div>
        ) : matters.map((a, i) => {
          const safety = isSafetyFinding(a);
          const desc = (a.description ?? '').replace(/^LOCATION:.*\n?/i, '').trim();
          return (
            <div key={a.id ?? i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: i ? '1px solid #fde3c4' : 'none' }}>
              <span style={{ flexShrink: 0, color: safety ? PRIO.safety.report : PRIO.major.report, fontWeight: 800, fontSize: 10, letterSpacing: 0.3, paddingTop: 3, width: 88 }}>{safety ? '⚠ SAFETY' : PRIO.major.label}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.ink, fontSize: 14, fontWeight: 700 }}>{a.unit ?? 'Finding'}</div>
                <div style={{ color: '#4b5563', fontSize: 13, lineHeight: 1.5 }}>{desc.slice(0, 170)}{desc.length > 170 ? '…' : ''}</div>
                {(a.estimatedCost || a.prosToCall) ? <div style={{ color: C.accent, fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{[a.estimatedCost, a.prosToCall].filter(Boolean).join(' · ')}</div> : null}
              </div>
            </div>
          );
        })}
        {rest > 0 ? <div style={{ color: C.sub, fontSize: 13, marginTop: 12, fontWeight: 600 }}>✓ {rest} more item{rest !== 1 ? 's' : ''} below — all Repair / Maintenance, not urgent.</div> : null}
        <button onClick={onOpen} style={{ marginTop: 18, width: '100%', background: 'linear-gradient(135deg,#0891b2,#0e7490)', color: '#fff', border: 'none', borderRadius: 12, padding: '15px 18px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 6px 20px rgba(8,145,178,0.22)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>🔓 Ask Ledrix about your home<span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.95 }}>Unlock Insight →</span></div>
          <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 4, lineHeight: 1.45 }}>“Will the furnace make it another winter?” · cost projections · maintenance plan · ask anything</div>
        </button>
      </div>
    </section>
  );
}
// Renders the app's published report HTML inline via a same-origin srcDoc iframe (isolated styles),
// auto-sizing to its content so it reads as one continuous page, not a scroll-in-scroll.
function FullReportFrame({ doc, frameRef, onSections, title = 'Inspection Report' }: { doc: string; frameRef?: { current: HTMLIFrameElement | null }; onSections?: (ids: string[]) => void; title?: string }) {
  const innerRef = useRef<HTMLIFrameElement>(null);
  const ref = frameRef ?? innerRef;
  const fit = () => {
    const f = ref.current;
    try {
      const cw = f?.contentWindow;
      if (!f || !cw) return;
      f.style.height = (cw.document.documentElement.scrollHeight + 16) + 'px';
      onSections?.(Array.from(cw.document.querySelectorAll('[id^="sec-"]')).map(e => (e as HTMLElement).id));
    } catch { /* cross-origin guard — srcDoc is same-origin so this is just defensive */ }
  };
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <iframe ref={ref} srcDoc={doc} onLoad={fit} title={title}
        style={{ width: '100%', border: 'none', display: 'block', minHeight: 200, background: '#fff' }} />
    </div>
  );
}
function ReportTab({ anomalies, record, onTabChange }: { anomalies: Anomaly[]; record: HomeRecord; onTabChange: (t: Tab) => void }) {
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

  // Path A: the Full Report is the app's REAL report HTML (the exact thing that becomes the PDF),
  // published to storage. Fetch it; if present, render the complete report + hide the reconstructed
  // sidebar. If not published yet, fall back to the system-grouped reconstruction below.
  const [doc, setDoc] = useState<string | null | 'none'>(null);
  // Signed via /api/report-asset so it resolves whether the inspection-pdfs bucket is public
  // or private (fetch below follows the 302 redirect and reads the HTML text).
  const reportUrl = record.share_id
    ? `/api/report-asset?path=${encodeURIComponent(`${record.share_id}/report.html`)}`
    : '';
  useEffect(() => {
    if (!reportUrl) { setDoc('none'); return; }
    let alive = true;
    fetch(reportUrl).then(r => (r.ok ? r.text() : Promise.reject(r.status)))
      .then(t => { if (alive) setDoc(t && t.length > 300 ? t : 'none'); })
      .catch(() => { if (alive) setDoc('none'); });
    return () => { alive = false; };
  }, [reportUrl]);
  const reportReady = typeof doc === 'string' && doc !== 'none';

  // Live ToC sidebar: the report HTML carries sec-* anchors; we render it in a same-origin srcDoc
  // iframe, so the left rail can scroll the parent page to any section. onSections reports which
  // anchors actually exist so the rail only lists real sections.
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [secIds, setSecIds] = useState<string[]>([]);
  const REPORT_TOC: { id: string; label: string }[] = [
    { id: 'sec-profile',     label: 'Home Profile' },
    { id: 'sec-coverage',    label: 'Systems Coverage' },
    { id: 'sec-summary',     label: 'Executive Summary' },
    { id: 'sec-systems',     label: 'Systems Assessment' },
    { id: 'sec-findings',    label: 'Findings & Recommendations' },
    { id: 'sec-limitations', label: 'Scope & Limitations' },
    { id: 'sec-homeapp',     label: 'Your Home App' },
    { id: 'sec-evidence',    label: 'Photo Documentation' },
    { id: 'sec-sop',         label: 'Standards of Practice' },
    { id: 'sec-cert',        label: 'Certification' },
  ];
  const toc = REPORT_TOC.filter(t => secIds.length === 0 || secIds.includes(t.id));
  // Auto-height iframe doesn't scroll itself — scroll the PARENT to the section's absolute Y.
  const jumpIn = (id: string) => {
    const f = frameRef.current;
    const d = f?.contentWindow?.document;
    const el = d?.getElementById(id);
    if (!f || !d || !el) return;
    const frameTop = f.getBoundingClientRect().top + window.scrollY;
    const elTop = el.getBoundingClientRect().top - d.body.getBoundingClientRect().top;
    window.scrollTo({ top: frameTop + elTop - 8, behavior: 'smooth' });
  };

  // Cover-first: split the report into [cover page] and [everything after] (parsed from the same
  // HTML — no duplication) so the What Matters panel can sit BETWEEN them. Falls back to one frame.
  const split = useMemo(() => {
    if (!reportReady || typeof doc !== 'string') return null;
    try {
      const d = new DOMParser().parseFromString(doc, 'text/html');
      const pages = Array.from(d.querySelectorAll('.page'));
      if (pages.length < 2) return null;
      const head = d.head.innerHTML;
      const wrap = (inner: string) => `<!doctype html><html><head>${head}</head><body>${inner}</body></html>`;
      return { cover: wrap(pages[0].outerHTML), body: wrap(pages.slice(1).map(p => p.outerHTML).join('')) };
    } catch { return null; }
  }, [doc, reportReady]);

  return (
    <div className="rpt">
      {!reportReady && (
      <div className="rpt-hero" style={{ position: 'relative', minHeight: 260, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '28px 28px 24px', background: record.cover_url ? `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.72) 100%), url(${record.cover_url}) center/cover` : 'linear-gradient(160deg,#1e293b,#0f172a)' }}>
        <div style={{ color: '#fff', fontSize: 30, fontWeight: 800, lineHeight: 1.08, letterSpacing: -0.5 }}>{record.address ?? 'Property'}</div>
        <div style={{ color: '#e5e7eb', fontSize: 15, marginTop: 4 }}>{sub}{record.inspection_date ? ` · ${fmtDate(record.inspection_date)}` : ''}</div>
        {(record.inspector || record.company) ? (
          <div style={{ position: 'absolute', right: 24, bottom: 24, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(6px)', borderRadius: 999, padding: '8px 18px 8px 10px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 18px rgba(0,0,0,0.28)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 19, background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{(record.inspector ?? 'I').slice(0, 1).toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 8, color: C.sub, letterSpacing: 1, fontWeight: 800 }}>INSPECTOR</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{record.inspector ?? '—'}</div>
              {record.company ? <div style={{ fontSize: 11, color: C.sub }}>{record.company}</div> : null}
            </div>
          </div>
        ) : null}
      </div>
      )}
      <aside className="rpt-side">{reportReady ? (
        <>
          <div style={{ padding: '20px 18px 12px', fontSize: 10, fontWeight: 800, letterSpacing: 2.5, color: C.accent, fontFamily: 'Roboto Mono, monospace' }}>CONTENTS</div>
          {toc.map((t, i) => (
            <button key={t.id} onClick={() => jumpIn(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${C.line}`, padding: '12px 18px', color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: 'Roboto Mono, monospace', color: C.accent, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ flex: 1 }}>{t.label}</span>
            </button>
          ))}
        </>
      ) : (<>
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
      </>)}</aside>

      <div className="rpt-main" style={{ color: C.ink }}>
        <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #eef0f3', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', position: 'sticky', top: 0, zIndex: 4 }}>
          {(['full', 'summary'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: view === v ? C.accent : '#f1f5f9', color: view === v ? '#fff' : C.sub, border: 'none', fontSize: 12, fontWeight: 800, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', boxShadow: view === v ? `0 2px 10px ${C.accent}40` : 'none' }}>
              {v === 'full' ? 'Full Report' : 'Summary'}
            </button>
          ))}
          <span style={{ marginLeft: 'auto' }} />
          {pdfHref(record) ? <a href={pdfHref(record)!} target="_blank" rel="noreferrer" style={{ background: '#f1f5f9', color: C.ink, border: 'none', fontSize: 12, fontWeight: 800, padding: '8px 14px', borderRadius: 8, textDecoration: 'none' }}>⤓ PRINT / PDF</a> : null}
        </div>

        <div style={{ padding: '0 24px 90px', background: '#fff' }}>
          {view === 'summary' ? (
            <>
              <WhatMatters anomalies={anomalies} C={C} onOpen={() => onTabChange('home')} />
              <ReportSummary anomalies={anomalies} C={C} />
            </>
          ) : reportReady ? (
            <>
              {split && <FullReportFrame doc={split.cover} title="Report Cover" />}
              <WhatMatters anomalies={anomalies} C={C} onOpen={() => onTabChange('home')} />
              <FullReportFrame doc={split ? split.body : (doc as string)} frameRef={frameRef} onSections={setSecIds} />
            </>
          ) : doc === null ? (
            <>
              <WhatMatters anomalies={anomalies} C={C} onOpen={() => onTabChange('home')} />
              <div style={{ color: C.sub, fontSize: 14, textAlign: 'center', padding: '64px 0' }}>Loading the full report…</div>
            </>
          ) : (
            <>
              <WhatMatters anomalies={anomalies} C={C} onOpen={() => onTabChange('home')} />
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
              {sections.length === 0 ? (
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── LogServiceForm — quick manual entry into the service history (Carfax) ───────
function LogServiceForm({ shareId, onSaved, access, onUnlock }: { shareId: string; onSaved: () => void; access: boolean; onUnlock: () => void }) {
  const [open, setOpen]     = useState(false);
  const [title, setTitle]   = useState('');
  const [system, setSystem] = useState('');
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const inp: React.CSSProperties = { width: '100%', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 13px', color: TEXT, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await supaPost('home_maintenance_log', [{ share_id: shareId, title: title.trim(), system: system.trim() || null, kind: 'service', note: note.trim() || null, done_date: date, source: 'manual' }]).catch(() => {});
    setTitle(''); setSystem(''); setNote(''); setSaving(false); setOpen(false); onSaved();
  };
  if (!open) return (
    <button onClick={() => access ? setOpen(true) : onUnlock()} style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 13, padding: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>+ Log a service or improvement</button>
  );
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 15, padding: 16, boxShadow: '0 1px 2px rgba(16,24,28,0.04)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Log a service or improvement</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What was done? e.g. New roof installed" style={inp} />
        <div style={{ display: 'flex', gap: 9 }}>
          <input value={system} onChange={e => setSystem(e.target.value)} placeholder="System (Roof, HVAC…)" style={{ ...inp, flex: 1 }} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, flex: 1 }} />
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note — contractor, cost, warranty (optional)" style={inp} />
        <div style={{ display: 'flex', gap: 9, marginTop: 4 }}>
          <button onClick={() => setOpen(false)} style={{ flex: 1, background: 'none', border: `1px solid ${BORDER}`, color: MED, borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving || !title.trim()} style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: title.trim() ? 1 : 0.5 }}>{saving ? 'Saving…' : 'Add to home record'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAINTENANCE TAB — spec-driven schedule + the Carfax service history ────────
function RemindersTab({ reminders, log, shareId, onRefresh, access, onUnlock }: { reminders: Reminder[]; log: MaintenanceLog[]; shareId: string; onRefresh: () => void; access: boolean; onUnlock: () => void }) {
  const [showCompleted, setShowCompleted] = useState(false);
  const pending   = reminders.filter(r => !r.completed);
  const completed = reminders.filter(r => r.completed);
  const shown     = showCompleted ? reminders : pending;
  const MONO = 'Roboto Mono, monospace';

  return (
    <div style={{ padding: '18px 18px 28px' }}>
      <LogServiceForm shareId={shareId} onSaved={onRefresh} access={access} onUnlock={onUnlock} />

      {/* Upcoming schedule — built from THIS home's specs (Stage 3a) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 12px' }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', color: MED, fontWeight: 700, textTransform: 'uppercase' }}>Upcoming maintenance</div>
        {completed.length > 0 && (
          <button onClick={() => setShowCompleted(v => !v)} style={{ background: 'none', border: `1px solid ${BORDER}`, color: MED, borderRadius: 8, padding: '5px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{showCompleted ? 'Hide done' : `+${completed.length} done`}</button>
        )}
      </div>
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '26px 0', color: MED, fontSize: 14 }}>All caught up.</div>
      ) : shown.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1;
      }).map(r => <ReminderCard key={r.id} r={r} onUpdate={onRefresh} access={access} onUnlock={onUnlock} />)}

      {/* Service history — the living Carfax timeline */}
      {log.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', color: MED, fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>Service history · {log.length}</div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '4px 16px', boxShadow: '0 1px 2px rgba(16,24,28,0.03)' }}>
            {log.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', gap: 12, padding: '13px 0', borderBottom: i < log.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: ACCENT, fontWeight: 700, flexShrink: 0, width: 66, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(e.done_date)}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{e.title}</div>
                  {(e.system || e.note) && <div style={{ fontSize: 12, color: MED, marginTop: 2 }}>{[e.system, e.note].filter(Boolean).join(' · ')}</div>}
                </div>
                {e.source === 'voice' && <div style={{ fontFamily: MONO, fontSize: 8, color: MED, flexShrink: 0, alignSelf: 'center' }}>VOICE</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DOCS TAB ─────────────────────────────────────────────────────────────────

function DocsTab({ record }: { record: HomeRecord }) {
  const shareId = record.share_id;
  const subAddress = [record.city, record.state, record.zip].filter(Boolean).join(', ');
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [openCat, setOpenCat] = useState<null | 'reports' | 'manual' | 'document'>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadDocs = useCallback(async () => {
    setDocs(await supaGet<any>(`home_documents?share_id=eq.${encodeURIComponent(shareId)}&order=created_at.desc`));
  }, [shareId]);
  useEffect(() => { loadDocs(); }, [loadDocs]);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; e.target.value = '';
    const kind = openCat === 'manual' ? 'manual' : 'document';
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('shareId', shareId);
      const r = await fetch('/api/docs', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) { await supaPost('home_documents', [{ share_id: shareId, name: j.name, url: j.url, path: j.path, kind, size: j.size }]); await loadDocs(); }
    } catch { /* noop */ }
    setUploading(false);
  };
  const removeDoc = async (d: any) => { await supaDelete('home_documents', `id=eq.${d.id}`); await loadDocs(); };

  const manuals   = docs.filter(d => d.kind === 'manual');
  const documents = docs.filter(d => d.kind !== 'manual' && d.kind !== 'report');
  const hasReport = !!pdfHref(record);

  // ── Category detail — open a tile to list + manage its items ──
  if (openCat) {
    const label = openCat === 'reports' ? 'Inspection Reports' : openCat === 'manual' ? 'Manuals' : 'Documents';
    const items = openCat === 'manual' ? manuals : openCat === 'document' ? documents : [];
    return (
      <div style={{ padding: '16px 16px 0' }}>
        <button onClick={() => setOpenCat(null)} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 10, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', padding: '2px 0', marginBottom: 12, fontFamily: 'Roboto Mono, monospace' }}>← DOCS</button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ color: ACCENT, fontSize: 12, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace' }}>{label.toUpperCase()}</div>
          {openCat !== 'reports' && (
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, color: ACCENT, borderRadius: 9, padding: '8px 12px', fontSize: 9, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', cursor: uploading ? 'default' : 'pointer' }}>{uploading ? 'UPLOADING…' : '+ UPLOAD'}</button>
          )}
        </div>
        <input ref={fileRef} type="file" onChange={onFile} accept="image/*,application/pdf,.pdf,.doc,.docx,.heic" style={{ display: 'none' }} />
        {openCat === 'reports' ? (
          <div style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}22`, borderRadius: 14, padding: '16px 18px' }}>
            <p style={{ color: TEXT, fontSize: 11, lineHeight: 1.65, marginBottom: 12 }}>Your full inspection report — a permanent record of this property&apos;s condition at the time of inspection.</p>
            {pdfHref(record) ? (
              <a href={pdfHref(record)!} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, color: ACCENT, borderRadius: 10, padding: 12, fontSize: 10, fontWeight: 900, letterSpacing: 1, fontFamily: 'Roboto Mono, monospace', textDecoration: 'none' }}>VIEW / PRINT REPORT PDF ↗</a>
            ) : (
              <div style={{ color: DIM, fontSize: 9, fontFamily: 'Roboto Mono, monospace', fontWeight: 700 }}>PDF AVAILABLE IN LEDRIX APP · REQUEST A COPY FROM YOUR INSPECTOR</div>
            )}
          </div>
        ) : items.length === 0 ? (
          <div style={{ background: CARD, border: `1px dashed ${BORDER}`, borderRadius: 12, padding: '22px 16px', textAlign: 'center', color: DIM, fontSize: 11, lineHeight: 1.6 }}>
            {openCat === 'manual' ? 'No manuals yet. Tap Upload to add an appliance or system manual.' : 'No documents yet. Tap Upload to add a receipt, warranty, or any house file.'}
          </div>
        ) : items.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 11, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
            <Icon name="docs" size={18} color={ACCENT} />
            <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, color: TEXT, fontSize: 12.5, fontWeight: 700, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</a>
            <button onClick={() => removeDoc(d)} aria-label="Delete document" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 15, flexShrink: 0, lineHeight: 1 }}>✕</button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ color: ACCENT, fontSize: 9, fontWeight: 900, letterSpacing: 3, fontFamily: 'Roboto Mono, monospace', marginBottom: 14 }}>DOCS</div>

      {/* Category tiles — open one to view its items */}
      {([['reports', 'Inspection Reports', hasReport ? 1 : 0], ['manual', 'Manuals', manuals.length], ['document', 'Documents', documents.length]] as ['reports' | 'manual' | 'document', string, number][]).map(([cat, label, count]) => (
        <button key={label} onClick={() => setOpenCat(cat)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px', marginBottom: 10, cursor: 'pointer', textAlign: 'left' }}>
          <Icon name="docs" size={20} color={ACCENT} />
          <span style={{ flex: 1, minWidth: 0, color: TEXT, fontSize: 14, fontWeight: 700 }}>{label}</span>
          <span style={{ color: DIM, fontSize: 12, fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>{count}</span>
          <span style={{ color: ACCENT, fontSize: 16, lineHeight: 1 }}>›</span>
        </button>
      ))}
      <div style={{ height: 6 }} />

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
            <div style={{ color: TEXT, fontSize: 14, fontWeight: 900, marginBottom: 3 }}>{record.inspector ?? '—'}</div>
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
// Live chat + Insight are the paid tier. Blue returns here ONLY as the AI accent.
// Billing is DORMANT until NEXT_PUBLIC_BILLING_ENABLED=1. Until then the Subscribe sheet is a pure
// sign-in prompt — no pricing surfaces (these placeholder numbers must not show pre-launch).
const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === '1';
// PLACEHOLDER pricing — set real numbers before launch.
const PLAN_BASE_PRICE  = '$4.99';
const PLAN_BASE_TOKENS = '500K tokens / mo · ~150 questions';
const PLAN_PAYG        = '$0.01 / 1K tokens';

function PlanCard({ title, price, sub, highlight }: { title: string; price: string; sub: string; highlight?: boolean }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${highlight ? BLUE + '55' : BORDER}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ color: highlight ? BLUE : '#e2e8f0', fontSize: 10, fontWeight: 900, letterSpacing: 1.5, fontFamily: 'Roboto Mono, monospace' }}>{title}</span>
        <span style={{ color: '#fff', fontSize: 15, fontWeight: 900 }}>{price}</span>
      </div>
      <div style={{ color: MED, fontSize: 10, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function SubscribeSheet({ open, onClose, signedIn, onSubscribe }: { open: boolean; onClose: () => void; signedIn?: boolean; onSubscribe?: () => void }) {
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
          <ValDeltaSVG size={20} color={BLUE} sheen />
          <span style={{ color: BLUE, fontSize: 9, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace' }}>LEDRIX</span>
        </div>
        <div style={{ color: TEXT, fontSize: 21, fontWeight: 900, letterSpacing: -0.5, marginBottom: 7 }}>Make your home record live.</div>
        <p style={{ color: TEXT, fontSize: 12, lineHeight: 1.6, marginBottom: 20 }}>Ask Ledrix anything about your home — what a finding means, repair priorities, costs, what to do next — and get a living AI Insight that stays current with your record. Free members get the record; Ledrix members get the intelligence.</p>
        {BILLING_ENABLED && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <PlanCard title="LEDRIX PLUS" price={`${PLAN_BASE_PRICE}/mo`} sub={PLAN_BASE_TOKENS} highlight />
              <PlanCard title="PAY AS YOU GO" price={PLAN_PAYG} sub="Only pay for what you ask — no monthly commitment." />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', marginBottom: 18 }}>
              <span style={{ color: BLUE, fontSize: 11, flexShrink: 0, marginTop: 1 }}>ⓘ</span>
              <p style={{ color: MED, fontSize: 10, lineHeight: 1.55 }}>Most homeowners ask ~150 questions a month; a typical question costs about 3,000 tokens. You&apos;ll always see your balance, and we&apos;ll help you pick the right plan.</p>
            </div>
          </>
        )}
        {BILLING_ENABLED && signedIn ? (
          <button onClick={onSubscribe} style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: 15, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Subscribe — {PLAN_BASE_PRICE}/mo</button>
        ) : sent ? (
          <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
            <div style={{ color: BLUE, fontSize: 13, fontWeight: 900, marginBottom: 6 }}>Check your email ✉</div>
            <p style={{ color: TEXT, fontSize: 11, lineHeight: 1.5 }}>We sent a sign-in link to <b style={{ color: ACCENT }}>{email}</b>. Tap it to unlock Ledrix.</p>
          </div>
        ) : (
          <>
            <input value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && sendLink()} placeholder="you@email.com" type="email"
              style={{ width: '100%', background: CARD, border: `1px solid ${err ? CRITICAL : BORDER}`, borderRadius: 12, padding: 14, color: TEXT, fontSize: 14, outline: 'none', marginBottom: 8 }} />
            {err && <div style={{ color: CRITICAL, fontSize: 10, marginBottom: 8 }}>{err}</div>}
            <button onClick={sendLink} disabled={busy} style={{ width: '100%', background: 'rgba(33,123,232,0.10)', color: BLUE, border: '1px solid rgba(33,123,232,0.5)', borderRadius: 12, padding: 15, fontSize: 12, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', boxShadow: '0 0 18px rgba(33,123,232,0.28)', opacity: busy ? 0.6 : 1 }}>{busy ? 'SENDING…' : 'CONTINUE WITH EMAIL'}</button>
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
    <div style={{ margin: '4px 16px 16px', position: 'relative', background: CARD, border: `1px solid ${BLUE}22`, borderRadius: 14, padding: '14px 16px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ValDeltaSVG size={14} color={BLUE} sheen />
        <span style={{ color: BLUE, fontSize: 8, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace' }}>LEDRIX INSIGHT</span>
      </div>
      {access ? (
        <p style={{ color: loading ? MED : TEXT, fontSize: 12, lineHeight: 1.65 }}>{loading ? 'Analyzing your home…' : (insight ?? 'No insight available yet — ask Ledrix anything below.')}</p>
      ) : (
        <>
          <p style={{ color: TEXT, fontSize: 12, lineHeight: 1.65, filter: 'blur(4.5px)', userSelect: 'none' }}>
            Your home is in strong overall condition, with a few maintenance items worth scheduling before winter. The water heater is approaching the end of its typical service life, and the panel shows&hellip;
          </p>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(180deg, rgba(10,10,10,0.25), rgba(10,10,10,0.86))' }}>
            <button onClick={onUnlock} style={{ background: 'rgba(33,123,232,0.10)', color: BLUE, border: '1px solid rgba(33,123,232,0.5)', borderRadius: 10, padding: '11px 18px', fontSize: 10, fontWeight: 900, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', boxShadow: '0 0 18px rgba(33,123,232,0.3)' }}>UNLOCK LEDRIX INSIGHT</button>
            <span style={{ color: MED, fontSize: 9, fontFamily: 'Roboto Mono, monospace' }}>Live AI analysis of your home</span>
          </div>
        </>
      )}
    </div>
  );
}

function LedrixPanel({ open, onClose, shareId, seed }: { open: boolean; onClose: () => void; shareId: string; seed?: string | null }) {
  const [msgs, setMsgs]   = useState<{ role: 'ledrix' | 'user'; text: string }[]>([
    { role: 'ledrix', text: "Hi — I'm Ledrix. Ask me anything about your home: a finding, a repair, what something costs, or what to do next." },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy]   = useState(false);
  const [recording, setRecording] = useState(false);
  const [vizStream, setVizStream] = useState<MediaStream | null>(null);   // shared with the equalizer
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

  // Auto-send a transcript handed in from the FAB voice orb (option a) when the panel opens.
  const sendRef = useRef<(t?: string) => void>(() => {});
  const seedSent = useRef<string | null>(null);
  useEffect(() => {
    if (open && seed && seedSent.current !== seed) { seedSent.current = seed; sendRef.current(seed); }
  }, [open, seed]);

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
  sendRef.current = send;

  const toggleMic = async () => {
    if (recording) { mediaRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setVizStream(stream);   // feed the live equalizer off the same mic stream
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        setVizStream(null);
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
        <ValDeltaSVG size={20} color={BLUE} sheen />
        <span style={{ color: TEXT, fontSize: 13, fontWeight: 900, flex: 1 }}>Ledrix</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '82%',
            background: m.role === 'user' ? '#161616' : `${BLUE}10`, border: `1px solid ${m.role === 'user' ? BORDER : BLUE + '2a'}`,
            borderRadius: 12, padding: '10px 13px', color: m.role === 'user' ? '#e2e8f0' : TEXT, fontSize: 13, lineHeight: 1.55 }}>{m.text}</div>
        ))}
        {busy && <div style={{ alignSelf: 'flex-start', color: MED, fontSize: 11, fontFamily: 'Roboto Mono, monospace' }}>Ledrix is thinking…</div>}
      </div>
      {recording && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 16px', borderTop: `1px solid ${BORDER}`, background: BG, flexShrink: 0 }}>
          <ValVoiceVisualizer active={recording} stream={vizStream} color={BLUE} height={42} bars={7} />
          <span style={{ color: BLUE, fontSize: 10, fontWeight: 900, letterSpacing: 2, fontFamily: 'Roboto Mono, monospace' }}>LISTENING</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: `1px solid ${BORDER}`, flexShrink: 0, alignItems: 'flex-end' }}>
        <button onClick={toggleMic} aria-label="Voice" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 10,
          background: recording ? CRITICAL : CARD, border: `1px solid ${recording ? CRITICAL : BORDER}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={recording ? '#fff' : ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
          </svg>
        </button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder={recording ? 'Listening…' : 'Ask Ledrix about your home…'} enterKeyHint="send"
          style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', color: TEXT, fontSize: 16, outline: 'none', minWidth: 0 }} />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{ flexShrink: 0, height: 44, padding: '0 16px',
          background: 'rgba(33,123,232,0.10)', color: BLUE, border: '1px solid rgba(33,123,232,0.5)', borderRadius: 10, fontWeight: 900, fontSize: 11, letterSpacing: 1, cursor: 'pointer', fontFamily: 'Roboto Mono, monospace', boxShadow: '0 0 14px rgba(33,123,232,0.28)', opacity: (busy || !input.trim()) ? 0.45 : 1 }}>SEND</button>
      </div>
    </div>
  );
}

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
  const routeId = params?.id as string;            // URL slug: a share_token (new) or legacy share_id
  const [shareId, setShareId] = useState('');      // canonical share_id (insp_ id) — keys all child tables

  const [record,    setRecord]    = useState<HomeRecord | null>(null);
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [repairs,   setRepairs]   = useState<RepairRow[]>([]);
  const [log,       setLog]       = useState<MaintenanceLog[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [tab,       setTab]       = useState<Tab>('home');
  const [hist,      setHist]      = useState<Tab[]>([]);
  const [copied,    setCopied]    = useState(false);

  // Tile drill-in navigation (no bottom rail): go pushes the current screen onto
  // history; back returns to wherever you came from (home if the stack is empty).
  const go   = (t: Tab) => { setHist(h => [...h, tab]); setTab(t); };
  const back = () => setHist(h => { const n = [...h]; setTab(n.pop() ?? 'home'); return n; });

  // Ledrix premium access. Sign-in is always required; a Stripe subscription is required ONLY when
  // billing is switched on (NEXT_PUBLIC_BILLING_ENABLED=1). Until then this is DORMANT: signed-in === access.
  const BILLING_ON = process.env.NEXT_PUBLIC_BILLING_ENABLED === '1';
  const [session, setSession]       = useState<any>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [subOpen, setSubOpen]       = useState(false);
  const [ledrixOpen, setLedrixOpen] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!BILLING_ON || !session?.user?.id) { setSubscribed(false); return; }
    supabase.from('home_subscriptions').select('status').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }: any) => setSubscribed(!!data && ['active', 'trialing', 'past_due'].includes(String(data.status))));
  }, [BILLING_ON, session]);
  const access = !!session && (!BILLING_ON || subscribed);
  const startCheckout = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ returnTo: typeof window !== 'undefined' ? window.location.pathname : '/' }) });
      const j = await r.json().catch(() => ({}));
      if (j.url) window.location.href = j.url;
    } catch { /* noop */ }
  };
  const openLedrix = () => (access ? setLedrixOpen(true) : setSubOpen(true));
  const seeded = useRef(false);

  // VAL (option a) — the FAB orb morphs + records, then transcribes and opens the chat
  // with the message auto-sent. The orb reads `valStream` for its live waveform.
  const [valListening, setValListening] = useState(false);
  const [valStream, setValStream] = useState<MediaStream | null>(null);
  const [valSeed, setValSeed] = useState<string | null>(null);
  const [valLog, setValLog] = useState<any>(null);   // voice-parsed "log this work" pending confirm
  const confirmVoiceLog = async () => {
    if (!valLog) return;
    await supaPost('home_maintenance_log', [{ share_id: shareId, title: valLog.title, system: valLog.system ?? null, kind: valLog.kind ?? 'improvement', source: 'voice', done_date: new Date().toISOString().split('T')[0] }]).catch(() => {});
    setValLog(null); loadLog();
  };
  const valRec = useRef<MediaRecorder | null>(null);
  const valChunks = useRef<Blob[]>([]);
  const handleVal = async () => {
    if (!access) { setSubOpen(true); return; }
    if (valListening) { valRec.current?.stop(); return; }   // → onstop transcribes
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      valChunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) valChunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setValListening(false); setValStream(null);
        const blob = new Blob(valChunks.current, { type: 'audio/webm' });
        if (!blob.size) return;
        try {
          const { data } = await supabase.auth.getSession();
          const fd = new FormData();
          fd.append('audio', blob, 'voice.webm');
          const resp = await fetch('/api/transcribe', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: fd });
          const j = await resp.json().catch(() => ({}));
          if (resp.ok && j.text) {
            const spoken = String(j.text);
            // Is it a "we had X done" statement? Parse it; if so, confirm + log to the Carfax. Else → chat.
            try {
              const { data: sess } = await supabase.auth.getSession();
              const lr = await fetch('/api/ledrix', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token ?? ''}` }, body: JSON.stringify({ mode: 'logparse', question: spoken, shareId }) });
              const lj = await lr.json().catch(() => ({}));
              if (lr.ok && lj.log?.isLog && lj.log?.title) { setValLog({ ...lj.log, transcript: spoken }); return; }
            } catch { /* fall through to chat */ }
            setValSeed(spoken); setLedrixOpen(true);
          }
        } catch { /* transcribe failed — non-fatal */ }
      };
      mr.start();
      valRec.current = mr;
      setValStream(stream); setValListening(true);
    } catch { /* mic denied / unsupported */ }
  };

  // Child-table loaders key on the CANONICAL share_id (the insp_ id), which may differ from
  // the URL param (a share_token). They accept an explicit id so the initial load can run with
  // the just-resolved record's share_id before the shareId state has settled.
  const loadProjects = useCallback(async (sid: string = shareId) => {
    if (!sid) return;
    const data = await supaGet<Project>(`home_projects?share_id=eq.${encodeURIComponent(sid)}&order=created_at.asc`);
    setProjects(data);
  }, [shareId]);

  const loadReminders = useCallback(async (sid: string = shareId) => {
    if (!sid) return;
    const data = await supaGet<Reminder>(`home_reminders?share_id=eq.${encodeURIComponent(sid)}&order=due_date.asc.nullslast`);
    setReminders(data);
  }, [shareId]);

  const loadLog = useCallback(async (sid: string = shareId) => {
    if (!sid) return;
    const data = await supaGet<MaintenanceLog>(`home_maintenance_log?share_id=eq.${encodeURIComponent(sid)}&order=done_date.desc`);
    setLog(data);
  }, [shareId]);

  const loadRepairs = useCallback(async (sid: string = shareId) => {
    if (!sid) return;
    const data = await supaGet<RepairRow>(`home_repairs?share_id=eq.${encodeURIComponent(sid)}&order=sort_order.asc`);
    setRepairs(data);
  }, [shareId]);

  // Resolve the record by the URL param (routeId), trying share_token first, then falling back
  // to the legacy share_id (so old insp_ links + the marketing sample keep working). Everything
  // downstream keys on the record's canonical share_id, set into shareId state here.
  useEffect(() => {
    if (!routeId) { setLoading(false); setNotFound(true); return; }
    (async () => {
      let rows = await supaGet<HomeRecord>(`home_records?share_token=eq.${encodeURIComponent(routeId)}&limit=1`);
      if (rows.length === 0) rows = await supaGet<HomeRecord>(`home_records?share_id=eq.${encodeURIComponent(routeId)}&limit=1`);
      if (rows.length === 0) { setNotFound(true); return; }
      const rec = rows[0];
      const canonicalId = rec.share_id;
      setRecord(rec);
      setShareId(canonicalId);
      await Promise.all([loadProjects(canonicalId), loadReminders(canonicalId), loadRepairs(canonicalId), loadLog(canonicalId)]).catch(() => {});
      if (!seeded.current) {
        seeded.current = true;
        seedIfEmpty(canonicalId, rec.anomalies ?? [], rec.specs ?? [])
          .then(() => Promise.all([loadProjects(canonicalId), loadReminders(canonicalId)]).catch(() => {}))
          .catch(() => {});
      }
    })().catch(() => setNotFound(true)).finally(() => setLoading(false));
    // Keyed on routeId only — loaders are called with the resolved canonical id, so they
    // don't need to be effect deps (and including them would re-run this on shareId change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

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
        .rpt{display:grid;grid-template-columns:250px 1fr;grid-template-rows:auto 1fr;grid-template-areas:"side hero" "side main";background:#fff;min-height:100vh}
        .rpt-hero{grid-area:hero}
        .rpt-side{grid-area:side;width:250px;flex-shrink:0;position:sticky;top:0;max-height:100vh;overflow-y:auto;background:#fff;display:flex;flex-direction:column;border-right:1px solid #eef0f3}
        .rpt-main{grid-area:main;min-width:0}
        @media (max-width:860px){
          .rpt{grid-template-columns:1fr;grid-template-rows:none;grid-template-areas:"hero" "side" "main"}
          .rpt-side{position:static;width:100%;max-height:none;overflow-x:auto;overflow-y:hidden;flex-direction:row;border-right:none;border-bottom:1px solid #e5e7eb}
          .rpt-side>button{width:auto!important;border-bottom:none!important;border-right:1px solid #e5e7eb}
        }
        @media print {
          body * { visibility: hidden !important; }
          #repair-print, #repair-print * { visibility: visible !important; }
          #repair-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 24px !important; }
        }
      `}</style>

      <NavBar address={record.address ?? ''} onShare={handleShare} copied={copied} active={tab} onBack={back} signedIn={access} onSignOut={() => supabase.auth.signOut()} />

      {tab === 'home'      && <HomeTab record={record} anomalies={anomalies} projects={projects} reminders={reminders} repairs={repairs} onTabChange={go} access={access} shareId={shareId} onUnlock={() => setSubOpen(true)} onAsk={openLedrix} />}
      {tab === 'findings'  && <FindingsTab anomalies={anomalies} record={record} shareId={shareId} />}
      {tab === 'report'    && <ReportTab anomalies={anomalies} record={record} onTabChange={go} />}
      {tab === 'repairs'   && <RepairsTab anomalies={anomalies} shareId={shareId} repairs={repairs} record={record} onRefresh={loadRepairs} signedIn={access} />}
      {tab === 'projects'  && <ProjectsTab projects={projects} anomalies={anomalies} shareId={shareId} address={record.address} onRefresh={loadProjects} />}
      {tab === 'reminders' && <RemindersTab reminders={reminders} log={log} shareId={shareId} onRefresh={() => { loadReminders(); loadLog(); }} access={access} onUnlock={() => setSubOpen(true)} />}
      {tab === 'docs'      && <DocsTab record={record} />}
      {tab === 'ethix'     && <EthixTab access={access} onUnlock={() => setSubOpen(true)} />}

      <div style={{ position: 'fixed', bottom: 24, right: 'max(20px, calc(50% - 195px))', zIndex: 120 }}>
        <ValOrbVoice size={62} tone="light" controlled={{ listening: valListening, onToggle: handleVal, stream: valStream }} />
      </div>
      {valLog && (
        <div onClick={() => setValLog(null)} style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(14,21,24,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: CARD, borderRadius: '20px 20px 0 0', padding: '22px 20px 28px' }}>
            <div style={{ fontFamily: 'Roboto Mono, monospace', fontSize: 10, letterSpacing: '0.16em', color: ACCENT, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>Log to your home record?</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: TEXT }}>{valLog.title}</div>
            <div style={{ fontSize: 13, color: MED, marginTop: 4 }}>{[valLog.system, 'today'].filter(Boolean).join(' · ')}</div>
            <div style={{ fontSize: 12.5, color: MED, marginTop: 12, fontStyle: 'italic' }}>“{valLog.transcript}”</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => { const t = valLog.transcript; setValLog(null); setValSeed(t); setLedrixOpen(true); }} style={{ flex: 1, background: 'none', border: `1px solid ${BORDER}`, color: MED, borderRadius: 11, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>It’s a question</button>
              <button onClick={confirmVoiceLog} style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 11, padding: 13, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Log it</button>
            </div>
          </div>
        </div>
      )}
      <SubscribeSheet open={subOpen} onClose={() => setSubOpen(false)} signedIn={!!session} onSubscribe={startCheckout} />
      <LedrixPanel open={ledrixOpen} onClose={() => setLedrixOpen(false)} shareId={shareId} seed={valSeed} />
    </div>
  );
}
