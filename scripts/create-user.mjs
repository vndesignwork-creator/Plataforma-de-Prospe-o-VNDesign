#!/usr/bin/env node
/**
 * Cria o utilizador da plataforma (o registo público está desativado).
 * O trigger da base de dados cria automaticamente o workspace "VNDesign",
 * a assinatura e os dados iniciais (setores, modelos, ferramentas).
 *
 * Uso (PowerShell ou terminal):
 *   npm run create-user
 *   npm run create-user -- --email eu@vndesign.pt --name "Vá Nancassa" --phone "+351 9xx xxx xxx"
 *
 * Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY de apps/web/.env.local
 * (ou das variáveis de ambiente).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { parseArgs } from 'node:util';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile('apps/web/.env.local');
loadEnvFile('.env');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error('✖ Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SECRET_KEY (em apps/web/.env.local).');
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string' },
    phone: { type: 'string' },
  },
});

// Pergunta só o que não veio nos argumentos (e só num terminal interativo).
const rl = input.isTTY ? createInterface({ input, output }) : null;
const ask = async (q, key) => values[key] ?? (rl ? (await rl.question(q)).trim() || undefined : undefined);
const email = await ask('Email: ', 'email');
const password = await ask('Palavra-passe (mín. 8 caracteres): ', 'password');
const fullName = await ask('Nome (para a assinatura): ', 'name');
const phone = await ask('Telefone (opcional, para a assinatura): ', 'phone');
rl?.close();

if (!email || !password || password.length < 8) {
  console.error('✖ Indica um email e uma palavra-passe com pelo menos 8 caracteres.');
  process.exit(1);
}

const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`✖ Não foi possível criar o utilizador (${res.status}): ${body.msg ?? body.message ?? JSON.stringify(body)}`);
  process.exit(1);
}
console.log(`✔ Utilizador criado: ${body.email} (${body.id})`);
console.log('  Workspace "VNDesign" criado com setores, modelos de contacto e ferramentas.');
