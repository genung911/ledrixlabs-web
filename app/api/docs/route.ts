// ─── /api/docs ───────────────────────────────────────────────────────────────
// Uploads a homeowner document (manual, receipt, warranty, any house file) into the
// PUBLIC `home-documents` storage bucket via the service role, and returns its public
// URL + path. The portal then indexes it in the home_documents table (anon proxy).
// Requires: a public bucket named `home-documents` + SUPABASE_SERVICE_ROLE_KEY.
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET   = 'home-documents';
const MAX      = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  if (!SUPA_URL || !SERVICE) return NextResponse.json({ error: 'Storage not configured.' }, { status: 500 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Bad upload.' }, { status: 400 }); }
  const file = form.get('file');
  const shareId = String(form.get('shareId') ?? '').trim();
  if (!(file instanceof File) || !shareId) return NextResponse.json({ error: 'Missing file or share.' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'File too large (max 20 MB).' }, { status: 400 });

  const safeShare = shareId.replace(/[^a-zA-Z0-9._-]+/g, '');
  const safeName  = (file.name || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
  const path      = `${safeShare}/${Date.now()}_${safeName}`;
  const bytes     = Buffer.from(await file.arrayBuffer());

  const up = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: bytes,
  });
  if (!up.ok) return NextResponse.json({ error: 'Upload failed.' }, { status: 502 });

  return NextResponse.json({
    url:  `${SUPA_URL}/storage/v1/object/public/${BUCKET}/${path}`,
    path, name: file.name || safeName, size: file.size,
  });
}
