// ─── passedOn — earlier owners' inspections, passed on to the person who holds the home now (hr2, SQL #155) ─────────
// SERVER-ONLY (signs storage with the service role). Used by app/api/passed-on/route.ts; pure of Next so
// scripts/verify-pass-on-web.mjs can run it against a stubbed server.
// The CALLER's own token asks passed_on_reports (#155): the database decides — only someone holding the home now through
// this report, and only reports an earlier owner chose to pass on. Only then is each report's PDF signed (an hour).
export type PassedOn = { shareId: string; date: string | null; company: string | null; inspector: string | null; pdfUrl: string | null };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const PLAIN = /^[A-Za-z0-9._-]{1,128}$/;

export async function loadPassedOn(shareId: string, o: { supaUrl: string; anonKey: string; token: string; fetchFn?: Fetch;
  sign: (path: string) => Promise<string | null> }): Promise<{ ok: true; reports: PassedOn[] } | { ok: false; status: number; error: string }> {
  const f: Fetch = o.fetchFn ?? ((u, i) => fetch(u, i));
  if (!o.supaUrl || !o.anonKey) return { ok: false, status: 503, error: 'Not available.' };
  if (!o.token || o.token === o.anonKey) return { ok: false, status: 401, error: 'Sign in first.' };
  if (!PLAIN.test(shareId)) return { ok: false, status: 400, error: 'Bad request.' };
  try {
    const r = await f(`${o.supaUrl}/rest/v1/rpc/passed_on_reports`, {
      method: 'POST', headers: { apikey: o.anonKey, Authorization: `Bearer ${o.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_share_id: shareId }), cache: 'no-store',
    });
    if (r.status === 404) return { ok: true, reports: [] };              // #155 not applied
    if (!r.ok) return { ok: false, status: r.status === 401 ? 401 : 502, error: 'Not available.' };
    const rows = await r.json().catch(() => []);
    const list = (Array.isArray(rows) ? rows : []).filter(x => typeof x?.share_id === 'string' && PLAIN.test(x.share_id) && x.share_id !== shareId);
    const reports = await Promise.all(list.map(async (x): Promise<PassedOn> => ({
      shareId: x.share_id, date: x.inspection_date ?? null, company: x.company ?? null, inspector: x.inspector ?? null,
      pdfUrl: await o.sign(`${x.share_id}/report.pdf`).catch(() => null),
    })));
    return { ok: true, reports };
  } catch { return { ok: false, status: 502, error: 'Not available.' }; }
}
