/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // Keep Chromium + puppeteer-core out of the bundle so the binary resolves at runtime on Vercel.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
};

module.exports = nextConfig;
