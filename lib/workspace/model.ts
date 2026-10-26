// Inspector workspace — pure model. No imports, no I/O: everything here is executed directly by
// scripts/verify-workspace.mjs (Node type stripping), so the dashboard's arithmetic is tested, not
// eyeballed.
//
// Vocabulary mirrors ledrix-app src/core/theme/SeverityConfig.ts (the closed 5-tier set, internal
// ids unchanged, PRIORITY labels). Copied rather than imported because the two repos do not share
// a package; scripts/verify-workspace.mjs compares this copy against the app's file when it is
// reachable, so a drift fails the guard instead of silently mislabelling findings.

// ─── Priority (severity) ─────────────────────────────────────────────────────

export type Severity = 'critical' | 'deficiency' | 'maintenance' | 'characteristic' | 'spec';

export const SEVERITIES_IN_ORDER: readonly Severity[] = ['critical', 'deficiency', 'maintenance', 'characteristic', 'spec'];

export const SEVERITY_SHORT_LABELS: Record<Severity, string> = {
  critical:       'MAJOR REPAIR',
  deficiency:     'MINOR REPAIR',
  maintenance:    'MAINT & IMPROVE',
  characteristic: 'TYPICAL WEAR',
  spec:           'GOOD',
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical:       '#F97316',
  deficiency:     '#EAB308',
  maintenance:    '#64748B',
  characteristic: '#38BDF8',
  spec:           '#22C55E',
};

export function parseSeverity(raw: unknown): Severity | null {
  if (typeof raw !== 'string') return null;
  switch (raw.toLowerCase().trim()) {
    case 'critical':       return 'critical';
    case 'deficiency':     return 'deficiency';
    case 'maintenance':    return 'maintenance';
    case 'characteristic': return 'characteristic';
    case 'spec':           return 'spec';
    case 'anomaly':        return 'deficiency';
    case 'cosmetic':       return 'maintenance';
    case 'safety hazard':  return 'critical';
    case 'observation':    return 'characteristic';
    default:               return null;
  }
}

// ─── Finding status (HITL) ───────────────────────────────────────────────────
// Same normalisation as anomaliesStore.normalizeStatus: legacy 'inferred' and anything unknown is a
// PROPOSAL (never silently promoted to confirmed); a missing value is a legacy confirmed row.

export type FindingStatus = 'proposed' | 'confirmed' | 'rejected' | 'processing';

export function normalizeFindingStatus(raw: unknown): FindingStatus {
  if (raw == null || raw === '') return 'confirmed';
  if (raw === 'confirmed' || raw === 'rejected' || raw === 'proposed' || raw === 'processing') return raw;
  return 'proposed';
}

// A photo-only draft (`source = 'document_photo'`) that is not confirmed has NO priority yet (ledrix-app
// cardDefinition.isPriorityUnset, 2026-10-26): its `severity` column holds a NOT NULL placeholder that no
// inspector chose. Derived from synced columns, so this page reads it exactly as the phone does.
export function isPriorityUnset(row: { source?: unknown; status?: unknown }): boolean {
  return row.source === 'document_photo' && normalizeFindingStatus(row.status) !== 'confirmed';
}

// ─── Access ──────────────────────────────────────────────────────────────────

export type Role = 'ledrix_admin' | 'owner' | 'admin' | 'manager' | 'office' | 'inspector';

const ROLES: readonly Role[] = ['ledrix_admin', 'owner', 'admin', 'manager', 'office', 'inspector'];

export type ProfileRow = { id: string; full_name: string | null; company_id: string | null; role: string | null };

export type Access =
  | { ok: true; userId: string; name: string | null; role: Role; companyId: string | null; managesCompany: boolean }
  | { ok: false; reason: 'no-profile' };

/** The workspace is for inspection companies. A signed-in account with no inspector profile (a
 *  homeowner who used the portal's magic link) is refused here. This is a UI gate only — every
 *  read below it is enforced by row-level security regardless of what this returns. */
