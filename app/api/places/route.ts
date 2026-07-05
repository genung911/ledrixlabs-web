// ─── /api/places ─────────────────────────────────────────────────────────────
// Server-side proxy for the Google Places / Geocoding APIs used by the Ledrix
// app (PlacesService, address autocomplete, reinspection geo-verify). The app
// ships NO Google key — this route holds it server-side. Needs GOOGLE_PLACES_KEY
// (or the existing GOOGLE_PLACES_API_KEY, also used by /api/pros) in the Vercel
// env. Returns Google's JSON unchanged so client parsing stays identical.
//
// Kinds:
//   ?kind=textsearch   &query=<text>                       → Place Text Search
//   ?kind=details      &place_id=<id>&fields=<whitelist>   → Place Details
//   ?kind=autocomplete &input=<text>                       → Place Autocomplete (US addresses)
//   ?kind=geocode      &address=<text>                     → Geocoding API
import { NextRequest, NextResponse } from 'next/server';

const KEY = process.env.GOOGLE_PLACES_KEY ?? process.env.GOOGLE_PLACES_API_KEY ?? '';
const GOOGLE = 'https://maps.googleapis.com/maps/api';

// Only the detail fields the app actually consumes may pass through.
const DETAIL_FIELDS = new Set(['formatted_phone_number', 'website', 'address_component']);

function bad(error: string) {
  return NextResponse.json({ status: 'INVALID_REQUEST', error }, { status: 400 });
}

export async function GET(req: NextRequest) {
  if (!KEY) {
    return NextResponse.json(
      { status: 'REQUEST_DENIED', error: 'places key not configured on server' },
      { status: 503 },
    );
  }

  const p = req.nextUrl.searchParams;
  const kind = p.get('kind') ?? 'textsearch';
  let url: string;

  switch (kind) {
    case 'textsearch': {
      const query = (p.get('query') ?? '').trim().slice(0, 120);
      if (!query) return bad('missing query');
      url = `${GOOGLE}/place/textsearch/json?query=${encodeURIComponent(query)}&key=${KEY}`;
      break;
    }
    case 'details': {
      const placeId = (p.get('place_id') ?? '').trim();
      if (!placeId || placeId.length > 256 || !/^[\w-]+$/.test(placeId)) {
        return bad('missing or invalid place_id');
      }
      const fields = (p.get('fields') ?? '')
        .split(',')
        .map(f => f.trim())
        .filter(f => DETAIL_FIELDS.has(f));
      if (fields.length === 0) return bad('missing or unsupported fields');
      url = `${GOOGLE}/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields.join(',')}&key=${KEY}`;
      break;
    }
    case 'autocomplete': {
      const input = (p.get('input') ?? '').trim().slice(0, 120);
      if (input.length < 3) return bad('input too short');
      url = `${GOOGLE}/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&components=country:us&key=${KEY}`;
      break;
    }
    case 'geocode': {
      const address = (p.get('address') ?? '').trim().slice(0, 200);
      if (!address) return bad('missing address');
      url = `${GOOGLE}/geocode/json?address=${encodeURIComponent(address)}&key=${KEY}`;
      break;
    }
    default:
      return bad('unknown kind');
  }

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ status: 'UPSTREAM_ERROR' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: 'UPSTREAM_ERROR' }, { status: 502 });
  }
}
