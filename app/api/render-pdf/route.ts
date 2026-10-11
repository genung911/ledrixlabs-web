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

// AUTH (Security C1, 2026-10-11). The route used to skip the key check entirely when
// RENDER_PDF_SECRET was unset — which is how production ran: anyone could drive the paid remote
// browser with arbitrary HTML. Now it FAILS CLOSED: no secret configured → 503, nothing rendered.
//
// The key the app sends (EXPO_PUBLIC_RENDER_PDF_KEY) is compiled into every app bundle, so it
// identifies the app, not a person, and anyone who extracts it passes. This check is containment,
// not authorization; durable auth needs the app to send the user's Supabase session (a later,
// coordinated app + route change).
//
// Constant-time compare over fixed-length digests, so neither the key's contents nor its length
// leak through response timing.
function keyMatches(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

// Generic bodies only: no configuration names, no upstream messages (those go to the server log).
const UNAVAILABLE = () => NextResponse.json({ error: 'render unavailable' }, { status: 503 });

export async function POST(req: NextRequest) {
  if (!SECRET) {
    console.error('[render-pdf] refused: RENDER_PDF_SECRET is not configured');
    return UNAVAILABLE();
  }
  if (!keyMatches(req.headers.get('x-render-key'), SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!BROWSER_WS) {
    console.error('[render-pdf] refused: BROWSERLESS_WS_ENDPOINT is not configured');
    return UNAVAILABLE();
  }

  let html: unknown;
  try { ({ html } = await req.json()); }
  catch { return NextResponse.json({ error: 'invalid json body' }, { status: 400 }); }
  if (typeof html !== 'string' || !html.trim()) {
    return NextResponse.json({ error: 'missing html' }, { status: 400 });
  }

  let browser: Awaited<ReturnType<typeof puppeteer.connect>> | null = null;
  // Which step failed — logged instead of the exception text (see the catch below).
  let phase: 'connect' | 'open' | 'load' | 'images' | 'print' = 'connect';
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSER_WS });
    phase = 'open';
    const page = await browser.newPage();
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
