// ─── conflictRules — "When two devices disagree" (owner-approved mockup 2026-11-03) ───────────────────────────────
//
// The server keeps both values of a field two devices changed without seeing each other (inspection_conflicts, plan
// §3.2) and the job cannot be sealed until a person picks (SQL #97). These are the rules every surface uses to show and
// settle one: which choices exist, and how a field and a value read in words. Pure, import-free: copied byte-for-byte to
// the website (scripts/web-preview-sync.json), so the phone and the website offer exactly the same choices.
//
// WHICH CHOICES. "Keep what's saved" is always possible: the field already holds the server's value. "Use the other"
// writes the other value through the versioned path first, so it exists only where that write can land:
//   concurrent_edit, stale_delete  → both
//   status_regression              → keep only: a decided status never goes back by sync (ledrix_sync_version (a))
//   edit_on_tombstone              → keep only: the record was deleted on another device and the deletion stands

export type ConflictRow = {
  id: string;
  table_name: 'inspections' | 'anomalies' | 'technical_specs' | string;
  record_id: string;
  field: string;
  reason: 'concurrent_edit' | 'stale_delete' | 'status_regression' | 'edit_on_tombstone' | string;
  server_value: unknown;
  client_value: unknown;
  client_device: string | null;
  created_at: string;
  report_relevance: string | null;
  /** The field's value NOW. It can have moved on since the conflict was recorded (someone decided again); "keep what's
   *  saved" means this value, not the one recorded at the time. Absent → server_value. */
  current_value?: unknown;
};

/** What "Saved" shows and what Keep settles on. */
export const savedValue = (c: Pick<ConflictRow, 'server_value' | 'current_value'>): unknown =>
  'current_value' in c && c.current_value !== undefined ? c.current_value : c.server_value;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** How Keep settles: the recorded saved value, the recorded other value, or the current value as a new proposal. */
export function keepSource(c: Pick<ConflictRow, 'server_value' | 'client_value' | 'current_value'>): 'original_server' | 'original_client' | 'propose' {
  const v = savedValue(c);
  return same(v, c.server_value) ? 'original_server' : same(v, c.client_value) ? 'original_client' : 'propose';
}

/** Open conflicts with this relevance hold the seal (plan §3.2: a new conflict is 'unknown' and blocks). */
export const BLOCKING_RELEVANCE = ['affects', 'unknown'] as const;

export type ConflictChoices = { keep: true; useOther: boolean; note: string | null };

export function choicesFor(c: Pick<ConflictRow, 'reason' | 'server_value' | 'client_value' | 'field' | 'current_value'>): ConflictChoices {
  if (c.reason === 'status_regression') {
    return { keep: true, useOther: false,
      note: `A ${valueLabel('status', savedValue(c)).toLowerCase()} finding can’t go back to ${valueLabel('status', c.client_value).toLowerCase()} this way. If it should be looked at again, reopen it in the review queue.` };
  }
  if (c.reason === 'edit_on_tombstone') {
    return { keep: true, useOther: false, note: 'This was deleted on another device. The deletion stands; the edit made without seeing it is kept on record.' };
  }
  return { keep: true, useOther: true, note: null };
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status', description: 'Description', severity: 'Priority', is_safety: 'Safety', room: 'Room', location: 'Location',
  level: 'Floor', inspector_notes: 'Notes', deleted_at: 'Deleted', address: 'Address', unit: 'System', defect_type: 'Defect type',
  category: 'Item', material: 'Material', attributes: 'Details', year_built: 'Year built', sqft: 'Square feet',
};
export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/^\w/, ch => ch.toUpperCase());
}

const PRIORITY: Record<string, string> = { critical: 'Major repair', deficiency: 'Minor repair', maintenance: 'Maint & improve', characteristic: 'Typical wear', spec: 'Good' };
export function valueLabel(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return field === 'deleted_at' ? 'Not deleted' : '(empty)';
  if (field === 'deleted_at') return 'Deleted';
  if (field === 'severity' && typeof v === 'string') return PRIORITY[v] ?? v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (field === 'status' && typeof v === 'string') return v.charAt(0).toUpperCase() + v.slice(1);
  if (typeof v === 'string') return v.length > 120 ? `${v.slice(0, 117)}…` : v;
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v).slice(0, 120);
}

/** Where the other value came from, in words. `mine` is this device's id. */
export function deviceLabel(device: string | null, mine: string | null): string {
  if (!device) return 'another device';
  if (mine && device === mine) return 'this device';
  if (device.startsWith('web_')) return 'the website';
  return 'another device';
}
