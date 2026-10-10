#!/usr/bin/env node
/**
 * Build "standalone" da web: gera um servidor Node autónomo em
 *   apps/web/.next/standalone/apps/web/server.js
 * e copia para lá os ficheiros estáticos (o Next não o faz sozinho).
 * Usado pela Hostinger (Node.js Apps) e pelo Dockerfile.
 *
 *   npm run build:standalone
 *   node apps/web/.next/standalone/apps/web/server.js
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';

// --webpack: o compilador clássico. O Turbopack (o predefinido no Next 16) lança
// processos auxiliares para o CSS que o alojamento partilhado da Hostinger mata
// ("node process exited before we could connect to it").
const result = spawnSync('npm', ['run', 'build', '-w', '@vndesign/web', '--', '--webpack'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, BUILD_STANDALONE: '1', NEXT_TELEMETRY_DISABLED: '1' },
});
if (result.status !== 0) process.exit(result.status ?? 1);

const target = 'apps/web/.next/standalone/apps/web';
if (!existsSync(`${target}/server.js`)) {
  console.error('✖ Não foi gerado o servidor standalone (apps/web/.next/standalone).');
  process.exit(1);
}
cpSync('apps/web/.next/static', `${target}/.next/static`, { recursive: true });
cpSync('apps/web/public', `${target}/public`, { recursive: true });
console.log(`✔ Servidor pronto: node ${target}/server.js`);
