// ─── /api/docs — a homeowner's document locker, behind the share token ───────────────────
//
// (Homeowner security pass, 2026-10-19.)
//
// ── WHAT WAS OPEN ───────────────────────────────────────────────────────────────────────
// The old route took a `shareId` form field — the enumerable id, not the token — and uploaded with
// the service role and `x-upsert: true` into `<shareId>/<ms>_<name>`. Anyone who knew or guessed a
// share_id could add files to that home or overwrite one of its files. It then returned a
// `/object/public/home-documents/…` URL, and the client filed that URL and path into
// home_documents itself — so a row could name any object, and the only thing protecting a file
// was an unguessable URL (which stops working anyway once the bucket is private).
//
// ── THE MODEL ───────────────────────────────────────────────────────────────────────────
// The same credential as /api/portal and /api/report-asset: the share TOKEN, resolved here to one
// share and a scope (lib/shareAccess.ts). Every operation is confined to that share:
//   POST {action:'upload-url', token, name, size, kind}   edit links only. Validates type and size,
//        picks a fresh STAGING path (`<share>/_incoming/…`) and returns a signed upload URL for
//        exactly that path, never overwriting. The browser sends the file STRAIGHT TO STORAGE —
//        Vercel refuses request bodies over 4.5 MB, so a file routed through here could never reach
//        the advertised 20 MB. Also sweeps this share's own unfinished uploads older than 6 h.
//   POST {action:'complete', token, path, name, kind}     edit links only. The path must be a staging
//        path this route issues for this share and name. The object is MOVED to its final path —
//        which no upload URL can write — and only then checked: stored size, stored type, and its
//        first bytes against the type. Any failure deletes it. Only then is the row written — HERE,
//        never by the client.
//   GET  ?t=<token>&id=<doc id>   edit or view-only links. The row must belong to the share and
//        its path must sit under it; then a 5-minute signed URL (302).
//   DELETE json {token, id}       edit links only. Removes the stored file and its row together.
// Every miss is the same opaque 404. Rules: lib/homeDocuments.ts.
//
// Requires: SUPABASE_SERVICE_ROLE_KEY, and the `home-documents` bucket set PRIVATE
// (supabase_home_documents_private.sql). Signed URLs work whether or not it is private yet.
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { shareIdForToken, editShareIdForToken, shareAccessConfigured } from '../../../lib/shareAccess';
import {
  DOC_BUCKET, DOC_MAX_BYTES, DOC_URL_TTL_SECONDS, DOC_KINDS,
  bytesMatchType, docContentType, docPathInShare, finalDocPath, isDocId, isNewDocPath, newDocPath,
  staleStagingNames, stagingPrefix,
} from '../../../lib/homeDocuments';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const notFound = () => new NextResponse(null, { status: 404 });
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const objectUrl = (path: string) =>
  `${SUPA_URL}/storage/v1/object/${DOC_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

/** The document row, only if it belongs to this share. */
async function docInShare(id: string, shareId: string): Promise<{ id: string; path: string | null } | null> {
  const r = await fetch(
    `${SUPA_URL}/rest/v1/home_documents?id=eq.${encodeURIComponent(id)}`
      + `&share_id=eq.${encodeURIComponent(shareId)}&select=id,path&limit=1`,
    { headers: svc, cache: 'no-store' },
  );
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? { id: String(rows[0].id), path: rows[0].path ?? null } : null;
}

/** The stored object's size and type, read back from storage — never taken from the client. */
async function storedObject(path: string): Promise<{ size: number; mimetype: string } | null> {
  const slash = path.lastIndexOf('/');
  const r = await fetch(`${SUPA_URL}/storage/v1/object/list/${DOC_BUCKET}`, {
    method: 'POST',
    headers: { ...svc, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: path.slice(0, slash), search: path.slice(slash + 1), limit: 5 }),
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const items = await r.json().catch(() => []);
  const hit = Array.isArray(items) ? items.find((o: any) => o?.name === path.slice(slash + 1)) : null;
  const size = Number(hit?.metadata?.size);
  return hit && Number.isFinite(size) ? { size, mimetype: String(hit.metadata?.mimetype ?? '') } : null;
}

/** The stored object's first bytes (at most 64), read with the service role. The Range header keeps
 *  the reply to 64 bytes, and callers check the size (≤ 20 MB) first. Read whole, not with a stream
 *  reader: under Next.js (staging, 2026-10-20) a hand-rolled reader + cancel() never returned, and
 *  every upload hung. */
async function storedHead(path: string): Promise<Uint8Array | null> {
  const r = await fetch(objectUrl(path), { headers: { ...svc, Range: 'bytes=0-63' }, cache: 'no-store' });
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer()).subarray(0, 64);
}

const removeObject = (path: string) => fetch(objectUrl(path), { method: 'DELETE', headers: svc }).catch(() => {});

/** Best effort: delete this share's unfinished uploads older than the cutoff. Only `<share>/_incoming/`. */
async function sweepStaging(shareId: string): Promise<void> {
  try {
    const prefix = stagingPrefix(shareId);
    const r = await fetch(`${SUPA_URL}/storage/v1/object/list/${DOC_BUCKET}`, {
      method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, sortBy: { column: 'name', order: 'asc' } }), cache: 'no-store',
    });
    if (!r.ok) return;
    const items = await r.json().catch(() => []);
    const stale = staleStagingNames(Array.isArray(items) ? items.map((o: any) => o?.name) : []);
    if (!stale.length) return;
    await fetch(`${SUPA_URL}/storage/v1/object/${DOC_BUCKET}`, {
      method: 'DELETE', headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: stale.map(n => `${prefix}/${n}`) }),
    });
  } catch { /* the next upload tries again */ }
}

export async function POST(req: NextRequest) {
  if (!shareAccessConfigured()) return NextResponse.json({ error: 'Storage not configured.' }, { status: 500 });

  let body: { action?: string; token?: unknown; name?: unknown; size?: unknown; kind?: unknown; path?: unknown };
  try { body = await req.json(); } catch { return bad('Bad request.'); }
  const shareId = await editShareIdForToken(body.token);
  if (!shareId) return notFound();
  const name = String(body.name ?? '').slice(0, 200);
  const contentType = docContentType(name);
  const kind = DOC_KINDS.has(String(body.kind)) ? String(body.kind) : 'other';

  try {
    if (body.action === 'upload-url') {
      const size = Number(body.size);
      if (!name || !Number.isFinite(size) || size <= 0) return bad('Missing file.');
      if (size > DOC_MAX_BYTES) return bad('File too large (max 20 MB).');
      if (!contentType) return bad('That file type is not supported.');
      await sweepStaging(shareId);
      const path = newDocPath(shareId, name, randomBytes(6).toString('hex'));
      const r = await fetch(`${SUPA_URL}/storage/v1/object/upload/sign/${DOC_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: { ...svc, 'x-upsert': 'false' }, cache: 'no-store',
      });
      if (!r.ok) return NextResponse.json({ error: 'Upload failed.' }, { status: 502 });
      const { url } = await r.json();
      if (!url) return NextResponse.json({ error: 'Upload failed.' }, { status: 502 });
      return NextResponse.json({
        uploadUrl: `${SUPA_URL}/storage/v1${String(url).replace(/^\/storage\/v1/, '')}`,
        path, contentType,
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (body.action === 'complete') {
      const staged = String(body.path ?? '');
      // Only a staging path this route could have issued for this share and this file name.
      if (!isNewDocPath(staged, shareId, name) || !contentType) return notFound();
      const path = finalDocPath(staged, shareId);
      const dup = await fetch(`${SUPA_URL}/rest/v1/home_documents?path=eq.${encodeURIComponent(path)}&select=id&limit=1`,
        { headers: svc, cache: 'no-store' });
      if (!dup.ok) return NextResponse.json({ error: 'Upload failed.' }, { status: 502 });
      if ((await dup.json().catch(() => [])).length) return notFound();
      // Move first, check second: the upload URL names only the staging path, so once moved the
      // object cannot be swapped between the check and the row. A second completion finds nothing
      // to move.
      const mv = await fetch(`${SUPA_URL}/storage/v1/object/move`, {
        method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketId: DOC_BUCKET, sourceKey: staged, destinationKey: path }), cache: 'no-store',
      });
      if (!mv.ok) return notFound();
      const obj = await storedObject(path);
      if (!obj) { await removeObject(path); return NextResponse.json({ error: 'Upload failed.' }, { status: 502 }); }
      const head = obj.size > 0 && obj.size <= DOC_MAX_BYTES && obj.mimetype === contentType ? await storedHead(path) : null;
      if (!head || !bytesMatchType(head, contentType)) {
        await removeObject(path);
        return bad(obj.size > DOC_MAX_BYTES ? 'File too large (max 20 MB).'
          : obj.size <= 0 ? 'Missing file.' : 'That file type is not supported.');
      }
      const ins = await fetch(`${SUPA_URL}/rest/v1/home_documents`, {
        method: 'POST',
        headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        // `url` is NOT NULL in the schema; a stored file is never reachable by it, so it records the
        // object reference rather than a public link.
        body: JSON.stringify([{ share_id: shareId, name, url: `storage://${DOC_BUCKET}/${path}`, path, kind, size: obj.size }]),
      });
      if (!ins.ok) { await removeObject(path); return NextResponse.json({ error: 'Upload failed.' }, { status: 502 }); }
      const [row] = await ins.json();
      return NextResponse.json({ id: row?.id, name, kind, size: obj.size });
    }

    return bad('Bad request.');
  } catch {
    return NextResponse.json({ error: 'Upload failed.' }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  if (!shareAccessConfigured()) return notFound();
  const id = req.nextUrl.searchParams.get('id');
  if (!isDocId(id)) return notFound();
  const shareId = await shareIdForToken(req.nextUrl.searchParams.get('t'));
  if (!shareId) return notFound();
  try {
    const doc = await docInShare(id, shareId);
    if (!doc || !docPathInShare(doc.path, shareId)) return notFound();
    const r = await fetch(`${SUPA_URL}/storage/v1/object/sign/${DOC_BUCKET}/${doc.path!.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: DOC_URL_TTL_SECONDS }),
      cache: 'no-store',
    });
    if (!r.ok) return notFound();
    const { signedURL } = await r.json();
    if (!signedURL) return notFound();
    const signed = `${SUPA_URL}/storage/v1${String(signedURL).replace(/^\/storage\/v1/, '')}`;
    return NextResponse.redirect(signed, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch {
    return notFound();
  }
}

export async function DELETE(req: NextRequest) {
  if (!shareAccessConfigured()) return notFound();
  let body: { token?: unknown; id?: string };
  try { body = await req.json(); } catch { return bad('Bad request.'); }
  if (!isDocId(body.id)) return notFound();
  const shareId = await editShareIdForToken(body.token);
  if (!shareId) return notFound();
  try {
    const doc = await docInShare(body.id, shareId);
    if (!doc) return notFound();
    // The file goes first: a row left behind can be deleted again, a file left behind is orphaned.
    // A row whose path is NOT under this share (one the old client filed) loses only its row —
    // the object it names belongs to someone else and is never touched.
    if (doc.path && docPathInShare(doc.path, shareId)) {
      const del = await fetch(objectUrl(doc.path), { method: 'DELETE', headers: svc });
      // Supabase Storage reports a missing object as 404, or as 400 whose body says not found.
      // Only those count as "already gone"; any other failure keeps the row so the delete can be retried.
      const gone = del.ok || del.status === 404
        || (del.status === 400 && /not.?found|"404"/i.test(await del.text().catch(() => '')));
      if (!gone) return NextResponse.json({ error: 'Delete failed.' }, { status: 502 });
    }
    const r = await fetch(
      `${SUPA_URL}/rest/v1/home_documents?id=eq.${encodeURIComponent(doc.id)}&share_id=eq.${encodeURIComponent(shareId)}`,
      { method: 'DELETE', headers: { ...svc, Prefer: 'return=minimal' } },
    );
    return new NextResponse(null, { status: r.ok ? 204 : 502 });
  } catch {
    return notFound();
  }
}
