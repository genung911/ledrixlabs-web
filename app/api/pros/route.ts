// ─── /api/pros ───────────────────────────────────────────────────────────────
// Top-rated local contractors for a finding's trade, fetched server-side from
// Google Places (Text Search → Place Details for phone). Ranked by rating (Google's
// aggregate star average — the API doesn't expose a 5-star/total review breakdown, so
// average rating is the closest available proxy for "percentage of 5-star reviews"),
// with a minimum review-count floor so a single 5.0 from one reviewer can't outrank
// an established, heavily-reviewed shop.
// The homeowner card renders these as a tappable call list. Needs GOOGLE_PLACES_API_KEY
// in the server env (Vercel) — without it, returns [] and the card hides the section.
import { NextRequest, NextResponse } from 'next/server';

const KEY = process.env.GOOGLE_PLACES_API_KEY ?? '';
const MIN_REVIEWS = 20;

export async function GET(req: NextRequest) {
  if (!KEY) return NextResponse.json({ pros: [] });
  const { searchParams } = new URL(req.url);
  const trade = (searchParams.get('trade') || 'home repair contractor').slice(0, 60);
  const zip   = (searchParams.get('zip') || '').slice(0, 12);
  if (!zip) return NextResponse.json({ pros: [] });

  try {
    const ts = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${trade} near ${zip}`)}&key=${KEY}`,
    );
    const tj = await ts.json();
    const results: any[] = Array.isArray(tj.results) ? tj.results : [];
    const top = results
      .filter(r => (r.user_ratings_total ?? 0) >= MIN_REVIEWS)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0))
      .slice(0, 3);

    const pros = await Promise.all(top.map(async (r: any) => {
      let phone: string | undefined, website: string | undefined;
      try {
        const d = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${r.place_id}&fields=formatted_phone_number,website&key=${KEY}`,
        );
        const dj = await d.json();
        phone = dj.result?.formatted_phone_number;
        website = dj.result?.website;
      } catch { /* phone/website optional */ }
      return {
        name: r.name, rating: r.rating, reviews: r.user_ratings_total,
        address: r.formatted_address, phone, website,
      };
    }));
    return NextResponse.json({ pros });
  } catch {
    return NextResponse.json({ pros: [] });
  }
}
