import type { NextConfig } from 'next';

const config: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // cacheComponents (PPR) enabled per-page via export const experimental_ppr = true
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Ensure the bundled PDF font TTFs are traced into the corporate PDF routes
  // when deployed to serverless (Vercel/Netlify).
  outputFileTracingIncludes: {
    '/api/pdf/cost-sheet': ['./src/lib/pdf/fonts/**', './public/Brown.png'],
    '/api/pdf/pi': ['./src/lib/pdf/fonts/**', './public/Brown.png'],
    '/api/pdf/voucher': ['./src/lib/pdf/fonts/**', './public/Brown.png'],
  },
};

export default config;
