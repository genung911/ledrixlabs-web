import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';

// Server-side PDF rendering via a HOSTED Chrome (browserless or any Chrome-over-WebSocket).
// We do NOT launch Chromium inside the Vercel function — bundling @sparticuz/chromium on Vercel
// reliably fails on shared libraries (libnss3.so). Instead Puppeteer CONNECTS to a remote browser
// at BROWSERLESS_WS_ENDPOINT, which is real Chrome and renders the report's HTML to a proper PDF
// with true margins + a footer (CONFIDENTIAL + page X of Y) on every page.
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SECRET = process.env.RENDER_PDF_SECRET ?? '';
// Full WebSocket connect URL from your browser provider, e.g.
//   wss://production-sfo.browserless.io/?token=YOUR_TOKEN
const BROWSER_WS = process.env.BROWSERLESS_WS_ENDPOINT ?? '';

// Footer lives in the bottom page margin and repeats on every page; Puppeteer fills pageNumber /
// totalPages. Header/footer templates don't inherit page CSS, so styles are inlined + font-size
// explicit (default is 0).
const FOOTER_TEMPLATE = `
  <div style="font-size:8px;color:#64748b;width:100%;margin:0 0.4in;font-family:Helvetica,Arial,sans-serif;letter-spacing:1px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;padding-top:6px;">
    <span>LEDRIX INTELLIGENCE &middot; CONFIDENTIAL INSPECTION DOCUMENT</span>
    <span>PAGE <span class="pageNumber"></span> OF <span class="totalPages"></span></span>
  </div>`;

// AUTH (Security C1 2026-10-11, C1b 2026-10-11). Two credentials, either of which lets a render run:
//
//   1. A SIGNED-IN INSPECTOR (durable, C1b). `Authorization: Bearer <Supabase access token>` is verified
//      by Supabase Auth itself (GET /auth/v1/user — signature, expiry, revoked sessions), and then, AS
//      that user (RLS applies): the user must have an inspector profile, and the body's `inspectionId`
//      must be one they may create content under (can_create_under_inspection — owner / assignee /
//      same-company editor of an existing inspection, or an id the server has not seen yet, e.g. a
//      preview before the first sync). A homeowner account, a stranger's inspection, a malformed id:
//      refused. Identity is never taken from the body.
//      ⚠ POLICY PENDING (owner decision, 2026-10-11): sign-up is open, any non-homeowner account can
//      create its own inspector profile and inspection rows, and an unseen id passes
//      can_create_under_inspection — so this check bounds WHICH existing inspections a caller may name,
//      not WHO may render. Which helper applies, and whether a per-user render budget is required, is
//      not yet decided; this is the C1b candidate, unchanged.
//   2. The app's static key (`x-render-key` = RENDER_PDF_SECRET), C1's containment, kept ONLY so builds
//      already installed keep rendering — and honoured only on a request that presents NO session. That key is compiled into every app bundle — it identifies the
//      app, not a person. It is accepted only while RENDER_PDF_SECRET is set; removing that env var
//      (once the session-sending build is installed everywhere) turns the static key off entirely.
//
// Nothing renders without one of them; misconfiguration fails closed. The key is compared in constant
// time over fixed-length digests. Responses and logs carry no token, configuration or upstream detail.
//
// PRESENTING an Authorization header at all commits the request to the session path (W1, 2026-10-11):
// a header that is malformed, not Bearer, the public anon key, or a token Supabase rejects is refused
// with 401 — it never falls back to the static key, whatever else the request carries.
//
// INVARIANT — this route renders the HTML it is SENT. It never reads report data. `inspectionId` is an
// authorization subject, not a lookup key: nothing here (or in a future change) may fetch inspection,
// finding or photo data by a caller-supplied id, because the id is not bound to the HTML and the
// authorization below would then become the only thing standing between a caller and someone else's
// report. Report contents reach the browser only inside the submitted HTML.
//
// THE BROWSER IS UNTRUSTED-CONTENT SAFE (W1). Page JavaScript is disabled (the report's only script
// drives the web report's screen-width view switcher; every rule it toggles sits inside
// `@media screen`, and page.pdf prints `print` media, so the PDF is identical without it). Every
// request the page makes is aborted unless it is data:/about:/blob:, the project's Supabase host (the
// photos arrive as storage URLs signed by the inspector's session), or Google Fonts. The renderer can
// no longer be pointed at arbitrary hosts.
const SUPA_URL  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const INSPECTION_ID = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_HTML_CHARS = 6_000_000;   // above Vercel's ~4.5 MB body cap; a hard ceiling if that ever moves

