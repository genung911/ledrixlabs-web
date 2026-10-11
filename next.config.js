/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // puppeteer-core connects to a REMOTE browser (browserless) — no local Chromium to bundle.
  serverExternalPackages: ['puppeteer-core'],
  // Browsers request /favicon.ico on any page without an icon <link> (the static /demo page has none),
  // and there is no .ico — serve the existing app icon instead of a 404.
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/icon.svg' }];
  },
};

module.exports = nextConfig;
