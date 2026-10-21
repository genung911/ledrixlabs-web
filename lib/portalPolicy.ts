// ─── portalPolicy — what a portal-link holder may do, expressed as data ──────────────────
// (Homeowner security pass, 2026-10-19. Pure — no I/O, no env — so the rules can be tested
//  without a server: scripts/verify-portal-security.mjs.)
//
// ── THE CONTRACT THIS ENFORCES (unchanged product behaviour) ─────────────────────────────
// The share TOKEN is the portal's only credential (app/api/portal/route.ts). Whoever holds it can
// read the home and add to it — that is how the portal works today and changing it is an owner
// decision, not a code fix. What this module removes is everything BEYOND that contract which the
// route used to pass straight to PostgREST with the service role:
//
//   · any column on a write. A link holder could set `id`, `created_at`, `seeded`, or (on
//     home_documents) a `path` naming another home's stored file. Writes are now limited to the
//     columns the portal's real call sites send (counted from app/share/[id]/page.tsx).
//   · any PostgREST grammar in a filter, select or order. `select=*,home_records(*)` embeds
//     related tables; `or=(…)`/`and=(…)` and unknown operators widen what a filter can reach.
//     Filters are now `column=op.value` with a closed operator set; selects are plain column lists.
//   · whole-share updates and deletes. An update or delete with no filter of its own ran against
//     every row of the share, and `id=neq.x` still reaches all but one. Updates and deletes now
//     need at least one term and accept equality terms only.
//   · unbounded writes. Batches and text values are capped.

export type Op = 'select' | 'insert' | 'update' | 'delete';

type TablePolicy = {
  ops: ReadonlySet<Op>;
  /** Columns an insert may set. share_id is never here — the server forces it. */
  insert?: ReadonlySet<string>;
  /** Columns an update may change. id and share_id are never here. */
  update?: ReadonlySet<string>;
  /** A server-side term AND-ed onto every delete, limiting which rows a link holder may remove. */
  deleteGuard?: string;
};

const set = <T,>(...xs: T[]) => new Set<T>(xs);

// home_documents: select only. Uploads, opening and deleting a file go through /api/docs, which
// writes the row itself — the client can no longer file a row naming a storage path. The one
// client insert left is the manufacturer-manual link (seedManualDocs), which carries no path.
export const PORTAL_POLICY: Record<string, TablePolicy> = {
  home_reminders: {
    ops: set<Op>('select', 'insert', 'update', 'delete'),
    insert: set('title', 'system', 'due_date', 'recurrence', 'completed', 'seeded'),
    update: set('completed', 'due_date', 'snoozed_until'),
  },
  home_projects: {
    ops: set<Op>('select', 'insert', 'update', 'delete'),
    insert: set('title', 'system', 'priority', 'status', 'description', 'recommendation',
      'contractor_type', 'photos', 'seeded'),
    update: set('status', 'photos', 'appliance_info'),
  },
  home_repairs: {
    ops: set<Op>('select', 'insert', 'update', 'delete'),
    insert: set('anomaly_ref', 'item', 'location', 'severity', 'status', 'sort_order'),
    update: set('item', 'remedy', 'generated_text', 'source_fp', 'updated_at', 'edited_text'),
  },
  home_documents: {
    ops: set<Op>('select', 'insert'),
    insert: set('name', 'url', 'kind'),
  },
  // Every row here is homeowner-created (portal manual / task / voice); nothing an inspector writes
  // lands in this table. Deletion is still confined to those sources, so a row written by any
  // future non-homeowner path stays undeletable from the portal until someone decides otherwise.
  home_maintenance_log: {
    ops: set<Op>('select', 'insert', 'delete'),
    insert: set('title', 'system', 'kind', 'source', 'reminder_id', 'done_date', 'note'),
    deleteGuard: 'source=in.(manual,task,voice)',
  },
  home_reports: { ops: set<Op>('select') },
  floor_plans:  { ops: set<Op>('select') },
};

/**
 * What each link scope may do here (lib/shareAccess.ts). edit: the policy above. read: select only.
 * repairs: only the repair request — home_repairs rows already marked `included`, read-only.
 */
