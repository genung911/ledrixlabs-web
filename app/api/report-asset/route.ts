// ─── /api/report-asset?path=<inspection-pdfs object path> ────────────────────
// Signs a report asset (report.pdf, report.html, cover.jpg, findings/*.jpg) in
// the inspection-pdfs bucket server-side and 302-redirects to the short-lived
// signed URL. Keeps the service-role key off the client and works whether the
// bucket is public or private. `path` may be a bare object path or a full legacy
// public URL — signInspectionPdfsPath normalizes both.
import { NextRequest, NextResponse } from 'next/server';
import { signInspectionPdfsPath } from '../../../lib/storageSign';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const path = (req.nextUrl.searchParams.get('path') ?? '').trim();
  if (!path) return new NextResponse(null, { status: 404 });
  const signed = await signInspectionPdfsPath(path, 60 * 60); // 1h
  if (!signed) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(signed);
}
