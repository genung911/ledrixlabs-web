// ─── /api/ledrix/repair ──────────────────────────────────────────────────────
// Drafts ONE neutral repair REQUEST line from an inspection finding, for the
// buyer's Repair Request list. The BUYER decides what to include and owns the
// wording — this is only a draft. Same gating as /api/ledrix: signed-in Supabase
// user (magic-link), per-user daily cap, forward to the Railway gateway.
//
// POST body: { finding: { unit?, location?, severity?, description? } }
// Returns:   { item, remedy, request }   (or { error })
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bumpUsage, DAILY_CAP } from '../../../../lib/usage';

const GATEWAY_URL = (process.env.GATEWAY_URL ?? '').replace(/\/$/, '');
const GATEWAY_KEY = process.env.GATEWAY_KEY ?? '';
const SUPA_URL    = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Report severity vocab → plain label the buyer/seller read.
function sevLabel(s?: string): string {
  return s === 'critical' ? 'safety issue' : s === 'anomaly' ? 'deficiency' : 'maintenance item';
}

const REPAIR_SYSTEM =
  'You convert a home-inspection finding into a single neutral REPAIR REQUEST line a home ' +
  'BUYER may optionally include in a request to the seller. The buyer decides what to ask for — ' +
  'you only draft clear, fair wording. Return ONLY valid JSON, no markdown:\n' +
  '{"item":"Electrical panel","remedy":"Have a licensed electrician correct the double-tapped breaker","request":"Request that the seller have a licensed electrician evaluate and correct the double-tapped breaker at the main electrical panel prior to closing."}\n' +
  'Rules:\n' +
  '- Factual and neutral: describe the deficiency and the requested correction. NO alarmist language, NO legal conclusions, NO demands or ultimatums, NO dollar amounts.\n' +
  '- Request/conditional voice ("Request that the seller…"). The buyer is asking, not ordering.\n' +
  '- Severity guides the ask: safety/deficiency → correction by a licensed trade; maintenance → "monitor or optionally address".\n' +
  '- request: 1–2 sentences. item: short component label. remedy: the corrective action, concise.';

type Finding = { unit?: string; location?: string; severity?: string; description?: string };

export async function POST(req: NextRequest) {
  if (!GATEWAY_URL) return NextResponse.json({ error: 'AI not configured.' }, { status: 500 });

  // 1) Require a signed-in user (same as /api/ledrix).
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !SUPA_URL || !SERVICE) return NextResponse.json({ error: 'Sign in to use Ledrix.' }, { status: 401 });
  const admin = createClient(SUPA_URL, SERVICE);
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Sign in to use Ledrix.' }, { status: 401 });

  // 2) Free-beta cap.
  const used = await bumpUsage(admin, user.id);
  if (used > DAILY_CAP) {
    return NextResponse.json({ error: `You've used today's free Ledrix actions (${DAILY_CAP}). It resets tomorrow.` }, { status: 429 });
  }

  let payload: { finding?: Finding };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }); }
  const f = payload.finding ?? {};
  if (!f.description && !f.unit) return NextResponse.json({ error: 'No finding provided.' }, { status: 400 });

  const user_msg =
    `Finding:\n- System/component: ${f.unit || 'Not specified'}\n` +
    `- Location: ${f.location || 'Not specified'}\n` +
    `- Type: ${sevLabel(f.severity)}\n` +
    `- Observation: ${String(f.description || 'Not specified').slice(0, 600)}`;

  const body = {
    model: 'gpt-4o-mini',
    max_tokens: 260,
    messages: [
      { role: 'system', content: REPAIR_SYSTEM },
      { role: 'user',   content: user_msg },
    ],
  };

  // 3) Forward to the gateway, parse the JSON draft.
  try {
    const resp = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ledrix-key': GATEWAY_KEY },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return NextResponse.json({ error: 'Ledrix is unavailable right now.' }, { status: 502 });
    const data = await resp.json();
    const raw  = (data?.choices?.[0]?.message?.content ?? '').replace(/```json?|```/g, '').trim();
    const idx  = raw.indexOf('{');
    if (idx < 0) return NextResponse.json({ error: 'Could not draft the request.' }, { status: 502 });
    const parsed = JSON.parse(raw.slice(idx));
    if (!parsed?.request) return NextResponse.json({ error: 'Could not draft the request.' }, { status: 502 });
    return NextResponse.json({
      item:    String(parsed.item ?? f.unit ?? '').trim(),
      remedy:  String(parsed.remedy ?? '').trim(),
      request: String(parsed.request).trim(),
    });
  } catch {
    return NextResponse.json({ error: 'Network error reaching Ledrix.' }, { status: 502 });
  }
}
