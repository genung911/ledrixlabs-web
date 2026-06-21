/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // Keep Chromium + puppeteer-core out of the bundle so the binary resolves at runtime on Vercel.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // Force the Chromium binary + its shared libs (libnss3.so etc.) into the render-pdf function
  // bundle — without this Vercel ships the browser but not its libraries and the launch fails.
  outputFileTracingIncludes: {
    '/api/render-pdf': ['./node_modules/@sparticuz/chromium/**/*'],
  },
};

module.exports = nextConfig;
