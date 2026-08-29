// ─── /api/portal — the homeowner portal's data plane, behind the token ───────────────
//
// (Ledrix security fix, 2026-08-29. The companion to /api/share/<token>, and the reason
//  /api/proxy was deleted.)
//
// ── WHAT THIS REPLACES, AND WHY IT WAS DANGEROUS ────────────────────────────────────
// The portal read and WROTE its seven tables straight through /api/proxy with the ANON key. Those
// tables carried `for all to anon using (true) with check (true)` — so anyone holding the public
// key (it ships in the app and on the website) could read, insert, update and DELETE every home's
// reminders, projects, repairs, documents, maintenance log, reports and floor plans. Verified
// against production 2026-08-29: 75 reminders across 13 homes and 32 projects across 3, all
// world-readable, and a no-match DELETE returned 204 — deletion was permitted too.
//
// Worse, `share_id` is a COLUMN in those tables, so the anon key could enumerate every share token
// and then load that homeowner's portal — a side-door around the /api/share/<token> lockdown B9
// built for `home_records`.
//
// ── THE MODEL, MIRRORING /api/share ─────────────────────────────────────────────────
// The service role lives here, server-side only, and never reaches the client. The token is the
// ONLY credential. Every request:
//
//   1. presents the share TOKEN (the url slug), never a share_id — the id is enumerable and was
//      the thing being harvested.
//   2. is resolved token -> share_id HERE, against `home_records.share_token`, with the service
//      role. A caller cannot assert which share they are; the server decides from their token.
//   3. is confined to that one share_id. Reads get it AND-ed onto their filter; writes get it
//      forced into the row and onto the WHERE clause, so a row belonging to another share can be
//      neither read, changed nor deleted whatever filter the client sends.
//   4. touches only an allow-listed table, with only the operations that table actually needs —
//      derived from the portal's real call sites, not granted wholesale.
//
// Once every client call goes through here, anon is revoked on all seven tables
// (`supabase_portal_lockdown.sql`) and there is no path to them except a valid token.
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

type Op = 'select' | 'insert' | 'update' | 'delete';

// ── THE ALLOW-LIST IS THE POLICY ────────────────────────────────────────────────────
// One entry per table the portal legitimately uses, and only the operations its real call sites
// perform (counted from app/share/[id]/page.tsx + repairs/page.tsx on 2026-08-29). A table absent
// here is unreachable through this route; an operation absent for a table is refused. This is what
// replaces `for all to anon` — least privilege, expressed as data.
const ALLOW: Record<string, ReadonlySet<Op>> = {
  home_reminders:       new Set<Op>(['select', 'insert', 'update', 'delete']),
  home_projects:        new Set<Op>(['select', 'insert', 'update', 'delete']),
  home_repairs:         new Set<Op>(['select', 'insert', 'update', 'delete']),
  home_documents:       new Set<Op>(['select', 'insert', 'delete']),
  home_maintenance_log: new Set<Op>(['select', 'insert']),
  home_reports:         new Set<Op>(['select']),
  floor_plans:          new Set<Op>(['select']),
};

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const notFound = () => fail(404, 'Not found.');

/** The token resolves to exactly one share, or to nothing. Same shape gate as /api/share. */
async function shareIdForToken(token: string): Promise<string | null> {
  const slug = String(token ?? '').trim();
  if (!slug || slug.length > 128 || !/^[A-Za-z0-9._-]+$/.test(slug)) return null;
  const url = `${SUPA_URL}/rest/v1/home_records`
    + `?share_token=eq.${encodeURIComponent(slug)}&select=share_id&limit=1`;
  const r = await fetch(url, { headers: svc, cache: 'no-store' });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? String(rows[0].share_id ?? '') || null : null;
}

/**
 * A caller-supplied PostgREST filter, stripped of anything that could reach another share.
 *
 * The share_id scope is added by us and is NON-NEGOTIABLE: any share_id the client tried to set is
 * dropped first, so `share_id=eq.<someone-else>` cannot be smuggled in. Everything else is passed
 * through — the portal filters by `id`, `seeded`, `order`, `limit` and those are all safe once the
 * row set is already confined to one share.
 */
function scopedFilter(rawFilter: string, shareId: string): string {
  const parts = (rawFilter ?? '')
    .split('&')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(p => !/^share_id=/i.test(p.split('=')[0] + '=')); // drop any client share_id
  parts.unshift(`share_id=eq.${encodeURIComponent(shareId)}`);
  return parts.join('&');
}

export async function POST(req: NextRequest) {
  if (!SUPA_URL || !SERVICE) return fail(500, 'Not available.');

  let payload: { token?: string; table?: string; op?: Op; filter?: string;
                 select?: string; order?: string; limit?: number; body?: unknown };
  try { payload = await req.json(); } catch { return fail(400, 'Bad request.'); }

  const { token, table, op } = payload;
  if (!token || !table || !op) return fail(400, 'Bad request.');

  const allowed = ALLOW[table];
  if (!allowed || !allowed.has(op)) return notFound(); // unknown table or op: indistinguishable from a miss

  const shareId = await shareIdForToken(String(token));
  if (!shareId) return notFound(); // bad/unknown token: same 404 as everything else

  try {
    const base = `${SUPA_URL}/rest/v1/${table}`;

    if (op === 'select') {
      const qp: string[] = [scopedFilter(payload.filter ?? '', shareId)];
      if (payload.select) qp.push(`select=${encodeURIComponent(payload.select)}`);
      if (payload.order)  qp.push(`order=${encodeURIComponent(payload.order)}`);
      if (payload.limit)  qp.push(`limit=${Math.min(500, Math.max(1, Number(payload.limit) || 200))}`);
      const r = await fetch(`${base}?${qp.join('&')}`, { headers: svc, cache: 'no-store' });
      const data = await r.json().catch(() => []);
      return NextResponse.json(Array.isArray(data) ? data : [], { status: r.ok ? 200 : r.status });
    }

    if (op === 'insert') {
      // share_id is FORCED onto every row, overriding whatever the client sent — a row cannot be
      // filed under a share the caller does not hold.
      const rows = (Array.isArray(payload.body) ? payload.body : [payload.body])
        .filter(Boolean)
        .map((row) => ({ ...(row as Record<string, unknown>), share_id: shareId }));
      const r = await fetch(base, {
        method: 'POST', headers: { ...svc, Prefer: 'return=minimal' }, body: JSON.stringify(rows),
      });
      return new NextResponse(null, { status: r.ok ? 204 : r.status });
    }

    if (op === 'update') {
      const url = `${base}?${scopedFilter(payload.filter ?? '', shareId)}`;
      // share_id is stripped from the patch body too, so an update cannot move a row to another
      // share even though the WHERE already confines which rows it can see.
      const patch = { ...(payload.body as Record<string, unknown>) };
      delete patch.share_id;
      const r = await fetch(url, {
        method: 'PATCH', headers: { ...svc, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      });
      return new NextResponse(null, { status: r.ok ? 204 : r.status });
    }

    // delete
    const url = `${base}?${scopedFilter(payload.filter ?? '', shareId)}`;
    const r = await fetch(url, { method: 'DELETE', headers: { ...svc, Prefer: 'return=minimal' } });
    return new NextResponse(null, { status: r.ok ? 204 : r.status });
  } catch {
    // Opaque: no PostgREST text, no url, no key fragment — same discipline as /api/share.
    return notFound();
  }
}
