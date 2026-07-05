// ─── storageSign — server-only signed URLs for the inspection-pdfs bucket ────
// The report PDF/HTML and finding photos live in the `inspection-pdfs` Supabase
// storage bucket. To let the owner flip that bucket to PRIVATE without breaking
// the portal, we stop linking public URLs and instead sign each object with the
// service-role key on the server. Signed URLs work whether the bucket is public
// or private, so this is safe to ship BEFORE the bucket ACL is changed.
//
// SERVER-ONLY: imports the service-role key. Never import this into a client
// component — only from route handlers (app/api/*, app/**/route.ts).
// Env (Vercel): NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
// Falls back to the anon key if the service key isn't set — signing still works
// while the bucket is public; it only strictly needs the service key once private.
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET   = 'inspection-pdfs';

// Accepts either a bare object path (`insp_x/report.pdf`) or a full public URL
// (`…/object/public/inspection-pdfs/insp_x/report.pdf`, the format older records
// stored) and normalizes to the bucket-relative object path.
function normalizePath(input: string): string | null {
  let p = (input ?? '').trim();
  if (!p) return null;
  const marker = '/inspection-pdfs/';
  const idx = p.indexOf(marker);
  if (idx >= 0) p = p.slice(idx + marker.length);       // strip host + /object/public/inspection-pdfs/
  p = p.replace(/^\/+/, '');
  if (!p || p.startsWith('file') || p.includes('..')) return null;
  return p;
}

// Sign an inspection-pdfs object path → short-lived absolute URL, or null.
export async function signInspectionPdfsPath(input: string, ttl = 3600): Promise<string | null> {
  if (!SUPA_URL || !SUPA_KEY) return null;
  const path = normalizePath(input);
  if (!path) return null;
  try {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttl }),
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const { signedURL } = await r.json();
    if (!signedURL) return null;
    return `${SUPA_URL}/storage/v1${signedURL.replace(/^\/storage\/v1/, '')}`;
  } catch {
    return null;
  }
}
