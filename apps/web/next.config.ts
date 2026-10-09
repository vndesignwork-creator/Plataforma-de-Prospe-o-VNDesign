import path from 'node:path';
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  // Depois da primeira visita por HTTPS, o browser nunca mais usa http:// (os browsers ignoram-no em localhost).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // O pacote partilhado é TypeScript "cru": o Next compila-o.
  transpilePackages: ['@vndesign/core'],
  // Gerador de PDF das propostas: corre como pacote Node normal (não é empacotado).
  serverExternalPackages: ['@react-pdf/renderer'],
  // Permite fixar a raiz do monorepo (evita avisos com vários lockfiles).
  turbopack: { root: path.join(__dirname, '..', '..') },
  poweredByHeader: false,
  // Imagem Docker (Coolify): BUILD_STANDALONE=1 gera um servidor Node autónomo.
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Dados dos leads: nunca guardados em caches partilhadas (CDN/proxy do alojamento).
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
      // O service worker tem de ser sempre revalidado para as atualizações chegarem.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
