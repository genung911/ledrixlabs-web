// ─── /api/share/[token] ──────────────────────────────────────────────────────────────
// The ONE authorized way to read a delivered inspection report.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────
// The portal used to read `home_records` straight through /api/proxy with the ANON key,
// and the table's policy was `for select using (true)`. Verified 2026-08-28: an anonymous
// request returned every row for every client — addresses, client profiles, findings, and
// `share_token` itself. The unguessable-link design in the app (ShareService "SECURITY #1")
// could never work while the tokens were listable.
//
// This route replaces that read. It holds the service role SERVER-SIDE ONLY and answers
// exactly one question: "given this token, what is the one report it names?"
//
// ── THE AUTHORIZATION BOUNDARY, AND HOW IT IS ENFORCED ──────────────────────────────
//  1. A token is REQUIRED. There is no unfiltered listing path.
//  2. Lookup is a single equality on ONE row. The caller supplies a token and nothing else —
//     no filter, no select, no order, no range. Compare with /api/proxy, which forwards an
//     arbitrary PostgREST path.
//  3. The response is an ALLOW-LIST. `share_token`, `inspector_id` and `id` are never
//     returned. Today's anon read hands back the very credential that grants access.
//  4. Unknown token and wrong token are INDISTINGUISHABLE — both 404 with the same body.
//  5. The service role never reaches the client. It is read here and used here.
//  6. Errors are opaque. No PostgREST message, no URL, no key fragment is echoed back.
//
// ── THE TOKEN IS THE ONLY CREDENTIAL ────────────────────────────────────────────────
// A `share_id` (`insp_<timestamp>`) is time-ordered and guessable and is NOT accepted here.
// Four reports predating `share_token` were served through a temporary redirect while their
// links were re-issued; that migration completed 2026-08-28 and the fallback was removed.
// Do not reintroduce it — an id-addressable report is exactly the hole this route closes.
import { NextRequest, NextResponse } from 'next/server';
import { resolvePortalToken } from '../../../../lib/shareAccess';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** Returned to the portal. Deliberately does NOT include share_token, inspector_id or id. */
const FIELDS = [
  'share_id', 'address', 'city', 'state', 'zip', 'year_built', 'sqft', 'beds', 'baths',
  'garage', 'inspection_type', 'inspection_date', 'inspector', 'company', 'license_number',
  'anomalies', 'specs', 'profile', 'pdf_url', 'cover_url', 'created_at', 'updated_at',
].join(',');

/** One body for every miss, so a wrong token cannot be told from an unknown one. */
const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

/** A repairs link sees only what a repair request needs (2026-10-19) — not the report. */
const REPAIRS_FIELDS = ['address', 'city', 'state', 'zip', 'inspection_date'] as const;

async function selectOne(column: 'share_id', value: string) {
  const url = `${SUPA_URL}/rest/v1/home_records`
    + `?${column}=eq.${encodeURIComponent(value)}`
    + `&select=${encodeURIComponent(FIELDS)}`
    + `&limit=1`;
  const r = await fetch(url, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!SUPA_URL || !SERVICE) return NextResponse.json({ error: 'Not available.' }, { status: 500 });

  const { token } = await ctx.params;
  const slug = String(token ?? '').trim();
  // Shape gate before any query: a share slug is url-safe text, nothing more. This is what
  // stops a PostgREST filter from being smuggled through the path segment.
  if (!slug || slug.length > 128 || !/^[A-Za-z0-9._-]+$/.test(slug)) return notFound();

  try {
    // 1 · THE TOKEN PATH — the only one that returns a report. The token resolves to a share and
    // a scope (lib/shareAccess.ts, 2026-10-19): the original share_token edits, a minted link is
    // view-only or repairs-only, a revoked one resolves to nothing. The record is then read by
    // share_id, so share_token is never selected and cannot leave the server.
    const access = await resolvePortalToken(slug);
    if (access) {
      const rec = await selectOne('share_id', access.shareId);
      if (!rec) return notFound();
      const headers = { 'Cache-Control': 'private, no-store' };
      if (access.scope === 'repairs') {
        const out: Record<string, unknown> = { access: 'repairs' };
        for (const f of REPAIRS_FIELDS) out[f] = rec[f] ?? null;
        return NextResponse.json(out, { headers });
      }
      return NextResponse.json({ ...rec, access: access.scope }, { headers });
    }

    // The legacy `share_id` fallback lived here and is GONE (2026-08-28). It resolved an old
    // insp_<timestamp> link and redirected to its token URL while the four pre-token reports
    // were re-issued. That migration is complete and verified, so the enumerable id is no
    // longer an access credential — which was the entire point of removing it.
    return notFound();
  } catch {
    // Opaque on purpose — no PostgREST text, no URL, no key fragment.
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
}
