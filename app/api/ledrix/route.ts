// ─── /api/ledrix ─────────────────────────────────────────────────────────────
// The gated AI endpoint for the Home App's Ledrix chat + live Insight.
// - Requires a signed-in Supabase user (magic-link auth). No session → 401.
// - Pulls the property context server-side (authoritative) by share_id.
// - Forwards to the Railway gateway with the x-ledrix-key header. The gateway
//   routes text-only requests to the cheap model, which suits homeowner Q&A.
// Phase 3 adds the per-user token ledger (real metering). For now: auth-gate +
// a per-call token cap bound the cost.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GATEWAY_URL = (process.env.GATEWAY_URL ?? '').replace(/\/$/, '');
const GATEWAY_KEY = process.env.GATEWAY_KEY ?? '';
const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

type Msg = { role: 'user' | 'assistant'; content: string };

function buildContext(rec: any): string {
  if (!rec) return 'No inspection record is available for this property.';
  const anomalies: any[] = Array.isArray(rec.anomalies) ? rec.anomalies : [];
  const specs: any[]     = Array.isArray(rec.specs) ? rec.specs : [];
  const sev = (s?: string) => s === 'critical' ? 'SAFETY' : s === 'anomaly' ? 'DEFICIENCY' : 'MAINTENANCE';
  const findings = anomalies.slice(0, 40).map(a =>
    `- [${sev(a.severity)}] ${a.unit ?? 'General'}${a.location ? ` (${a.location})` : ''}: ${(a.description ?? '').slice(0, 240)}`,
  ).join('\n');
  const material = specs.slice(0, 30).map(s => `- ${s.category ?? 'Item'}: ${s.material ?? ''}`).filter(Boolean).join('\n');
  return [
    `PROPERTY: ${[rec.address, rec.city, rec.state, rec.zip].filter(Boolean).join(', ')}`,
    rec.year_built ? `Year built: ${rec.year_built}` : '',
    rec.inspection_date ? `Inspected: ${rec.inspection_date}` : '',
    findings ? `\nFINDINGS (${anomalies.length} total):\n${findings}` : '\nNo findings were logged.',
    material ? `\nMATERIALS / SYSTEMS:\n${material}` : '',
  ].filter(Boolean).join('\n');
}

export async function POST(req: NextRequest) {
  if (!GATEWAY_URL) return NextResponse.json({ error: 'AI not configured.' }, { status: 500 });

  // 1) Require a signed-in user.
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !SUPA_URL || !SERVICE) return NextResponse.json({ error: 'Sign in to use Ledrix.' }, { status: 401 });
  const admin = createClient(SUPA_URL, SERVICE);
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Sign in to use Ledrix.' }, { status: 401 });

  let payload: { shareId?: string; mode?: 'chat' | 'insight'; messages?: Msg[] };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }); }
  const { shareId, mode = 'chat', messages = [] } = payload;

  // 2) Property context — fetched server-side, never trusted from the client.
  let rec: any = null;
  if (shareId) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/home_records?share_id=eq.${encodeURIComponent(shareId)}&limit=1`,
        { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
      rec = (await r.json())?.[0] ?? null;
    } catch { /* context optional */ }
  }
  const ctx = buildContext(rec);

  // 3) Prompt — homeowner-facing, grounded in THIS property.
  const honesty = 'Be warm, plain-spoken, and practical. Only use the inspection record below — never invent findings. ' +
    'If asked something the record does not cover, say so and suggest verifying with a licensed pro. You are not a substitute for a professional.';
  const system = mode === 'insight'
    ? `You are Ledrix, the homeowner's AI for this property. ${honesty}\n\nWrite a short (4-6 sentence) plain-language INSIGHT: the home's overall condition, the 1-2 things that matter most, and what to plan for. No alarmism.\n\n${ctx}`
    : `You are Ledrix, the homeowner's friendly home assistant for this property. ${honesty} Keep answers concise.\n\n${ctx}`;

  const body = {
    model: 'gpt-4o',
    max_tokens: mode === 'insight' ? 450 : 600,
    messages: [
      { role: 'system', content: system },
      ...(mode === 'insight'
        ? [{ role: 'user', content: 'Give me a short insight about my home.' }]
        : messages.slice(-12).map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }))),
    ],
  };

  // 4) Forward to the gateway.
  try {
    const resp = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ledrix-key': GATEWAY_KEY },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return NextResponse.json({ error: 'Ledrix is unavailable right now.' }, { status: 502 });
    const data = await resp.json();
    const text = (data?.choices?.[0]?.message?.content ?? '').trim();
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: 'Network error reaching Ledrix.' }, { status: 502 });
  }
}
