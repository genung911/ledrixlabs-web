/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // Keep puppeteer-core + chromium-min external; chromium-min streams the browser pack at runtime.
  serverExternalPackages: ['@sparticuz/chromium-min', 'puppeteer-core'],
};

module.exports = nextConfig;
