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
// ── LEGACY `share_id` FALLBACK — MIGRATION ONLY, NOT AUTHORIZATION ──────────────────
// Links delivered before `share_token` existed carry the enumerable `insp_<timestamp>`.
// Four such reports exist (verified 2026-08-28). Those links must not break, so a legacy id
// resolves and REDIRECTS to its token URL — the browser lands on the token form and the id
// stops being used.
//
// This is a MIGRATION MECHANISM WITH AN END DATE, not permanent product behaviour. An
// `insp_<timestamp>` is time-ordered and guessable; leaving it a valid credential would
// reintroduce exactly what this route closes. Once the four reports have been re-issued and
// verified, DELETE the `legacyRedirect` branch below and this comment with it.
import { NextRequest, NextResponse } from 'next/server';

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

async function selectOne(column: 'share_token' | 'share_id', value: string) {
  const url = `${SUPA_URL}/rest/v1/home_records`
    + `?${column}=eq.${encodeURIComponent(value)}`
    + `&select=${encodeURIComponent(FIELDS + ',share_token')}`   // token read internally, stripped below
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
    // 1 · THE TOKEN PATH — the only one that returns a report.
    const byToken = await selectOne('share_token', slug);
    if (byToken) {
      const { share_token, ...safe } = byToken;   // never leaves the server
      return NextResponse.json(safe, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    // 2 · LEGACY MIGRATION ONLY — resolve an old id and send the browser to the token URL.
    //     REMOVE THIS BLOCK once the four legacy reports have been re-issued and verified.
    const legacyRedirect = await selectOne('share_id', slug);
    if (legacyRedirect?.share_token) {
      return NextResponse.json(
        { redirectTo: `/share/${legacyRedirect.share_token}`, legacy: true },
        { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    return notFound();
  } catch {
    // Opaque on purpose — no PostgREST text, no URL, no key fragment.
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
}