export function decideAccess(profile: ProfileRow | null | undefined): Access {
  if (!profile || !profile.id) return { ok: false, reason: 'no-profile' };
  const role: Role = (ROLES as readonly string[]).includes(profile.role ?? '') ? (profile.role as Role) : 'inspector';
  return {
    ok: true,
    userId: profile.id,
    name: profile.full_name,
    role,
    companyId: profile.company_id,
    // Same set as can_manage_inspection (supabase_inspection_assignment_rls.sql): sees the
    // company's inspections, not only their own and assigned ones.
    managesCompany: !!profile.company_id && role !== 'inspector',
  };
}

// ─── Inspections ─────────────────────────────────────────────────────────────

export type InspectionRow = {
  id: string;
  inspector_id: string | null;
  assigned_inspector_id: string | null;
  address: string | null;
  inspection_type: string | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
};

export type Phase = 'in_progress' | 'completed' | 'archived';

/** Server status vocabulary is wider than the device's CHECK (the server default and
 *  syncActiveInspection both write 'active'). */
export function inspectionPhase(row: Pick<InspectionRow, 'status' | 'completed_at'>): Phase {
  const s = (row.status ?? '').toLowerCase();
  if (s === 'archived') return 'archived';
  if (s === 'completed' || (!s && row.completed_at)) return 'completed';
  return 'in_progress';
}

export const PHASE_LABEL: Record<Phase, string> = {
  in_progress: 'In progress',
  completed: 'Completed',
  archived: 'Archived',
};

export type FindingCounts = { proposed: number; confirmed: number; rejected: number };

export function countFindings(rows: { inspection_id: string | null; status: unknown }[]): Record<string, FindingCounts> {
  const out: Record<string, FindingCounts> = {};
  for (const r of rows) {
    if (!r.inspection_id) continue;
    const c = (out[r.inspection_id] ??= { proposed: 0, confirmed: 0, rejected: 0 });
    const s = normalizeFindingStatus(r.status);
    if (s === 'confirmed') c.confirmed++;
    else if (s === 'rejected') c.rejected++;
    else c.proposed++;              // proposed + processing: both still await the inspector
  }
  return out;
}

// ─── Schedule (crm_orders) ───────────────────────────────────────────────────

export type OrderRow = {
  id: string;
  inspection_id: string | null;
  address: string | null;
  order_date: string | null;       // 'YYYY-MM-DD' (date column)
  status: string | null;
  inspector_id: string | null;
};

/** Local calendar date as 'YYYY-MM-DD'. Orders carry a DATE, not an instant, so "today" is the
 *  viewer's own calendar day. */
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