export function scopeAllows(scope: 'edit' | 'read' | 'repairs', table: string, op: Op): boolean {
  if (scope === 'edit') return true;
  if (scope === 'read') return op === 'select';
  return table === 'home_repairs' && op === 'select';
}
export const REPAIRS_SCOPE_TERM = 'status=eq.included';

export const MAX_ROWS = 100;          // per insert
const MAX_TEXT = 20_000;              // per string value (project photos are capped separately)
const MAX_PHOTOS_JSON = 6_000_000;    // home_projects.photos holds compressed base64 images

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const FILTER_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is']);

/**
 * A client filter, reduced to plain `column=op.value` terms with the share scope dropped (the
 * server adds its own). Returns null when any term is outside that grammar — refused, not repaired.
 */
export function cleanFilter(raw: string | undefined, op: Op = 'select'): string[] | null {
  const writing = op === 'update' || op === 'delete';
  const terms: string[] = [];
  for (const part of String(raw ?? '').split('&').map(s => s.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq <= 0) return null;
    const col = part.slice(0, eq);
    const rest = part.slice(eq + 1);
    if (!IDENT.test(col)) return null;
    if (col === 'or' || col === 'and' || col === 'select' || col === 'order' || col === 'limit') return null;
    const dot = rest.indexOf('.');
    if (dot <= 0) return null;
    const fop = rest.slice(0, dot);
    const value = rest.slice(dot + 1);
    if (!FILTER_OPS.has(fop)) return null;
    if (writing && fop !== 'eq') return null;         // a write names its rows exactly
    // Re-encode the value from its decoded form, so nothing in it (#, &, ?, …) reaches the URL raw:
    // a raw '#' would end the query string and silently drop every term after it.
    let decoded: string;
    try { decoded = decodeURIComponent(value); } catch { return null; }
    if (/[()]/.test(decoded) || /[\u0000-\u001f]/.test(decoded)) return null;
    if (fop === 'is' && !/^(null|true|false)$/.test(decoded)) return null;
    if (col === 'share_id') continue;                 // never the client's to choose
    terms.push(`${col}=${fop}.${encodeURIComponent(decoded)}`);
  }
  return terms;
}

/** `a,b,c` or `*` — no embedding, no aliases, no casts. */
export function cleanSelect(raw: string | undefined): string | null | undefined {
  if (raw === undefined || raw === '') return undefined;
  const s = String(raw).trim();
  if (s === '*') return s;
  const cols = s.split(',').map(c => c.trim());
  return cols.every(c => IDENT.test(c)) ? cols.join(',') : null;
}

/** `col.asc.nullslast,col2.desc` — nothing else. */
export function cleanOrder(raw: string | undefined): string | null | undefined {
  if (raw === undefined || raw === '') return undefined;
  const ok = String(raw).split(',').every(term => {
    const [col, ...mods] = term.trim().split('.');
    return IDENT.test(col) && mods.length <= 2
      && mods.every(m => m === 'asc' || m === 'desc' || m === 'nullsfirst' || m === 'nullslast');
  });
  return ok ? String(raw) : null;
}

function valueOk(col: string, v: unknown): boolean {
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return true;
  if (typeof v === 'string') return v.length <= MAX_TEXT;
  if (col === 'photos' || col === 'appliance_info') {
    try { return JSON.stringify(v).length <= MAX_PHOTOS_JSON; } catch { return false; }
  }
  return false;
}

/** Keep only allow-listed columns; refuse the write if a kept value is oversized or not plain data. */
export function cleanRow(table: string, kind: 'insert' | 'update', row: unknown): Record<string, unknown> | null {
  const allowed = kind === 'insert' ? PORTAL_POLICY[table]?.insert : PORTAL_POLICY[table]?.update;
  if (!allowed || !row || typeof row !== 'object' || Array.isArray(row)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (!allowed.has(k)) continue;                    // silently dropped, as share_id always was
    if (!valueOk(k, v)) return null;
    out[k] = v;
  }
  if (table === 'home_documents' && kind === 'insert') {
    // The only client-filed document is an external manual link. A stored file's row is written by
    // /api/docs, never here, so a link holder cannot point a row at another home's object.
    if (typeof out.url !== 'string' || !/^https?:\/\/[^\s]+$/i.test(out.url)) return null;
    if (/\/storage\/v1\/object\//i.test(out.url)) return null;
  }
  return Object.keys(out).length ? out : null;
}
