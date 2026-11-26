import { useEffect, useState, type CSSProperties } from 'react';
import { findingSections, type ReportGroup } from '../../../lib/report/findingSections';
import { portalShareUrl } from '@/lib/portalShareLink';
import { portalCan, type PortalAction } from '@/lib/portalActions';

// ─── API helpers (proxy through Next.js to avoid CORS) ───────────────────────
// Desktop breakpoint — the page is inline-styled, so responsiveness is driven by this
// hook rather than media queries. False during SSR; resolves on mount.
function useDesk(): boolean {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1080px)');
    const apply = () => setDesk(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return desk;
}

// ─── PORTAL DATA, THROUGH THE TOKEN (security fix 2026-08-29) ─────────────────────────
// These four helpers used to hit /api/proxy with the anon key, which is how the portal's tables
// were world-readable and world-deletable. They now go through /api/portal, which holds the
// service role server-side, resolves the token to a share_id, and confines every read and write to
// that one share. The token is the URL slug, set once when the record loads (setPortalToken).
//
// Call sites are UNCHANGED — same names, same arguments. The share_id filter they still pass is
// harmless: /api/portal drops any client share_id and injects its own.
let PORTAL_TOKEN = '';
function setPortalToken(t: string) { PORTAL_TOKEN = t; }
/** The link's scope, set once the record loads (a function so the page's other files read the same value). */
function setPortalScope(s: 'edit' | 'read') { PORTAL_SCOPE = s; }
// What this link may do (/api/share returns it; lib/shareAccess.ts). The server enforces it on every
// call — this only stops the page offering changes a view-only link cannot make.
let PORTAL_SCOPE: 'edit' | 'read' = 'edit';
// LOOK-ONLY UNTIL CLAIMED (h2, owner 2026-11-25: "We can't have non owners making changes"). The report's own link
// reads; changes need a signed-in person who HOLDS this home (my_claim_state = 'home', #153 — a buyer only after closing).
// The server checks it on every write (lib/shareAccess.ts holdsShare, with the person's access token below); this flag
// only decides what the page offers. PORTAL_SCOPE stays the LINK's scope — never flipped to 'read' for a non-holder,
// or the Share button would hand out this edit link as if it were a view-only one.
let PORTAL_HOLDS = false;
function setPortalHolds(h: boolean) { PORTAL_HOLDS = h; }
let PORTAL_BEARER = '';
/** The signed-in person's Supabase access token, sent with every portal call (the page keeps it current). */
function setPortalBearer(t: string) { PORTAL_BEARER = t; }
const authHeaders = (): Record<string, string> => (PORTAL_BEARER ? { Authorization: `Bearer ${PORTAL_BEARER}` } : {});
/** This is the report's own link (not a minted view-only one). */
const isEditLink = () => PORTAL_SCOPE === 'edit';
/** The report's own link, but its holder hasn't claimed the home here: everything reads, changes show "Claim to add". */
const lookOnly = () => PORTAL_SCOPE === 'edit' && !PORTAL_HOLDS;
let CLAIM_OPENER: () => void = () => {};
function setClaimOpener(f: () => void) { CLAIM_OPENER = f; }
const openClaim = () => CLAIM_OPENER();
const canEdit = () => PORTAL_SCOPE === 'edit' && PORTAL_HOLDS;
/** Whether this page offers an action (lib/portalActions.ts). Every write handler checks it first. */
const can = (a: PortalAction) => PORTAL_HOLDS && portalCan(PORTAL_SCOPE, a);

/** The link a Share button may hand out (lib/portalShareLink.ts) — never the edit link. */
const shareUrlFor = (kind: 'read' | 'repairs') => portalShareUrl({
  fetchFn: (u, i) => fetch(u, { ...i, headers: { ...(i?.headers as Record<string, string> | undefined), ...authHeaders() } }), origin: window.location.origin, token: PORTAL_TOKEN,
  pageScope: PORTAL_SCOPE, kind, currentHref: window.location.href,
});

function splitPath(path: string): { table: string; filter: string; select?: string; order?: string; limit?: number } {
  const [table, query = ''] = path.split('?');
  const filterParts: string[] = [];
  let select: string | undefined, order: string | undefined, limit: number | undefined;
  for (const part of query.split('&').filter(Boolean)) {
    const key = part.split('=')[0];
    if (key === 'select') select = decodeURIComponent(part.slice('select='.length));
    else if (key === 'order') order = decodeURIComponent(part.slice('order='.length));
    else if (key === 'limit') limit = Number(part.slice('limit='.length)) || undefined;
    else filterParts.push(part);
  }
  return { table, filter: filterParts.join('&'), select, order, limit };
}

