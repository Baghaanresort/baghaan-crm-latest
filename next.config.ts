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
};

export default config;
