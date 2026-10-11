// ─── /api/report-asset?path=<inspection-pdfs object path>&t=<share token> ────
// Signs a report asset (report.pdf, report.html, cover.jpg, findings/*.jpg) in
// the inspection-pdfs bucket server-side and 302-redirects to the short-lived
// signed URL. Keeps the service-role key off the client and works whether the
// bucket is public or private. `path` may be a bare object path or a full legacy
// public URL — normalizePath handles both.
//
// Phase 0b (2026-10-10): the share token is REQUIRED and the path must belong to the share it
// names (lib/shareAccess.ts). This used to sign any path for anyone, and report paths are
// `insp_<ms>/report.pdf` — walkable. Every miss is the same opaque 404.
import { NextRequest, NextResponse } from 'next/server';
import { normalizePath, signInspectionPdfsPath } from '../../../lib/storageSign';
import { shareIdForToken, pathInShare } from '../../../lib/shareAccess';

export const runtime = 'nodejs';

const notFound = () => new NextResponse(null, { status: 404 });

export async function GET(req: NextRequest) {
  const path = normalizePath((req.nextUrl.searchParams.get('path') ?? '').trim());
  // The signer normalizes again. Only a path that normalization leaves unchanged is checked and
  // signed as the SAME object — a doubled '/inspection-pdfs/' marker would otherwise pass the share
  // check on one path and be signed as another.
  if (!path || normalizePath(path) !== path) return notFound();
  const shareId = await shareIdForToken(req.nextUrl.searchParams.get('t'));
  if (!shareId || !pathInShare(path, shareId)) return notFound();
  const signed = await signInspectionPdfsPath(path, 60 * 60); // 1h
  if (!signed) return notFound();
  return NextResponse.redirect(signed, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
