#!/usr/bin/env node
/**
 * Configura a chave da API da Anthropic (gerador de emails com IA).
 *
 *   npm run ai-key          → pede a chave (não aparece no ecrã), testa-a e grava-a
 *   npm run ai-key -- --test → só testa a chave que já está no apps/web/.env.local
 *
 * A chave é testada junto da Anthropic ANTES de ser gravada, e só é gravada
 * se for aceite. Nunca é mostrada por inteiro.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { askHidden, cleanSecret, secretHint } from './lib.mjs';

const ENV_FILE = 'apps/web/.env.local';
const API = process.env.AI_BASE_URL || 'https://api.anthropic.com';
const testOnly = process.argv.includes('--test');

const clean = cleanSecret;
const hint = secretHint;

async function testKey(key) {
  try {
    const res = await fetch(`${API}/v1/models`, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    return { ok: false, status: res.status, message: body?.error?.message ?? res.statusText };
  } catch (error) {
    return { ok: false, status: 0, message: `sem ligação à Anthropic (${error.message})` };
  }
}

function explain(result) {
  console.error(`\n✖ A Anthropic recusou a chave: ${result.status ? `${result.status} — ` : ''}${result.message}`);
  if (result.status === 401) {
    console.error('  • Confirma na consola (Chaves de API) que a chave existe e está ativa.');
    console.error('  • Copia-a com o ícone de copiar (não selecionar com o rato) e corre outra vez: npm run ai-key');
    console.error('  • Se a chave começar por "sk-ant-usr-" e continuar a falhar, cria-a em "Contas de serviço".');
  } else if (result.status === 403) {
    console.error('  • A chave não tem permissão: confirma o espaço de trabalho e a organização da chave.');
  } else if (result.status === 400 && /credit/i.test(result.message)) {
    console.error('  • Sem créditos: compra créditos em console.anthropic.com → Faturamento.');
  }
}

function readEnvKeys() {
  if (!existsSync(ENV_FILE)) return [];
  return readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l))
    .map((l) => clean(l.replace(/^\s*ANTHROPIC_API_KEY\s*=/, '')));
}

function saveKey(key) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : [];
  const kept = lines.filter((l) => !/^\s*ANTHROPIC_API_KEY\s*=/.test(l));
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  kept.push(`ANTHROPIC_API_KEY=${key}`, '');
  writeFileSync(ENV_FILE, kept.join('\n'), 'utf8');
}

if (!existsSync(ENV_FILE)) {
  console.error(`✖ Não encontro ${ENV_FILE}. Corre este comando na pasta do projeto (onde fazes "npm run dev").`);
  process.exit(1);
}

if (testOnly) {
  const keys = readEnvKeys();
  if (!keys.length) {
    console.error('✖ Não há ANTHROPIC_API_KEY no .env.local. Corre: npm run ai-key');
    process.exit(1);
  }
  if (keys.length > 1) console.warn(`! Há ${keys.length} linhas ANTHROPIC_API_KEY; vale a última. Corre "npm run ai-key" para ficar só uma.`);
  const key = keys[keys.length - 1];
  console.log(`A testar a chave ${hint(key)}…`);
  const result = await testKey(key);
  if (!result.ok) {
    explain(result);
    process.exit(1);
  }
  console.log('✔ A Anthropic aceita a chave.');
  process.exit(0);
}

console.log('Chave da API da Anthropic (gerador de emails com IA)');
console.log('1. Na consola da Anthropic, carrega no ícone de copiar da chave.');
console.log('2. Aqui, cola com clique direito (ou Ctrl+V) e carrega em Enter. A chave não aparece no ecrã.\n');
const key = clean(await askHidden('Chave: '));

if (!key) {
  console.error('✖ Não foi colada nenhuma chave.');
  process.exit(1);
}
if (!key.startsWith('sk-ant-')) {
  console.error(`✖ Isto não parece uma chave da Anthropic (devia começar por "sk-ant-"; recebi ${key.length} carateres a começar por "${key.slice(0, 6)}").`);
  console.error('  Copia a chave na consola com o ícone de copiar e corre outra vez: npm run ai-key');
  process.exit(1);
}

console.log(`A testar a chave ${hint(key)}…`);
const result = await testKey(key);
if (!result.ok) {
  explain(result);
  console.error('  A chave NÃO foi gravada.');
  process.exit(1);
}
saveKey(key);
console.log(`✔ A Anthropic aceita a chave. Gravada em ${ENV_FILE}.`);
console.log('  Agora reinicia o servidor: Ctrl + C e depois npm run dev');
