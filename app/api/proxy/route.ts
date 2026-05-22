import { NextRequest, NextResponse } from 'next/server';

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '';
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPA_HEADERS = {
  apikey:         SUPA_ANON,
  Authorization:  `Bearer ${SUPA_ANON}`,
  'Content-Type': 'application/json',
};

function missingConfig() {
  return NextResponse.json(
    { error: 'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set in Vercel env vars' },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  if (!SUPA_URL || !SUPA_ANON) return missingConfig();
  try {
    const path = req.nextUrl.searchParams.get('path') ?? '';
    const r    = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: SUPA_HEADERS });
    const data = await r.json();
    return NextResponse.json(data, { status: r.ok ? 200 : r.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!SUPA_URL || !SUPA_ANON) return missingConfig();
  try {
    const path = req.nextUrl.searchParams.get('path') ?? '';
    const body = await req.json();
    const r    = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
      method: 'POST',
      headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    return new NextResponse(null, { status: r.ok ? 204 : r.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!SUPA_URL || !SUPA_ANON) return missingConfig();
  try {
    const path   = req.nextUrl.searchParams.get('path')   ?? '';
    const filter = req.nextUrl.searchParams.get('filter') ?? '';
    const body   = await req.json();
    const url    = filter ? `${SUPA_URL}/rest/v1/${path}?${filter}` : `${SUPA_URL}/rest/v1/${path}`;
    const r      = await fetch(url, {
      method: 'PATCH',
      headers: { ...SUPA_HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    return new NextResponse(null, { status: r.ok ? 204 : r.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
