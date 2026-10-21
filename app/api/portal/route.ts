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
import { PORTAL_POLICY, MAX_ROWS, REPAIRS_SCOPE_TERM, cleanFilter, cleanSelect, cleanOrder, cleanRow, scopeAllows, type Op } from '../../../lib/portalPolicy';
import { resolvePortalToken } from '../../../lib/shareAccess';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

// ── THE ALLOW-LIST IS THE POLICY ────────────────────────────────────────────────────
// Tables, operations, writable columns and the filter grammar live in lib/portalPolicy.ts
// (2026-10-19), derived from the portal's real call sites. A table absent there is unreachable
// through this route; an operation absent for a table is refused; a column absent from a table's
// write list is dropped; a filter, select or order outside the plain grammar is refused.

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const notFound = () => fail(404, 'Not found.');

/** The share scope is added by us and is NON-NEGOTIABLE; the client's terms are AND-ed after it. */
function scoped(terms: string[], shareId: string): string {
  return [`share_id=eq.${encodeURIComponent(shareId)}`, ...terms].join('&');
}

export async function POST(req: NextRequest) {
  if (!SUPA_URL || !SERVICE) return fail(500, 'Not available.');

  let payload: { token?: string; table?: string; op?: Op; filter?: string;
                 select?: string; order?: string; limit?: number; body?: unknown };
  try { payload = await req.json(); } catch { return fail(400, 'Bad request.'); }

  const { token, table, op } = payload;
  if (!token || !table || !op) return fail(400, 'Bad request.');

  const policy = Object.prototype.hasOwnProperty.call(PORTAL_POLICY, table) ? PORTAL_POLICY[table] : undefined;
  if (!policy || !policy.ops.has(op)) return notFound(); // unknown table or op: indistinguishable from a miss

  const terms = cleanFilter(payload.filter, op);
  if (!terms) return fail(400, 'Bad request.');
  // An update or delete must name its rows. Without a term of its own it ran against the whole share.
  if ((op === 'update' || op === 'delete') && terms.length === 0) return fail(400, 'Bad request.');

  // The token resolves to one share AND a scope (lib/shareAccess.ts): the original link edits, a
  // minted view-only link reads, a repairs link reads only the repair request. A scope that does
  // not cover this table/op is the same 404 as a bad token.
  const access = await resolvePortalToken(token);
  if (!access || !scopeAllows(access.scope, table, op)) return notFound();
  const shareId = access.shareId;
  if (access.scope === 'repairs') terms.push(REPAIRS_SCOPE_TERM);

  try {
    const base = `${SUPA_URL}/rest/v1/${table}`;

    if (op === 'select') {
      const select = cleanSelect(payload.select);
      const order  = cleanOrder(payload.order);
      if (select === null || order === null) return fail(400, 'Bad request.');
      const qp: string[] = [scoped(terms, shareId)];
      if (select) qp.push(`select=${encodeURIComponent(select)}`);
      if (order)  qp.push(`order=${encodeURIComponent(order)}`);
      if (payload.limit)  qp.push(`limit=${Math.min(500, Math.max(1, Number(payload.limit) || 200))}`);
      const r = await fetch(`${base}?${qp.join('&')}`, { headers: svc, cache: 'no-store' });
      const data = await r.json().catch(() => []);
      return NextResponse.json(Array.isArray(data) ? data : [], { status: r.ok ? 200 : r.status });
    }

    if (op === 'insert') {
      // share_id is FORCED onto every row, overriding whatever the client sent — a row cannot be
      // filed under a share the caller does not hold.
      const raw = (Array.isArray(payload.body) ? payload.body : [payload.body]).filter(Boolean);
      if (raw.length === 0 || raw.length > MAX_ROWS) return fail(400, 'Bad request.');
      const cleaned = raw.map(row => cleanRow(table, 'insert', row));
      if (cleaned.some(r => !r)) return fail(400, 'Bad request.');
      const rows = cleaned.map(row => ({ ...row, share_id: shareId }));
      const r = await fetch(base, {
        method: 'POST', headers: { ...svc, Prefer: 'return=minimal' }, body: JSON.stringify(rows),
      });
      return new NextResponse(null, { status: r.ok ? 204 : r.status });
    }

    if (op === 'update') {
      const url = `${base}?${scoped(terms, shareId)}`;
      // Only allow-listed columns survive — share_id and id never do, so an update can neither move
      // a row to another share nor re-key it.
      const patch = cleanRow(table, 'update', payload.body);
      if (!patch) return fail(400, 'Bad request.');
      const r = await fetch(url, {
        method: 'PATCH', headers: { ...svc, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      });
      return new NextResponse(null, { status: r.ok ? 204 : r.status });
    }

    // delete
    const guard = policy.deleteGuard ? [policy.deleteGuard] : [];
    const url = `${base}?${scoped([...terms, ...guard], shareId)}`;
    const r = await fetch(url, { method: 'DELETE', headers: { ...svc, Prefer: 'return=minimal' } });
    return new NextResponse(null, { status: r.ok ? 204 : r.status });
  } catch {
    // Opaque: no PostgREST text, no url, no key fragment — same discipline as /api/share.
    return notFound();
  }
}
