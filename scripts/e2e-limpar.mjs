#!/usr/bin/env node
/**
 * Base de testes limpa: os testes E2E criam leads, tarefas e projetos e nunca os
 * apagam; com milhares, ficam lentos e falham sem razão. Isto repõe o Supabase
 * LOCAL (migrações de raiz) e volta a criar o utilizador de teste (E2E_EMAIL /
 * E2E_PASSWORD de apps/web/.env.local).
 *
 * Só funciona com o Supabase no próprio computador (127.0.0.1 / localhost):
 * nunca toca na base de dados do site.
 *
 *   npm run e2e:limpar
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const env = {};
if (existsSync('apps/web/.env.local')) {
  for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const get = (key) => process.env[key] ?? env[key];

const url = get('NEXT_PUBLIC_SUPABASE_URL') ?? '';
let host = '';
try {
  host = new URL(url).hostname;
} catch {
  // sem URL válido: recusa já a seguir
}
if (!['127.0.0.1', 'localhost'].includes(host)) {
  console.error(`Recusado: NEXT_PUBLIC_SUPABASE_URL não é o Supabase local (${host || 'vazio'}). Isto só limpa a base de testes deste computador.`);
  process.exit(1);
}
const email = get('E2E_EMAIL');
const password = get('E2E_PASSWORD');
if (!email || !password) {
  console.error('Faltam E2E_EMAIL e E2E_PASSWORD em apps/web/.env.local (o utilizador de teste).');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
console.log('A repor a base de dados local (migrações de raiz)…');
run('npx supabase db reset --local');
console.log(`A criar o utilizador de teste ${email}…`);
run(`node scripts/create-user.mjs --email "${email}" --password "${password}" --name Teste`);
console.log('Pronto: base de testes limpa. Corre agora "npm run test:e2e".');
