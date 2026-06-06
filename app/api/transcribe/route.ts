// ─── /api/transcribe ─────────────────────────────────────────────────────────
// Voice → text for the Home App Ledrix chat. Requires a signed-in Supabase user,
// then forwards the recorded audio to the gateway's Whisper transcription endpoint
// (x-ledrix-key). Returns { text }.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GATEWAY_URL = (process.env.GATEWAY_URL ?? '').replace(/\/$/, '');
const GATEWAY_KEY = process.env.GATEWAY_KEY ?? '';
const SUPA_URL    = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export async function POST(req: NextRequest) {
  if (!GATEWAY_URL) return NextResponse.json({ error: 'AI not configured.' }, { status: 500 });

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !SUPA_URL || !SERVICE) return NextResponse.json({ error: 'Sign in to use Ledrix.' }, { status: 401 });
  const admin = createClient(SUPA_URL, SERVICE);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Sign in to use Ledrix.' }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }); }
  const audio = form.get('audio');
  if (!(audio instanceof File)) return NextResponse.json({ error: 'No audio.' }, { status: 400 });

  try {
    const out = new FormData();
    out.append('file', audio, 'voice.webm');
    out.append('model', 'whisper-1');
    out.append('language', 'en');
    const resp = await fetch(`${GATEWAY_URL}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { 'x-ledrix-key': GATEWAY_KEY },
      body: out,
    });
    if (!resp.ok) return NextResponse.json({ error: 'Transcription failed.' }, { status: 502 });
    const data = await resp.json();
    return NextResponse.json({ text: (data?.text ?? '').trim() });
  } catch {
    return NextResponse.json({ error: 'Network error.' }, { status: 502 });
  }
}
