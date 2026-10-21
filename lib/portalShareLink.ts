// ─── portalShareLink — what the portal's Share buttons hand out (client-safe, pure) ──────
// (Homeowner security pass 3, 2026-10-20.) Used by app/share/[id]/page.tsx; fetch is passed in so
// scripts/verify-portal-security.mjs runs this exact code against the real /api/portal-links.
//
// The rule: a Share button never distributes MORE access than it was asked for. From an edit link
// it must mint a view-only (or repairs-only) link; if minting fails for any reason — the
// portal_links table not applied yet, a database error, the per-home cap — it reports an error and
// shares nothing. It used to fall back to the page's own URL, which is the edit link.
// A view-only page may share its own URL: that is the same view-only access.

export type ShareLinkResult = { ok: true; url: string } | { ok: false; message: string };
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export function mintErrorMessage(status: number): string {
  if (status === 503) return 'Sharing a view-only link is not available yet. Nothing was shared.';
  if (status === 409) return 'This home has too many active shared links. Nothing was shared.';
  return 'Could not create a shareable link right now. Nothing was shared — please try again.';
}

/**
 * The URL a Share button may hand out. `pageScope` is this page's own link scope (/api/share
 * `access`); `kind` is what is being shared. Never returns the edit link.
 */
export async function portalShareUrl(opts: {
  fetchFn: FetchFn; origin: string; token: string; pageScope: 'edit' | 'read';
  kind: 'read' | 'repairs'; currentHref?: string;
}): Promise<ShareLinkResult> {
  const { fetchFn, origin, token, pageScope, kind, currentHref } = opts;
  if (kind === 'read' && pageScope === 'read' && currentHref) return { ok: true, url: currentHref };
  if (pageScope !== 'edit') return { ok: false, message: mintErrorMessage(404) };
  try {
    const r = await fetchFn('/api/portal-links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', token, scope: kind }),
    });
    if (!r.ok) return { ok: false, message: mintErrorMessage(r.status) };
    const j = await r.json().catch(() => null);
    const minted = typeof j?.token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(j.token) ? j.token : null;
    if (!minted || minted === token) return { ok: false, message: mintErrorMessage(0) };
    return { ok: true, url: `${origin}/share/${minted}${kind === 'repairs' ? '/repairs' : ''}` };
  } catch {
    return { ok: false, message: mintErrorMessage(0) };
  }
}
