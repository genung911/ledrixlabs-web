// /api/home/invite-email — email a Ledrix Home invite (launch list h11; mockup RKjzYqUFs8911G5TrjpE8L "Approved").
//
// The app made the invite (SQL #162, create_home_invite / renew_home_invite) and holds its 6-digit code; the database
// keeps only the code's sha256. This route sends the email — and only for an invite THIS PERSON owns the home of, with
// the code that actually matches it, so it cannot be used to email anyone anything.
//
//   POST { homeId, inviteId, code }   Authorization: Bearer <the person's access token>   →   { sent: true }
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export const runtime = 'nodejs';

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function POST(req: NextRequest) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.HOME_FROM_EMAIL || process.env.DEMO_FROM_EMAIL;
  if (!SUPA_URL || !ANON || !SERVICE || !key || !from) return fail('Not set up.', 503);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token === ANON) return fail('Sign in first.', 401);
  const body = await req.json().catch(() => ({}));
  const homeId = String(body?.homeId ?? '').trim(), inviteId = String(body?.inviteId ?? '').trim();
  const code = String(body?.code ?? '').replace(/\D/g, '');
  if (!homeId || !/^[0-9a-f-]{36}$/i.test(inviteId) || code.length !== 6) return fail('Which invite?', 400);

  const asPerson = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
  const { data: who } = await asPerson.auth.getUser();
  if (!who?.user) return fail('Sign in first.', 401);
  // The database decides ownership, as the person.
  const { data: owns } = await asPerson.rpc('has_home_access', { h: homeId, min_level: 'owner' });
  if (owns !== true) return fail('Only the home\'s owner can invite.', 403);

  const { data: inv } = await admin.from('home_invites')
    .select('id, home_id, email, name, code_hash, expires_at, accepted_at, cancelled_at').eq('id', inviteId).maybeSingle();
  if (!inv || inv.home_id !== homeId || inv.accepted_at || inv.cancelled_at || Date.parse(inv.expires_at) < Date.now()) return fail('No such invite.', 404);
  if (createHash('sha256').update(code).digest('hex') !== inv.code_hash) return fail('That code isn\'t this invite\'s.', 403);

  const { data: home } = await admin.from('homes').select('address').eq('id', homeId).maybeSingle();
  const { data: me } = await admin.from('homeowner_profiles').select('full_name').eq('id', who.user.id).maybeSingle();
  const inviter = (me as any)?.full_name?.split(' ')[0] || (who.user.email ?? 'Someone').split('@')[0];
  const where = (home as any)?.address?.split(',')[0] || 'their home';
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  const subject = `${inviter} added you to ${where}`;
  const text = `${subject} on Ledrix Home.\n\nYou'll see the home and get its alerts: freeze risk, likely water, too hot, and sensors that go quiet.\n\nYour code: ${pretty}\n\n1. Get Ledrix Home from the App Store.\n2. Sign in with ${inv.email}.\n3. Tap "Have a code?" and enter the code.\n\nThe code works for 7 days. Not expecting this? Ignore it — nothing happens.`;
  const html = `<div style="font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#111;max-width:480px">
<h2 style="font-size:19px;margin:0 0 8px">${esc(subject)}</h2>
<p>You'll see the home on Ledrix Home and get its alerts: freeze risk, likely water, too hot, and sensors that go quiet.</p>
<p style="font-size:30px;font-weight:700;letter-spacing:.18em;text-align:center;margin:18px 0">${pretty}</p>
<p><b>1.</b> Get Ledrix Home from the App Store.<br><b>2.</b> Sign in with ${esc(inv.email)}.<br><b>3.</b> Tap “Have a code?” and enter the code.</p>
<p style="color:#666;font-size:13px">The code works for 7 days. Not expecting this? Ignore it — nothing happens.</p></div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: inv.email, subject, text, html }),
  }).catch(() => null);
  if (!r?.ok) return fail('Could not send the email.', 502);
  return NextResponse.json({ sent: true });
}
