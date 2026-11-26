// ─── checkRequests — a homeowner asked their inspector to check a repair (approval pack item 3, SQL #152/#154) ──────
// SERVER-ONLY (holds the service role). Used by app/api/inspections/[id]/check-requests/route.ts; pure of Next so
// scripts/verify-check-requests.mjs can run it against a stubbed server.
//
// ── WHO MAY SEE THEM ────────────────────────────────────────────────────────────────────────────────────────────────
// The caller's OWN token reads home_finding_status first, so row-level security decides: the record's inspector (#152)
// or a company member who may read the inspection (#154 home_finding_status_company_read). No rows → nothing else is
// looked up. Only after the database has shown this caller the rows does the service role add the two things the
// inspector cannot read themselves: the finding's words (home_records.anomalies) and the email of the homeowner who
// asked (homeowner_profiles — they are signed in, so it is known; the mockup's "Contact homeowner").
export type CheckRequest = {
  ref: string; title: string; system: string; location: string; severity: string;
  status: 'open' | 'scheduled' | 'fixed'; fixedAt: string | null;
  requestedAt: string | null; note: string | null;
  verifiedAt: string | null; verifiedName: string | null;
  homeownerEmail: string | null;
};
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type CheckRequestsResult =
  | { ok: true; requests: CheckRequest[] }
  | { ok: false; status: number; error: string };

const PLAIN = /^[A-Za-z0-9._-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadCheckRequests(inspectionId: string, o: {
  supaUrl: string; anonKey: string; serviceKey: string; token: string; fetchFn?: Fetch;
}): Promise<CheckRequestsResult> {
  const f: Fetch = o.fetchFn ?? ((u, i) => fetch(u, i));
  if (!o.supaUrl || !o.anonKey || !o.serviceKey) return { ok: false, status: 503, error: 'Not available.' };
  if (!o.token || o.token === o.anonKey) return { ok: false, status: 401, error: 'Sign in again.' };
  if (!PLAIN.test(inspectionId)) return { ok: false, status: 400, error: 'Bad request.' };
  const sid = encodeURIComponent(inspectionId);
  try {
    // 1 · as the caller: RLS decides which statuses they may see
    const mine = await f(`${o.supaUrl}/rest/v1/home_finding_status?share_id=eq.${sid}`
      + `&check_requested_at=not.is.null&select=anomaly_ref,status,check_requested_at,check_note,verified_at,verified_name,updated_at,updated_by`
      + `&order=check_requested_at.desc`, { headers: { apikey: o.anonKey, Authorization: `Bearer ${o.token}` }, cache: 'no-store' });
    if (mine.status === 401) return { ok: false, status: 401, error: 'Sign in again.' };
    if (mine.status === 404) return { ok: true, requests: [] };              // #152 not applied
    if (!mine.ok) return { ok: false, status: 502, error: 'Check requests could not load.' };
    const rows = await mine.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) return { ok: true, requests: [] };
    // 2 · the service role, only for what the caller was just shown
    const svc = { apikey: o.serviceKey, Authorization: `Bearer ${o.serviceKey}` };
    const rec = await f(`${o.supaUrl}/rest/v1/home_records?share_id=eq.${sid}&select=anomalies&limit=1`, { headers: svc, cache: 'no-store' });
    const recRows = rec.ok ? await rec.json().catch(() => []) : [];
    const anomalies: any[] = Array.isArray(recRows?.[0]?.anomalies) ? recRows[0].anomalies : [];
    const byId = new Map(anomalies.filter(a => a && typeof a.id === 'string').map(a => [a.id, a]));
    const askers = [...new Set(rows.map((r: any) => r.updated_by).filter((u: unknown) => typeof u === 'string' && UUID.test(u)))] as string[];
    const emails = new Map<string, string>();
    if (askers.length) {
      const hp = await f(`${o.supaUrl}/rest/v1/homeowner_profiles?id=in.(${askers.join(',')})&select=id,email`, { headers: svc, cache: 'no-store' });
      const hpRows = hp.ok ? await hp.json().catch(() => []) : [];
      for (const h of Array.isArray(hpRows) ? hpRows : []) if (h?.id && typeof h.email === 'string') emails.set(h.id, h.email);
    }
    const requests: CheckRequest[] = rows.map((r: any) => {
      const a = byId.get(r.anomaly_ref) ?? {};
      return {
        ref: String(r.anomaly_ref),
        title: String((a.issueTitle && String(a.issueTitle).trim()) || a.description || a.unit || 'Finding').slice(0, 200),
        system: String(a.unit ?? ''), location: String([a.component, a.location].filter(Boolean).join(' · ')),
        severity: String(a.severity ?? ''),
        status: r.status === 'fixed' || r.status === 'scheduled' ? r.status : 'open',
        fixedAt: r.status === 'fixed' ? (r.updated_at ?? null) : null,
        requestedAt: r.check_requested_at ?? null, note: r.check_note ?? null,
        verifiedAt: r.verified_at ?? null, verifiedName: r.verified_name ?? null,
        homeownerEmail: emails.get(r.updated_by) ?? null,
      };
    });
    return { ok: true, requests };
  } catch {
    return { ok: false, status: 502, error: 'Check requests could not load.' };
  }
}
