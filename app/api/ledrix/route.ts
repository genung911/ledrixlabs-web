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
import { bumpUsage, DAILY_CAP } from '../../../lib/usage';
import { isEntitled } from '../../../lib/entitlement';

const GATEWAY_URL = (process.env.GATEWAY_URL ?? '').replace(/\/$/, '');
const GATEWAY_KEY = process.env.GATEWAY_KEY ?? '';
// Base project URL (strip any /rest/v1 suffix — same normalization as the proxy),
// else auth.getUser + the REST fetch build invalid paths.
const SUPA_URL    = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SERVICE     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

type Msg = { role: 'user' | 'assistant'; content: string };

function buildContext(rec: any, log: any[] = []): string {
  if (!rec) return 'No inspection record is available for this property.';
  const anomalies: any[] = Array.isArray(rec.anomalies) ? rec.anomalies : [];
  const specs: any[]     = Array.isArray(rec.specs) ? rec.specs : [];
  const sev = (s?: string) => s === 'critical' ? 'SAFETY' : s === 'anomaly' ? 'DEFICIENCY' : 'MAINTENANCE';
  const findings = anomalies.slice(0, 40).map(a =>
    `- [${sev(a.severity)}] ${a.unit ?? 'General'}${a.location ? ` (${a.location})` : ''}: ${(a.description ?? '').slice(0, 240)}`,
  ).join('\n');
  const material = specs.slice(0, 30).map(s => `- ${s.category ?? 'Item'}: ${s.material ?? ''}`).filter(Boolean).join('\n');
  const history = (log ?? []).slice(0, 20).map((e: any) =>
    `- ${e.done_date}: ${e.title}${e.system ? ` (${e.system})` : ''}${e.note ? ` — ${e.note}` : ''}`).join('\n');
  return [
    `PROPERTY: ${[rec.address, rec.city, rec.state, rec.zip].filter(Boolean).join(', ')}`,
    rec.year_built ? `Year built: ${rec.year_built}` : '',
    rec.inspection_date ? `Inspected: ${rec.inspection_date}` : '',
    findings ? `\nFINDINGS (${anomalies.length} total):\n${findings}` : '\nNo findings were logged.',
    material ? `\nMATERIALS / SYSTEMS:\n${material}` : '',
    history ? `\nSERVICE HISTORY (maintenance + improvements the owner has logged, most recent first):\n${history}` : '',
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

  // Premium gate — dormant until Stripe is configured + BILLING_ENABLED=1 (then requires a subscription).
  if (!(await isEntitled(user.id))) return NextResponse.json({ error: 'Subscribe to unlock Ledrix.' }, { status: 402 });

  // Free-beta cap: bound per-user daily AI calls (cost safety).
  const used = await bumpUsage(admin, user.id);
  if (used > DAILY_CAP) {
    return NextResponse.json({ error: `You've used today's free Ledrix questions (${DAILY_CAP}). It resets tomorrow.` }, { status: 429 });
  }

  let payload: { shareId?: string; mode?: 'chat' | 'insight' | 'price' | 'analyze' | 'logparse'; messages?: Msg[]; finding?: string; image?: string; question?: string };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }); }
  const { shareId, mode = 'chat', messages = [], finding = '', image = '', question = '' } = payload;
  if (mode === 'analyze' && !/^data:image\/|^https?:\/\//.test(image)) return NextResponse.json({ error: 'No photo to analyze.' }, { status: 400 });

  // 2) Property context — fetched server-side, never trusted from the client. Includes the owner's
  // logged service history so Ledrix can answer "what have I done / when did I last…".
  let rec: any = null;
  let logRows: any[] = [];
  if (shareId) {
    try {
      const hdr = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
      const [r, lg] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/home_records?share_id=eq.${encodeURIComponent(shareId)}&limit=1`, { headers: hdr }),
        fetch(`${SUPA_URL}/rest/v1/home_maintenance_log?share_id=eq.${encodeURIComponent(shareId)}&order=done_date.desc&limit=20`, { headers: hdr }),
      ]);
      rec = (await r.json())?.[0] ?? null;
      const lj = await lg.json().catch(() => []);
      logRows = Array.isArray(lj) ? lj : [];
    } catch { /* context optional */ }
  }
  const ctx = buildContext(rec, logRows);

  // 3) Prompt — homeowner-facing, grounded in THIS property.
  const honesty = 'Be warm, plain-spoken, and practical. Only use the home’s record below (the inspection findings + the owner-logged service history) — never invent findings or services. ' +
    'If asked something the record does not cover, say so and suggest verifying with a licensed pro. You are not a substitute for a professional.';
  const loc = [rec?.zip, rec?.city, rec?.state].filter(Boolean).join(', ') || 'this area';
  const system = mode === 'insight'
    ? `You are Ledrix, the homeowner's AI for this property. ${honesty}\n\nWrite a short (4-6 sentence) plain-language INSIGHT: the home's overall condition, the 1-2 things that matter most, and what to plan for. No alarmism.\n\n${ctx}`
    : mode === 'price'
    ? `You are a home-repair cost estimator with US ZIP-level pricing knowledge. Using local labor + material rates for ${loc}, estimate the typical cost a homeowner would pay a licensed contractor to repair/remediate the finding. Reply with ONLY a dollar range like "$X–$Y" — no words, no explanation.`
    : mode === 'analyze'
    ? `You are Ledrix, the homeowner's home assistant for this property. ${honesty} The homeowner has photographed something in or around their home. In plain language: say what it is, assess its condition from what's visible, flag any safety or maintenance concern, and give one practical next step. Be honest about what you can't tell from a photo, and recommend a licensed pro when it warrants one. 3-5 sentences, never alarmist.\n\n${ctx}`
    : mode === 'logparse'
    ? `You extract a home SERVICE-HISTORY entry from what a homeowner said aloud. If they are reporting COMPLETED work/service/improvement on their home (e.g. "we had a new roof put on", "flushed the water heater", "painted the exterior", "replaced the dishwasher"), return {"isLog":true,"title":"<short past-tense summary, e.g. New roof installed>","system":"<Roof|HVAC|Water Heater|Plumbing|Electrical|Exterior|Interior|Appliance|Safety|Other>","kind":"<service|repair|improvement>"}. If it is a QUESTION, a plan for the future, or anything that is NOT a report of completed work, return {"isLog":false}. Return ONLY the JSON object, no prose.`
    : `You are Ledrix, the friendly assistant for THIS home. ${honesty} Speak about "your home"; you can answer from the inspection AND the service history below (what's been done and when). Keep answers concise and practical.\n\n${ctx}`;

  const userMsgs: any[] =
    mode === 'insight' ? [{ role: 'user', content: 'Give me a short insight about my home.' }]
    : mode === 'price' ? [{ role: 'user', content: `Finding: ${String(finding).slice(0, 400)}` }]
    : mode === 'analyze' ? [{ role: 'user', content: [
        { type: 'text', text: (question || 'What is this, and is it something I should worry about?').slice(0, 500) },
        { type: 'image_url', image_url: { url: image } },
      ] }]
    : mode === 'logparse' ? [{ role: 'user', content: String(question).slice(0, 500) }]
    : messages.slice(-12).map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  const body = {
    model: 'gpt-4o',
    max_tokens: mode === 'insight' ? 450 : mode === 'price' ? 30 : mode === 'analyze' ? 400 : mode === 'logparse' ? 120 : 600,
    messages: [{ role: 'system', content: system }, ...userMsgs],
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
    if (mode === 'logparse') {
      let parsed: any = { isLog: false };
      try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch { /* not a loggable statement */ }
      return NextResponse.json({ log: parsed });
    }
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: 'Network error reaching Ledrix.' }, { status: 502 });
  }
}