/** The newest `updated_at` among these rows — when a phone's work last reached the server — or null for none. */
export function latestUpdate(rows: ReadonlyArray<{ updated_at?: string | null }>): string | null {
  let out: string | null = null;
  for (const r of rows) if (r.updated_at && (!out || r.updated_at > out)) out = r.updated_at;
  return out;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export type ReportRow = { share_id: string; version: string | null; published_at: string | null; pdf_path: string | null; html_path: string | null };

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type DashboardInput = {
  inspections: InspectionRow[];
  findings: Record<string, FindingCounts>;
  orders: OrderRow[];
  reports: ReportRow[];
  today: string;                  // localDate(new Date())
  horizonDays?: number;           // upcoming window, default 14
};

export type AttentionItem = { inspection: InspectionRow; reason: 'review' | 'deliver' };

export type Dashboard = {
  today: OrderRow[];
  upcoming: OrderRow[];
  attention: AttentionItem[];
  inProgress: InspectionRow[];
  delivered: { inspection: InspectionRow; latest: ReportRow }[];
  totals: { inspections: number; proposed: number };
};

/** Pure: every number on the dashboard comes from here, from rows the server returned. Nothing is
 *  estimated. Tombstoned inspections never count. */
export function buildDashboard(input: DashboardInput): Dashboard {
  const horizon = addDays(input.today, input.horizonDays ?? 14);
  const live = input.inspections.filter(i => !i.deleted_at);

  const activeOrder = (o: OrderRow) => (o.status ?? 'scheduled') !== 'cancelled' && (o.status ?? '') !== 'completed';
  const byDate = (a: OrderRow, b: OrderRow) => (a.order_date ?? '').localeCompare(b.order_date ?? '') || (a.address ?? '').localeCompare(b.address ?? '');
  const today = input.orders.filter(o => o.order_date === input.today && activeOrder(o)).sort(byDate);
  const upcoming = input.orders
    .filter(o => !!o.order_date && o.order_date > input.today && o.order_date <= horizon && activeOrder(o))
    .sort(byDate);

  const latestReport = new Map<string, ReportRow>();
  for (const r of input.reports) {
    const prev = latestReport.get(r.share_id);
    if (!prev || (r.published_at ?? '') > (prev.published_at ?? '')) latestReport.set(r.share_id, r);
  }

  const attention: AttentionItem[] = [];
  const inProgress: InspectionRow[] = [];
  const delivered: { inspection: InspectionRow; latest: ReportRow }[] = [];
  let proposed = 0;
  const recent = (a: InspectionRow, b: InspectionRow) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '');

  for (const i of [...live].sort(recent)) {
    const c = input.findings[i.id];
    const phase = inspectionPhase(i);
    if (c?.proposed) { proposed += c.proposed; attention.push({ inspection: i, reason: 'review' }); }
    if (phase === 'in_progress') inProgress.push(i);
    const rep = latestReport.get(i.id);
    if (phase === 'completed') {
      if (rep) delivered.push({ inspection: i, latest: rep });
      else if (!c?.proposed) attention.push({ inspection: i, reason: 'deliver' });
    }
  }
  return { today, upcoming, attention, inProgress, delivered, totals: { inspections: live.length, proposed } };
}

// ─── Reports page (2026-10-21, approved parity mockup) ──────────────────────────
// The same rule the dashboard and the phone use (ledrix-app src/core/services/reportDelivery.ts): a completed
// inspection with a published report is SENT; without one it is TO SEND, or — while it still holds proposed findings —
// waiting on REVIEW first. In-progress inspections are not reports and are left to the Inspections page.
export type ReportsList = {
  toSend: InspectionRow[];
  review: InspectionRow[];
  sent: { inspection: InspectionRow; latest: ReportRow; versions: number }[];
};

export function buildReportsList(inspections: InspectionRow[], reports: ReportRow[], findings: Record<string, FindingCounts>): ReportsList {
  const byInspection = new Map<string, ReportRow[]>();
  for (const r of reports) byInspection.set(r.share_id, [...(byInspection.get(r.share_id) ?? []), r]);
  const out: ReportsList = { toSend: [], review: [], sent: [] };
  const recent = (a: InspectionRow, b: InspectionRow) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  for (const i of inspections.filter(x => !x.deleted_at && inspectionPhase(x) === 'completed').sort(recent)) {
    const rs = byInspection.get(i.id) ?? [];
    if (rs.length) {
      const latest = rs.reduce((a, b) => ((b.published_at ?? '') > (a.published_at ?? '') ? b : a));
      out.sent.push({ inspection: i, latest, versions: rs.length });
    } else if (findings[i.id]?.proposed) out.review.push(i);
    else out.toSend.push(i);
  }
  return out;
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export type PhotoRef = { kind: 'storage'; path: string } | { kind: 'url'; url: string } | { kind: 'device' };

/** anomalies.image_uri / evidence[] as the app pushes them: a bare object path in
 *  inspection-evidence once uploaded; the original file:// uri when the upload failed (the photo
 *  exists only on the phone); occasionally a full https URL. */
export function photoRef(uri: unknown): PhotoRef | null {
  if (typeof uri !== 'string' || !uri.trim()) return null;
  const u = uri.trim();
  if (/^(file|ph|content|assets-library):/i.test(u)) return { kind: 'device' };
  if (/^https?:\/\//i.test(u)) return { kind: 'url', url: u };
  if (/^data:/i.test(u)) return null;
  return { kind: 'storage', path: u.replace(/^\/+/, '') };
}
