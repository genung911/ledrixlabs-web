// ─── /sample.pdf ─────────────────────────────────────────────────────────────
// Stable public route for the marketing "Sample PDF Report" tile. Server-side
// signs the featured sample inspection's report.pdf in the inspection-pdfs bucket
// and 302-redirects to the signed URL, so the tile keeps working after the owner
// flips that bucket to private (no raw public storage URL in the client bundle).
import { NextResponse } from 'next/server';
import { signInspectionPdfsPath } from '../../lib/storageSign';

export const runtime = 'nodejs';

// The inspection whose PDF is featured on the marketing page (keep in sync with
// SAMPLE_PORTAL_ID in components/marketing/SampleDeliverables.tsx).
const SAMPLE_ID = 'insp_sample_1783195334539';

export async function GET() {
  const signed = await signInspectionPdfsPath(`${SAMPLE_ID}/report.pdf`, 60 * 60);
  if (!signed) return new NextResponse('Sample report unavailable', { status: 404 });
  return NextResponse.redirect(signed);
}
