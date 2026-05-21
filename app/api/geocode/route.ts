import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 });

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Ledrix Home App (ledrixlabs.com)' },
  });
  if (!res.ok) return NextResponse.json({ error: 'geocode failed' }, { status: 502 });

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ lat: null, lng: null });
  }
  return NextResponse.json({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
}
