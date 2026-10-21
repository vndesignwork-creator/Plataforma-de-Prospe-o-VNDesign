import { execSync } from 'node:child_process';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Identificador desta versão (o commit, ou a hora do build). Fica em
 * NEXT_PUBLIC_BUILD_ID (os processos do build herdam-no, por isso é igual em todos)
 * e serve para a plataforma perceber que foi publicada uma versão nova.
 */
function buildId(): string {
  if (process.env.NEXT_PUBLIC_BUILD_ID) return process.env.NEXT_PUBLIC_BUILD_ID;
  let id = '';
  try {
    id = execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // Sem git (ex.: build a partir de um zip): usa a hora.
  }
  id ||= `t${Date.now().toString(36)}`;
  process.env.NEXT_PUBLIC_BUILD_ID = id;
  return id;
}
const BUILD_ID = buildId();

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
  // Gerador de PDF das propostas e leitura da caixa de entrada (IMAP, usa o pino com
  // workers): correm como pacotes Node normais (não são empacotados).
  serverExternalPackages: ['@react-pdf/renderer', 'imapflow'],
  // O pdfkit (usado pelo gerador de PDF) carrega as fontes base com require() dinâmico,
  // que o "standalone" não deteta: sem isto, o PDF dá erro 500 em produção (Hostinger).
  outputFileTracingIncludes: {
    '/api/v1/proposals/**': ['../../node_modules/pdfkit/js/standard-fonts/**/*', '../../node_modules/pdfkit/js/data/**/*'],
  },
  // Permite fixar a raiz do monorepo (evita avisos com vários lockfiles).
  turbopack: { root: path.join(__dirname, '..', '..') },
  poweredByHeader: false,
  // Versão desta publicação: um separador aberto com a versão anterior recarrega a
  // página em vez de pedir ficheiros que já não existem ("This page couldn't load").
  deploymentId: BUILD_ID,
  // Imagem Docker (Coolify): BUILD_STANDALONE=1 gera um servidor Node autónomo.
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  // A máquina de build da Hostinger tem muitos processadores mas um limite baixo de
  // processos: com um processo por processador o build rebenta ("can't spawn worker
  // thread", SIGABRT). No build standalone usa-se no máximo 2 (NEXT_BUILD_CPUS muda-o).
  experimental: process.env.BUILD_STANDALONE ? { cpus: Number(process.env.NEXT_BUILD_CPUS) || 2 } : undefined,
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
