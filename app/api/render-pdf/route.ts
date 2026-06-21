import { NextRequest, NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

// chromium-min ships NO binary — it streams a matching Chromium pack at runtime (cached in /tmp),
// which includes the shared libs (libnss3.so etc.). This sidesteps Vercel's unreliable bundling
// of the full @sparticuz/chromium package, which shipped the browser without its libraries.
const CHROMIUM_PACK = 'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';

// Server-side PDF rendering with real Chromium — the inspection report needs true 1" margins
// and a footer (CONFIDENTIAL + page X of Y) pinned to the bottom of EVERY page, which iOS's
// expo-print engine cannot do. The app POSTs its report HTML here and gets a proper PDF back.
//
// Runs on the Vercel Node runtime (NOT edge — Chromium needs a real Node env). @sparticuz/chromium
// ships a Lambda/Vercel-sized Chromium binary that puppeteer-core drives.
export const runtime = 'nodejs';
export const maxDuration = 60;          // Chromium cold start + render; needs Vercel Pro for >10s
export const dynamic = 'force-dynamic';

const SECRET = process.env.RENDER_PDF_SECRET ?? '';

// Footer lives in the bottom page margin and repeats on every page. Puppeteer fills the
// pageNumber / totalPages spans automatically. Note: header/footer templates do NOT inherit
// page CSS, so styles are inlined and font-size must be explicit (default is 0).
const FOOTER_TEMPLATE = `
  <div style="font-size:8px;color:#64748b;width:100%;margin:0 0.4in;font-family:Helvetica,Arial,sans-serif;letter-spacing:1px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;padding-top:6px;">
    <span>LEDRIX SPATIAL OS &middot; CONFIDENTIAL INSPECTION DOCUMENT</span>
    <span>PAGE <span class="pageNumber"></span> OF <span class="totalPages"></span></span>
  </div>`;

export async function POST(req: NextRequest) {
  if (SECRET && req.headers.get('x-render-key') !== SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let html: unknown;
  try { ({ html } = await req.json()); }
  catch { return NextResponse.json({ error: 'invalid json body' }, { status: 400 }); }
  if (typeof html !== 'string' || !html.trim()) {
    return NextResponse.json({ error: 'missing html' }, { status: 400 });
  }

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(CHROMIUM_PACK),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });
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
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'render failed', detail }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