function keyMatches(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** null = no Authorization header. '' = a header that carries no usable session (malformed, not
 *  Bearer, or the public anon key — which is not a session). Otherwise the bearer token. */
function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (header === null) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m && m[1] !== SUPA_ANON ? m[1] : '';
}

// Hosts the report legitimately loads from (see the header comment). Anything else is aborted.
const SUPA_HOST = (() => { try { return SUPA_URL ? new URL(SUPA_URL).host : ''; } catch { return ''; } })();
const ALLOWED_HOSTS = new Set([SUPA_HOST, 'fonts.googleapis.com', 'fonts.gstatic.com'].filter(Boolean));
function requestAllowed(url: string): boolean {
  if (/^(data|about|blob):/i.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.host);
  } catch {
    return false;
  }
}

type Verdict = 'ok' | 'unauthorized' | 'forbidden' | 'unavailable';

/** Who is this? Supabase Auth decides. 'unavailable' = we could not find out (fail closed). */
async function verifySession(token: string): Promise<{ verdict: Verdict; userId?: string }> {
  if (!SUPA_URL || !SUPA_ANON) return { verdict: 'unavailable' };
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (r.status === 401 || r.status === 403) return { verdict: 'unauthorized' };
    if (!r.ok) return { verdict: 'unavailable' };
    const u: unknown = await r.json();
    const id = (u as { id?: unknown } | null)?.id;
    return typeof id === 'string' && id ? { verdict: 'ok', userId: id } : { verdict: 'unauthorized' };
  } catch {
    return { verdict: 'unavailable' };
  }
}

/** May this verified user render for this inspection? Asked AS the user, so RLS decides. */
async function mayRender(token: string, userId: string, inspectionId: string): Promise<Verdict> {
  const h = { apikey: SUPA_ANON, Authorization: `Bearer ${token}` };
  try {
    const [profile, allowed] = await Promise.all([
      fetch(`${SUPA_URL}/rest/v1/inspector_profiles?id=eq.${encodeURIComponent(userId)}&select=id`, { headers: h, cache: 'no-store' }),
      fetch(`${SUPA_URL}/rest/v1/rpc/can_create_under_inspection`, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_inspection_id: inspectionId }), cache: 'no-store',
      }),
    ]);
    if (!profile.ok || !allowed.ok) return 'unavailable';
    const rows: unknown = await profile.json();
    const ok: unknown = await allowed.json();
    if (!Array.isArray(rows) || rows.length !== 1) return 'forbidden';   // not an inspector account
    return ok === true ? 'ok' : 'forbidden';
  } catch {
    return 'unavailable';
  }
}

