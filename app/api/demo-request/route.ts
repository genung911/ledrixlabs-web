import { NextRequest, NextResponse } from 'next/server';

// POST /api/demo-request — receives the marketing site's interest forms (the
// enterprise "Request a demo" form AND the homeowner interest form) and stores
// them in the Supabase `demo_requests` table (anon insert-only; see
// supabase_demo_requests.sql). Validates server-side so we never trust the
// client. Read submissions from the Supabase dashboard (service role), not the
// public site. `source` distinguishes which form a row came from — `company` is
// optional because a homeowner submitting from ForHomeowners.tsx doesn't have one.
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/rest\/v1\/?$/, '')
  .replace(/\/+$/, '');
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Best-effort notification on a new request — a Slack webhook and/or a Resend
// email, each gated on its own env vars. Never throws: a failed ping must not
// fail the submit.
async function notify(r: { name: string; company: string; email: string; source: string }) {
  const tasks: Promise<unknown>[] = [];
  const who = r.company ? `*${r.name}* — ${r.company}` : `*${r.name}* (homeowner)`;

  const slack = process.env.SLACK_WEBHOOK_URL;
  if (slack) {
    tasks.push(
      fetch(slack, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `:mailbox_with_mail: *New Ledrix ${r.source} lead*\n${who}\n${r.email}`,
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
          subject: `New ${r.source} lead — ${r.company || r.name}`,
          text: `${r.name}${r.company ? ` (${r.company})` : ' (homeowner)'}\n${r.email}\n\nvia ledrixlabs.com`,
        }),
      }).catch(() => {}),
    );
  }

  await Promise.allSettled(tasks);
}

export async function POST(req: NextRequest) {
  if (!SUPA_URL || !SUPA_ANON) {
    return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 });
  }

  let body: { name?: string; company?: string; email?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim().slice(0, 120);
  const company = (body.company ?? '').trim().slice(0, 160);
  const email = (body.email ?? '').trim().toLowerCase().slice(0, 200);
  // Only the enterprise form sends no `source` (back-compat) or 'testwebpage' — it still
  // requires a company. The homeowner interest form sends source: 'homeowner' and has no
  // company field at all.
  const source = (body.source ?? 'testwebpage').trim().slice(0, 40) || 'testwebpage';
  const isHomeowner = source === 'homeowner';

  if (!name || (!isHomeowner && !company) || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      {
        error: isHomeowner
          ? 'Please provide your name and a valid email.'
          : 'Please provide your name, company, and a valid work email.',
      },
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
      body: JSON.stringify({ name, company, email, source }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return NextResponse.json(
        { error: 'Could not submit right now — please try again.', detail: detail.slice(0, 200) },
        { status: 502 },
      );
    }

    await notify({ name, company, email, source });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Network error — please try again.', detail: String(e) }, { status: 500 });
  }
}
