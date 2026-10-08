import path from 'node:path';
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const nextConfig: NextConfig = {
  // O pacote partilhado é TypeScript "cru": o Next compila-o.
  transpilePackages: ['@vndesign/core'],
  // Permite fixar a raiz do monorepo (evita avisos com vários lockfiles).
  turbopack: { root: path.join(__dirname, '..', '..') },
  poweredByHeader: false,
  // Imagem Docker (Coolify): BUILD_STANDALONE=1 gera um servidor Node autónomo.
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
