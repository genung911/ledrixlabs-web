// ─── homeDocuments — the rules for a homeowner's stored files (pure) ─────────────────────
// (Homeowner security pass, 2026-10-19.) Used by app/api/docs/route.ts; pure so the rules can be
// tested without a server (scripts/verify-portal-security.mjs).
//
// A stored document lives at `<share_id>/<ms>_<random>_<name>` in the PRIVATE `home-documents`
// bucket. It is reachable only through /api/docs with the share token: the server resolves the
// token, loads the row from that share, checks the row's path sits under that share, and signs a
// short-lived URL. Knowing a path, a share_id or an old public URL is not enough.
//
// An upload first lands at `<share_id>/_incoming/<ms>_<random>_<name>` — the only path its signed
// upload URL can write. Completion MOVES it to the final path (which no upload URL names), then
// checks the moved object; so a file that was checked can never be replaced through the URL that
// uploaded it, and nothing under `_incoming/` is ever filed or served.

export const DOC_BUCKET = 'home-documents';
export const DOC_MAX_BYTES = 20 * 1024 * 1024;      // 20 MB, as before
export const DOC_URL_TTL_SECONDS = 5 * 60;

// The kinds of file a home locker holds: manuals, receipts, warranties, photos, spreadsheets.
// Anything else (html, svg, scripts, archives) is refused — a signed URL serves it from our
// storage domain with the type we stored.
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', gif: 'image/gif',
  txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// 'document' is what the portal's Documents tile sends; the rest are the schema's own list.
export const DOC_KINDS = new Set(['manual', 'document', 'receipt', 'warranty', 'report', 'other']);

/** The content type we will store for this file name, or null when the type is not accepted. */
export function docContentType(fileName: string): string | null {
  const ext = String(fileName ?? '').toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1];
  return ext && TYPES[ext] ? TYPES[ext] : null;
}

export function safeDocName(fileName: string): string {
  return (String(fileName ?? '') || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'document';
}

const INCOMING = '_incoming';
/** How long an unfinished upload may sit in `_incoming/` before it is swept (signed upload URLs last 2 h). */
export const STAGING_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** A fresh STAGING path under the share — what a signed upload URL is issued for. Random: never reused. */
export function newDocPath(shareId: string, fileName: string, rand: string, now = Date.now()): string {
  return `${shareId}/${INCOMING}/${now}_${rand}_${safeDocName(fileName)}`;
}

/** Where a completed upload is filed: the staging path without `_incoming/`. */
export function finalDocPath(stagingPath: string, shareId: string): string {
  return `${shareId}/${stagingPath.slice(`${shareId}/${INCOMING}/`.length)}`;
}

/**
 * The names under `<share>/_incoming/` (as Storage lists them) of uploads older than the cutoff.
 * Only names this module issues qualify; anything else is left alone.
 */
export function staleStagingNames(names: unknown[], now = Date.now(), maxAgeMs = STAGING_MAX_AGE_MS): string[] {
  return names.filter((n): n is string => typeof n === 'string'
    && /^(\d{13})_[0-9a-f]{12}_[A-Za-z0-9._-]+$/.test(n) && now - Number(n.slice(0, 13)) > maxAgeMs);
}
export const stagingPrefix = (shareId: string) => `${shareId}/${INCOMING}`;

/** True when a stored path is a plain object path directly under this share's folder. */
export function docPathInShare(path: unknown, shareId: string): boolean {
  const p = String(path ?? '');
  if (!p || !shareId) return false;
  if (p.includes('..') || p.includes('\\') || p.includes('//') || p.startsWith('/')) return false;
  if (/[\u0000-\u001f?#%]/.test(p)) return false;
  if (p.startsWith(`${shareId}/${INCOMING}/`)) return false;   // unfinished uploads are never served
  return p.startsWith(`${shareId}/`) && p.length > shareId.length + 1;
}

/**
 * True when `path` is exactly what newDocPath would issue for this share and file name:
 * `<share>/_incoming/<13-digit ms>_<12 hex>_<safe name>`. /api/docs `complete` accepts nothing
 * else, so a client cannot file a row for an existing object, another share's object, or a renamed one.
 */
export function isNewDocPath(path: string, shareId: string, fileName: string): boolean {
  const p = String(path ?? '');
  const head = `${shareId}/${INCOMING}/`;
  if (!shareId || !p.startsWith(head)) return false;
  if (p.includes('..') || p.includes('\\') || /[\u0000-\u001f?#%]/.test(p)) return false;
  const m = /^(\d{13})_([0-9a-f]{12})_([A-Za-z0-9._-]+)$/.exec(p.slice(head.length));
  return !!m && m[3] === safeDocName(fileName);
}

/**
 * Whether a file's first bytes are what its extension claims. The stored content type is whatever
 * the browser sent with the upload, so it is not evidence on its own; this reads the file itself.
 * Text types must not be markup or binary.
 */
export function bytesMatchType(head: Uint8Array, contentType: string): boolean {
  const at = (i: number, ...bs: number[]) => bs.every((b, k) => head[i + k] === b);
  const ascii = (i: number, s: string) => at(i, ...s.split('').map(c => c.charCodeAt(0)));
  switch (contentType) {
    case 'application/pdf': return ascii(0, '%PDF-');
    case 'image/jpeg': return at(0, 0xff, 0xd8, 0xff);
    case 'image/png': return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/gif': return ascii(0, 'GIF87a') || ascii(0, 'GIF89a');
    case 'image/webp': return ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'image/heic': case 'image/heif': {
      const brand = Array.from(head.slice(8, 12), b => String.fromCharCode(b)).join('');
      return ascii(4, 'ftyp') && ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return at(0, 0x50, 0x4b, 0x03, 0x04);
    case 'application/msword': case 'application/vnd.ms-excel':
      return at(0, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    case 'text/plain': case 'text/csv': {
      if (head.includes(0)) return false;
      const lead = new TextDecoder().decode(head).replace(/^\uFEFF/, '').trimStart();
      return !lead.startsWith('<');
    }
    default: return false;
  }
}

/** Document ids are uuids (home_documents.id default gen_random_uuid()). */
export function isDocId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
