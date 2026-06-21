/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // puppeteer-core connects to a REMOTE browser (browserless) — no local Chromium to bundle.
  serverExternalPackages: ['puppeteer-core'],
};

module.exports = nextConfig;
