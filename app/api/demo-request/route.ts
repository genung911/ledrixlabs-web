import { NextRequest, NextResponse } from 'next/server';

// POST /api/demo-request — receives the marketing demo form and stores it in the
// Supabase `demo_requests` table (anon insert-only; see supabase_demo_requests.sql).
// Validates server-side so we never trust the client. Read submissions from the
// Supabase dashboard (service role), not the public site.
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/rest\/v1\/?$/, '')
  .replace(/\/+$/, '');
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Best-effort notification on a new request — a Slack webhook and/or a Resend
// email, each gated on its own env vars. Never throws: a failed ping must not
// fail the submit.
async function notify(r: { name: string; company: string; email: string }) {
  const tasks: Promise<unknown>[] = [];

  const slack = process.env.SLACK_WEBHOOK_URL;
  if (slack) {
    tasks.push(
      fetch(slack, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:mailbox_with_mail: *New Ledrix demo request*\n*${r.name}* — ${r.company}\n${r.email}`,
        }),
      }).catch(() => {}),
    );
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.DEMO_NOTIFY_EMAIL;
  const from = process.env.DEMO_FROM_EMAIL;
  if (key && to && from) {
    tasks.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          subject: `New demo request — ${r.company}`,
          text: `${r.name} (${r.company})\n${r.email}\n\nvia ledrixlabs.com`,
        }),
      }).catch(() => {}),
    );
  }

  await Promise.allSettled(tasks);
}

// GET /api/demo-request — config check (booleans only, no secrets). Lets us verify
// which integrations the *deployed* function actually sees its env vars for.
export async function GET(req: NextRequest) {
  // ?ping=slack — fire the *stored* webhook and return Slack's actual response,
  // so we can see exactly why a ping is (or isn't) landing.
  if (req.nextUrl.searchParams.get('ping') === 'slack') {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return NextResponse.json({ note: 'SLACK_WEBHOOK_URL not set' });
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ':wrench: Ledrix webhook test ping' }),
      });
      return NextResponse.json({ slackStatus: r.status, slackBody: (await r.text().catch(() => '')).slice(0, 200) });
    } catch (e) {
      return NextResponse.json({ slackError: String(e) });
    }
  }
  const url = process.env.SLACK_WEBHOOK_URL ?? '';
  // Safe fingerprint of the stored webhook: team + webhook IDs only, NOT the secret
  // token. Lets us see WHICH workspace/webhook Vercel is actually firing into.
  const m = url.match(/services\/(T[A-Z0-9]+)\/(B[A-Z0-9]+)\//);
  return NextResponse.json({
    supabase: Boolean(SUPA_URL && SUPA_ANON),
    slack: Boolean(url),
    slackTeam: m?.[1] ?? null,
    slackWebhook: m?.[2] ?? null,
    slackUrlLength: url.length,
    email: Boolean(process.env.RESEND_API_KEY && process.env.DEMO_NOTIFY_EMAIL && process.env.DEMO_FROM_EMAIL),
  });
}

export async function POST(req: NextRequest) {
  if (!SUPA_URL || !SUPA_ANON) {
    return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 });
  }

  let body: { name?: string; company?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim().slice(0, 120);
  const company = (body.company ?? '').trim().slice(0, 160);
  const email = (body.email ?? '').trim().toLowerCase().slice(0, 200);

  if (!name || !company || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: 'Please provide your name, company, and a valid work email.' },
      { status: 422 },
    );
  }

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/demo_requests`, {
      method: 'POST',
      headers: {
        apikey: SUPA_ANON,
        Authorization: `Bearer ${SUPA_ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ name, company, email, source: 'testwebpage' }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return NextResponse.json(
        { error: 'Could not submit right now — please try again.', detail: detail.slice(0, 200) },
        { status: 502 },
      );
    }

    await notify({ name, company, email });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Network error — please try again.', detail: String(e) }, { status: 500 });
  }
}