async function portal(op: string, table: string, extra: Record<string, unknown>): Promise<Response> {
  return fetch('/api/portal', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(op === 'select' ? {} : authHeaders()) },
    body: JSON.stringify({ token: PORTAL_TOKEN, table, op, ...extra }),
  });
}

async function supaGet<T>(path: string): Promise<T[]> {
  try {
    const { table, filter, select, order, limit } = splitPath(path);
    const r = await portal('select', table, { filter, select, order, limit });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
async function supaPost(table: string, body: object | object[]) {
  try { return await portal('insert', table, { body }); }
  catch { return new Response(null, { status: 500 }); }
}
async function supaPatch(table: string, filter: string, body: object) {
  try { return await portal('update', table, { filter, body }); }
  catch { return new Response(null, { status: 500 }); }
}
async function supaDelete(table: string, filter: string) {
  try { return await portal('delete', table, { filter }); }
  catch { return new Response(null, { status: 500 }); }
}

// ─── Design tokens ────────────────────────────────────────────────────────────
// Blue + dark-glass — matches the Ledrix inspector app's GradientCard aesthetic.
// Blue is the primary UI accent; color is still reserved for MEANING (severity).
// Stage 2: light theme. Accent is THE Ledrix blue, #217BE8 (owner ruling 2026-08-16: one blue
// across Ledrix, Home and Intelligence — the marks had drifted to a deeper #1A63C8).
//
// CONTRAST NOTE, deliberately recorded rather than silently worked around: #217BE8 on this warm
// paper (#F6F2EA) measures 3.71:1. That clears WCAG AA for large text (18px+), for bold 14px+ and
// for UI borders, and it does NOT clear the 4.5:1 needed for small body text. The deeper blue it
// replaced measured 5.13:1, which is why it was here.
//
// So: use this for marks, buttons, borders and headings. If a small link or caption needs the
// blue, #1D6DCE is the same hue at 89% and measures 4.55:1 — the minimum shift that passes.
const BLUE     = '#217BE8';   // the Ledrix blue — see the contrast note above
const ACCENT   = '#217BE8';   // primary UI accent — the Ledrix blue (owner call: blue, not the report teal)
const BLUE_TEXT = 'var(--sbluet)';  // AA-safe blue for SMALL text: #1D6DCE on light (4.55:1), #4C9BF2 on dark
const CRITICAL = '#DC2626';   // safety (readable on light)
const WARN     = '#CA8A04';   // deficiency (amber, readable on light)
const GREEN    = '#16A34A';   // satisfactory / resolved
const INFO     = '#5B7183';   // slate — maintenance + in-progress
const PURPLE   = INFO;        // legacy alias → muted (no rainbow)
// ── NEUTRALS ARE TOKENS (owner 2026-11-25, approval pack item 4: "the other tabs in light and dark") ───────────────────
// Every tab takes the Home tab's palette (HomeTab HR_LIGHT / HR_DARK) and follows the device's setting. The values live
// in SP_CSS on the page root (.sp); the Report tab's document stays paper-white (.sp-paper re-applies the light set).
// Status colours stay hex — they are suffixed with alpha (`${GREEN}20`) and read on both grounds.
const BG       = 'var(--sbg)';
const CARD     = 'var(--scard)';
const CARD2    = 'var(--scard2)';
const BORDER   = 'var(--sline)';
const DIM      = 'var(--sdim)';
const MED      = 'var(--smed)';
const TEXT     = 'var(--stext)';
/** Text on a TEXT-coloured button (white on light ink; ink on the light button dark mode draws). */
const INK_ON   = 'var(--son)';
/** The frosted bars (top bar, rail, Ask Ledrix dock). */
const GLASS    = 'var(--sglass)';
/** Soft status bands: information, done, a problem. */
const TINT_INFO = 'var(--stinfo)';
const TINT_OK   = 'var(--stok)';
const TINT_BAD  = 'var(--stbad)';
/** The frosted veil over a locked preview (Home DNA). */
const FROST     = 'var(--sfrost)';
const SP_LIGHT = '--sbg:#F2F3F5;--scard:#FFFFFF;--scard2:#F7F8FA;--sline:rgba(15,18,22,.10);--sdim:#9AA1AB;--smed:#5F6672;--stext:#0F1216;'
  + '--son:#FFFFFF;--sglass:rgba(242,243,245,.92);--stinfo:#EEF4FD;--stok:#EAF5EE;--stbad:#FDF0EC;--sbluet:#1D6DCE;--sfrost:rgba(247,249,251,.45);';
const SP_DARK = '--sbg:#0A0B0D;--scard:#15171A;--scard2:#1D1F23;--sline:#272A2F;--sdim:#5F656C;--smed:#9198A1;--stext:#F4F5F7;'
  + '--son:#0A0B0D;--sglass:rgba(16,17,20,.92);--stinfo:#14243A;--stok:#12291F;--stbad:#33191A;--sbluet:#4C9BF2;--sfrost:rgba(21,23,26,.55);';
// :root too, so the page behind the browser's own bars (html/body, page.tsx) takes the same ground.
const SP_CSS = `:root,.sp{${SP_LIGHT}color-scheme:light}
@media (prefers-color-scheme:dark){:root,.sp{${SP_DARK}color-scheme:dark}}
.sp .sp-paper{${SP_LIGHT}color-scheme:light}`;

// Shared type voices — mirrors the inspection report's system: serif display for titles,
// sans body, mono for tracked-caps labels. One definition; tabs reuse instead of redeclaring.
const SERIF = "'Iowan Old Style','Charter','Palatino Linotype',Georgia,serif";
const MONO  = "ui-monospace,'SF Mono','Roboto Mono',Menlo,monospace";
// The one tracked-caps label treatment (quiet: 600 weight, restrained tracking) — pass a color.
const eyebrow = (color: string, size = 9): CSSProperties => ({
  fontFamily: MONO, fontSize: size, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color,
});

// ─── Types ────────────────────────────────────────────────────────────────────
type Anomaly = {
  id?: string; description?: string; severity?: string; unit?: string; component?: string;
  location?: string; recommendation?: string; prosToCall?: string;
  imageUri?: string; isSafety?: boolean;   // real synced Safety flag (app's isSafetyConcern)
  issueTitle?: string; observationBullets?: string[];   // canonical finding card: title + bullets
};
type Spec = {
  category?: string; material?: string; status?: string;
  system?: string; room?: string; structureId?: string;
  instanceLabel?: string;
  attributes?: { key: string; value: string; unit?: string }[];
  manual_url?: string;
  manual_verified_at?: string;
  manual_maintenance?: { task: string; intervalDays: number; notes?: string }[];
};
type HomeRecord = {
  id: string; share_id: string; address?: string; city?: string; state?: string;
  zip?: string; year_built?: string; sqft?: string; beds?: string; baths?: string;
  garage?: string; inspector?: string; company?: string; license_number?: string;
  inspection_date?: string; inspection_type?: string; sop_mode?: string;
  anomalies: Anomaly[]; specs: Spec[]; created_at: string; pdf_url?: string; cover_url?: string; share_token?: string;
  /** The phone's PDF grouping of `anomalies` (/api/share runs it through the report bundle); null when unavailable. */
  reportGroups?: ReportGroup[] | null;
  /** What wasn't inspected: the inspection's limitations, item + reason (/api/share, 2026-11-25). */
  limitations?: { item: string; reason: string }[];
  /** The job's home type and stories (Before you start), for the drawing (/api/share, 2026-11-25). */
  house?: { homeType: string | null; stories: string | null } | null;
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
// Schematic (non-LiDAR) floor plan — a byproduct of the inspector's coverage-photo
// walkthrough in the field app. May not exist for a given inspection (no coverage
// photos = no adjacency data to lay out from); that's a normal, unremarkable state.
type FPRoom = {
  roomId: string; label: string; gridX: number; gridY: number; w: number; h: number;
  floor?: number | string; systemId?: string;
};
type FPLayout = { rooms: FPRoom[]; pins?: Record<string, { fx: number; fy: number }>; generatedAt?: string };
type FloorPlanRow = { inspection_id: string; layout: FPLayout | null; fingerprint?: string; updated_at?: string };

// Floor plan is shelved for MVP (owner call 2026-07-09) — mirrors FLOORPLAN_ENABLED in the
// app's core/flags.ts. Hides the schematic even for inspections that synced a layout during
// earlier testing; flip to true to restore.
const FLOORPLAN_ENABLED = false;

type Tab = 'home' | 'findings' | 'specs' | 'repairs' | 'projects' | 'reminders' | 'docs' | 'report' | 'ethix' | 'systems' | 'maintain' | 'history';
// User-facing tab names — the lifecycle standard (internal Tab ids never change).
const TAB_LABEL: Record<Tab, string> = {
  home: 'Home', findings: 'Repairs Needed', specs: 'Systems & Specs', repairs: 'Repair Request', projects: 'Repair Status',
  reminders: 'Maintenance', docs: 'Docs', report: 'Reports', ethix: 'Ethix',
  systems: 'Systems', maintain: 'Maintain', history: 'History',
};
// ONE HOME (owner 2026-11-12, mockup GejuM8pyUwwkWUyVnuPFGD "approved"): the report link opens Ledrix Home's own five
// sections. Every older screen still opens (deep links, the Home tiles) and lights the section it belongs to.
const RAIL: { tab: Tab; label: string }[] = [
  { tab: 'home', label: 'Home' }, { tab: 'systems', label: 'Systems' }, { tab: 'maintain', label: 'Maintain' },
  { tab: 'history', label: 'History' }, { tab: 'report', label: 'Report' },
];
const RAIL_OF: Partial<Record<Tab, Tab>> = { findings: 'systems', specs: 'systems', reminders: 'maintain', projects: 'maintain', repairs: 'maintain', docs: 'history' };

// ─── Constants ────────────────────────────────────────────────────────────────
const APPLIANCE_SYSTEMS = ['hvac', 'heating', 'cooling', 'air conditioning', 'furnace',
  'water heater', 'dishwasher', 'refrigerator', 'washer', 'dryer', 'oven', 'range',
  'stove', 'microwave', 'garbage disposal', 'plumbing', 'electrical panel', 'panel'];

const STATUS_COLOR: Record<string,string> = {
  identified: DIM, quoted: WARN, scheduled: INFO,
  in_progress: INFO, resolved: GREEN, cancelled: DIM,
};
const STATUS_LABEL: Record<string,string> = {
  identified: 'IDENTIFIED', quoted: 'QUOTED', scheduled: 'SCHEDULED',
  in_progress: 'IN PROGRESS', resolved: 'RESOLVED', cancelled: 'CANCELLED',
};
const STATUS_NEXT: Record<string,string> = {
  identified: 'quoted', quoted: 'scheduled', scheduled: 'in_progress',
  in_progress: 'resolved', resolved: 'resolved', cancelled: 'cancelled',
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

// ── Report tab: a finding's SYSTEM is the phone's ──────────────────────────────────────────────────────────────────
// The 13-section keyword list that lived here (REPORT_SYS / REPORT_SYS_ORDER) was retired 2026-11-04 (owner: "Use
// recommendation to switch to phones system list" / "Keep like PDF so website and PDF match"). /api/share returns the
// phone's own grouping of these findings (record.reportGroups, from ledrix-app findingGroups.ts through the report
// bundle); indexSystems records each finding's system from it, and everything on this page reads that.
const SYSTEM_OF = new WeakMap<Anomaly, { id: string; label: string }>();
function indexSystems(rec: HomeRecord): void {
  for (const sec of findingSections(Array.isArray(rec.anomalies) ? rec.anomalies : [], rec.reportGroups))
    for (const c of sec.components) for (const a of c.findings) SYSTEM_OF.set(a, { id: sec.systemId, label: sec.label });
}
function reportSystem(a: Anomaly): string { return SYSTEM_OF.get(a)?.label ?? 'GENERAL'; }
// ── Floor plan: does a finding belong to this schematic room box? ───────────────
// Primary signal: the finding's own logged `location` text against the room's label —
// the same field this tab's "room" sort already groups by, and a more direct room-
// identity signal than a trade category (a bedroom and a living room can both be
// "Interior"). Only when a finding has NO location logged do we fall back to
// the phone's system (SYSTEM_OF) — the SAME grouping the Report tab and the PDF use, not a
// parallel counting mechanism — matched against the room's `systemId` (from the app's
// systemForUnit) or, failing that, the room's plain label.
function normKey(s?: string): string { return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function textOverlap(a: string, b: string): boolean { return !!a && !!b && (a.includes(b) || b.includes(a)); }
function anomalyInRoom(a: Anomaly, room: FPRoom): boolean {
  const loc = normKey(a.location);
  const label = normKey(room.label);
  if (loc) return !!label && textOverlap(loc, label);
  const sys = normKey(SYSTEM_OF.get(a)?.id ?? 'general');
  return textOverlap(sys, normKey(room.systemId)) || textOverlap(sys, label);
}
function floorLabel(floor?: number | string): string {
  if (floor === undefined || floor === null || floor === '') return 'Main Level';
  if (typeof floor === 'number') {
    if (floor === 0) return 'Main Level';
    if (floor === 1) return 'Upper Level';
    if (floor >= 2) return `Level ${floor + 1}`;
    return 'Basement';
  }
  return String(floor);
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

  // Manufacturer-sourced maintenance — pulled straight from the appliance's data-plate manual
  // (Ledrix Intelligence looks up + verifies the manual, then extracts its service schedule).
  // Title includes the spec so re-seeding recognizes it's already been added (stable dedupe key).
  for (const s of specs.filter(s => s.status === 'confirmed')) {
    for (const item of s.manual_maintenance ?? []) {
      rem.push(mk(`${item.task} (${s.material || s.category})`, s.category ?? 'General', Math.min(item.intervalDays, 30), `${item.intervalDays}d`));
    }
  }

  return rem;
}

// Auto-seed the Docs/Manuals tab from any spec Ledrix Intelligence has verified a manufacturer
// manual for. Dedupe strictly by URL (not title) — a homeowner's own upload has no "seeded" flag
// to lean on, so matching the exact link is the only safe way to avoid duplicating their work.
async function seedManualDocs(shareId: string, specs: Spec[]) {
  if (!can('seed')) return;
  const withManual = specs.filter(s => s.manual_url);
  if (withManual.length === 0) return;
  const existing = await supaGet<{ url: string }>(`home_documents?share_id=eq.${encodeURIComponent(shareId)}&select=url`);
  const haveUrls = new Set(existing.map(d => d.url));
  const missing = withManual
    .filter(s => !haveUrls.has(s.manual_url!))
    .map(s => ({
      share_id: shareId,
      name: `${s.material || s.category || 'Appliance'} Manual`,
      url: s.manual_url,
      path: null,
      kind: 'manual',
      size: null,
    }));
  if (missing.length > 0) await supaPost('home_documents', missing);
}

// ─── Seeding ─────────────────────────────────────────────────────────────────
async function seedIfEmpty(shareId: string, anomalies: Anomaly[], specs: Spec[]) {
  if (!can('seed')) return;
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

  await seedManualDocs(shareId, specs);
}
export { useDesk, PORTAL_TOKEN, setPortalToken, setPortalScope, PORTAL_SCOPE, setPortalHolds, setPortalBearer, authHeaders, isEditLink, lookOnly, setClaimOpener, openClaim, canEdit, can, shareUrlFor, splitPath, portal, supaGet, supaPost, supaPatch, supaDelete, BLUE, ACCENT, BLUE_TEXT, CRITICAL, WARN, GREEN, INFO, PURPLE, BG, CARD, CARD2, BORDER, DIM, MED, TEXT, INK_ON, GLASS, TINT_INFO, TINT_OK, TINT_BAD, FROST, SP_CSS, SERIF, MONO, eyebrow, FLOORPLAN_ENABLED, TAB_LABEL, RAIL, RAIL_OF, APPLIANCE_SYSTEMS, STATUS_COLOR, STATUS_LABEL, STATUS_NEXT, PRIO, PRIO_ORDER, PRIO_SHORT, SEV_TO_PRIO, prioKeyOf, SEV_COLOR, SEV_LABEL, SYSTEM_OF, indexSystems, reportSystem, normKey, textOverlap, anomalyInRoom, floorLabel, PRIO_LABEL, PRIO_COLOR, prioRank, isSafetyFinding, priorityOf, fmtDate, addDays, haversineM, isApplianceSystem, compressPhoto, buildMaintenanceReminders, seedManualDocs, seedIfEmpty };
export type { Anomaly, Spec, HomeRecord, Project, Reminder, RepairRow, MaintenanceLog, FPRoom, FPLayout, FloorPlanRow, Tab, PrioKey };