// DAILY BUDGET (owner ruling 2026-10-14): a signed-in inspector gets RENDERS_PER_DAY server renders per
// UTC day, counted atomically by increment_render_usage (supabase_render_usage.sql, service role only).
// Counted after authorization, so refused requests spend nothing. Over budget → 429, and the app falls
// back to rendering on the device, so an inspector is never blocked from delivering a report. Fails
// OPEN on a counter error (like lib/usage.ts): a usage-table hiccup must not take PDFs down. The
// static-key path has no user to count; it ends when RENDER_PDF_SECRET is removed.
const RENDERS_PER_DAY = 20;
async function bumpRenders(userId: string): Promise<number> {
  if (!SUPA_URL || !SERVICE) return 0;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/increment_render_usage`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: userId, d: new Date().toISOString().slice(0, 10) }),
      cache: 'no-store',
    });
    if (!r.ok) { console.error('[render-pdf] render budget unavailable'); return 0; }
    const n: unknown = await r.json();
    return typeof n === 'number' ? n : 0;
  } catch {
    console.error('[render-pdf] render budget unavailable');
    return 0;
  }
}

// Generic bodies only: no configuration names, no upstream messages (those go to the server log).
const UNAVAILABLE  = () => NextResponse.json({ error: 'render unavailable' }, { status: 503 });
const UNAUTHORIZED = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });
const FORBIDDEN    = () => NextResponse.json({ error: 'forbidden' }, { status: 403 });

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  const keyOk = !!SECRET && keyMatches(req.headers.get('x-render-key'), SECRET);

  // 1 · Who is asking — decided before the body is read. A PRESENTED session is decisive: if it does
  // not verify, the request is refused even when the static key is also sent (final review,
  // 2026-10-11) — an invalid or unverifiable identity never falls back to the app-wide key. Only a
  // request that presents no session at all (builds that predate C1b) may use the key, and only
  // while RENDER_PDF_SECRET is set.
  let session: { token: string; userId: string } | null = null;
  if (token === '') {
    return UNAUTHORIZED();   // a header was presented and carries no session: never the key
  } else if (token) {
    const v = await verifySession(token);
    if (v.verdict === 'unavailable') { console.error('[render-pdf] refused: session verification unavailable'); return UNAVAILABLE(); }
    if (v.verdict !== 'ok' || !v.userId) return UNAUTHORIZED();
    session = { token, userId: v.userId };
  } else if (!keyOk) {
    return UNAUTHORIZED();
  }

  if (!BROWSER_WS) {
    console.error('[render-pdf] refused: BROWSERLESS_WS_ENDPOINT is not configured');
    return UNAVAILABLE();
  }

  // 2 · What is being asked for.
  let body: { html?: unknown; inspectionId?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid json body' }, { status: 400 }); }
  const html = body?.html;
  if (typeof html !== 'string' || !html.trim()) {
    return NextResponse.json({ error: 'missing html' }, { status: 400 });
  }
  if (html.length > MAX_HTML_CHARS) {
    return NextResponse.json({ error: 'html too large' }, { status: 413 });
  }

  // 3 · A signed-in caller must be allowed to render for THIS inspection.
  if (session) {
    const inspectionId = body?.inspectionId;
    if (typeof inspectionId !== 'string' || !INSPECTION_ID.test(inspectionId)) {
      return NextResponse.json({ error: 'missing inspectionId' }, { status: 400 });
    }
    const v = await mayRender(session.token, session.userId, inspectionId);
    if (v === 'unavailable') { console.error('[render-pdf] refused: authorization check unavailable'); return UNAVAILABLE(); }
    if (v !== 'ok') return FORBIDDEN();
    if (await bumpRenders(session.userId) > RENDERS_PER_DAY) {
      return NextResponse.json({ error: `daily render limit reached (${RENDERS_PER_DAY})` }, { status: 429 });
    }
  }

  let browser: Awaited<ReturnType<typeof puppeteer.connect>> | null = null;
  // Which step failed — logged instead of the exception text (see the catch below).
  let phase: 'connect' | 'open' | 'load' | 'images' | 'print' = 'connect';
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSER_WS });
    phase = 'open';
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (r.isInterceptResolutionHandled()) return;
      if (requestAllowed(r.url())) r.continue().catch(() => {});
      else r.abort('blockedbyclient').catch(() => {});
    });
    // domcontentloaded is instant; networkidle0 hangs forever when a report has several images.
    phase = 'load';
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Then wait for images to load — but NEVER hang on slow/broken ones (cap at 8s).
    phase = 'images';
    await page.evaluate(() => Promise.race([
      Promise.all(Array.from(document.images).map(img =>
        img.complete ? null : new Promise(res => { img.addEventListener('load', res); img.addEventListener('error', res); }))),
      new Promise(res => setTimeout(res, 8000)),
    ]));
    phase = 'print';
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',      // header content lives in the HTML; reserve none here
      footerTemplate: FOOTER_TEMPLATE,
      margin: { top: '0.4in', bottom: '0.6in', left: '0.4in', right: '0.4in' },
    });
    // base64 JSON — far more reliable to consume in React Native than a binary body.
    return NextResponse.json(
      { pdf: Buffer.from(pdf).toString('base64') },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    // Never log the exception's message or the error object: a connect failure's message carries the
    // browser WebSocket URL with its token, and render errors can quote report HTML. The step and
    // the error's class name (e.g. TimeoutError, ProtocolError) are enough to diagnose.
    const kind = e instanceof Error && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : 'Error';
    console.error(`[render-pdf] render failed at step "${phase}" (${kind})`);
    return NextResponse.json({ error: 'render failed' }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
