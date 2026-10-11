// ─── portalAssets — every signed-asset URL the portal builds carries its share token ───
// Client-safe (no secrets). Phase 0b, 2026-10-10: /api/photo and /api/report-asset now refuse a
// request without the share token, and refuse a path outside the share that token names
// (lib/shareAccess.ts). The portal already holds the token — it is the /share/<token> slug — so
// it hands it along here.
//
// Stored report.html is the other half. Its <img> tags were written by the app as
// `https://www.ledrixlabs.com/api/report-asset?path=…` with no token, and those files already sit
// in storage for every published report. withTokenInHtml adds the token to each of them as the
// portal loads the HTML, so old reports keep their photos without being republished.

export type AssetRoute = 'photo' | 'report-asset';

/** `/api/<route>?path=<path>&t=<token>` — the only shape the portal should emit. */
export function assetUrl(route: AssetRoute, path: string, token: string): string {
  return `/api/${route}?path=${encodeURIComponent(path)}&t=${encodeURIComponent(token)}`;
}

/** Append the token to every tokenless /api/photo or /api/report-asset URL in an HTML string. */
export function withTokenInHtml(html: string, token: string): string {
  if (!html || !token) return html;
  const t = encodeURIComponent(token);
  // The path value is URL-encoded by the app, so it stops at the first character that cannot be
  // in it. A URL that already carries a t= is left alone.
  return html.replace(
    /(\/api\/(?:photo|report-asset)\?path=[^"'\s<>()&]*)(&(?:amp;)?t=)?/g,
    (m, url: string, has?: string) => (has ? m : `${url}&t=${t}`),
  );
}

// ── Which report.html is the CURRENT one (Security S-14, 2026-10-10) ────────────────────────────
// The app now publishes in two steps: it stages report.pdf AND report.html under a fresh
// `<shareId>/reports/<version>/` prefix, then ONE record write moves `home_records.pdf_url` to that
// version. The PDF has always been read through `pdf_url`; the default Full Report was read from
// the FIXED `<shareId>/report.html`, which the app can only overwrite after that record write — so
// a failed overwrite showed the new data and PDF beside the previous web report.
//
// `pdf_url` therefore names the current version for BOTH documents: the html is the sibling of the
// versioned PDF. Records published before this (pdf_url = `<shareId>/report.pdf`, or none) have no
// versioned html and keep reading the fixed path, exactly as before. The fixed path also stays the
// fallback when a version's html is missing (an app render that staged no html).
//
// The derived path must satisfy the same rules /api/report-asset enforces (lib/storageSign
// normalizePath + lib/shareAccess pathInShare), re-stated here because both of those modules hold
// server-only configuration; scripts/verify-report-html-version.mjs checks the two agree.

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const plainSegment = (s: string) => SEGMENT.test(s) && s !== '.' && s !== '..';

/** Bucket-relative object path of a stored pdf_url, or null if it is not a clean, in-share path.
 *  Exported for scripts/verify-report-html-version.mjs, which tests each refusal on its own. */
export function pdfObjectPath(pdfUrl: string | null | undefined, shareId: string): string | null {
  let p = String(pdfUrl ?? '').trim();
  if (!p) return null;
  const marker = '/inspection-pdfs/';
  const i = p.indexOf(marker);
  if (i >= 0) p = p.slice(i + marker.length);   // same strip as storageSign.normalizePath
  p = p.replace(/^\/+/, '');
  if (!p || p.startsWith('file')) return null;
  // Same refusals as shareAccess.pathInShare: no traversal, backslash, doubled slash, control
  // characters, query, fragment or re-encoding.
  if (p.includes('..') || p.includes('\\') || p.includes('//')) return null;
  if (/[\u0000-\u001f?#%]/.test(p)) return null;
  return p.startsWith(`${shareId}/`) ? p : null;
}

/**
 * The bucket paths to try, in order, for this record's DEFAULT Full Report (no history version
 * selected): the html of the version `pdf_url` names, when it names one, then the legacy fixed
 * path. Empty when the share id is not one plain path segment.
 */
export function defaultReportHtmlPaths(shareId: string | null | undefined, pdfUrl: string | null | undefined): string[] {
  const id = String(shareId ?? '');
  if (!plainSegment(id)) return [];
  const fixed = `${id}/report.html`;
  const pdf = pdfObjectPath(pdfUrl, id);
  const parts = pdf ? pdf.split('/') : [];
  // Exactly `<shareId>/reports/<version>/report.pdf` — nothing deeper, nothing else.
  if (parts.length === 4 && parts[0] === id && parts[1] === 'reports' && plainSegment(parts[2]) && parts[3] === 'report.pdf') {
    return [`${id}/reports/${parts[2]}/report.html`, fixed];
  }
  return [fixed];
}

/**
 * Fetch each URL in order and return the first that yields a real report (an OK response whose
 * body is long enough to be one — the portal's existing test), or null when none does. A failed
 * or empty candidate falls through to the next; nothing is retried.
 */
export async function loadFirstReport(
  urls: string[],
  fetchImpl: (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>,
): Promise<string | null> {
  for (const url of urls) {
    try {
      const r = await fetchImpl(url);
      if (!r.ok) continue;
      const t = await r.text();
      if (t && t.length > 300) return t;
    } catch { /* next candidate */ }
  }
  return null;
}
