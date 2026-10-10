#!/usr/bin/env node
/**
 * Assistente de publicação (Supabase na nuvem + Hostinger).
 *
 *   npm run publicar               → verifica o projeto Supabase na nuvem, cria o teu
 *                                    utilizador (se faltar) e prepara as variáveis da
 *                                    Hostinger no ficheiro .env.hostinger.local
 *   npm run publicar -- --verificar → depois de publicar: verifica o site no ar
 *
 * As chaves nunca são mostradas por inteiro. O ficheiro .env.hostinger.local fica
 * só no teu computador (está no .gitignore): copias de lá os valores para o hPanel.
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ask, askHidden, cleanSecret, readEnvFile, secretHint } from './lib.mjs';

const OUT_FILE = '.env.hostinger.local';
const LOCAL_ENV = 'apps/web/.env.local';
const ok = (msg) => console.log(`  ✔ ${msg}`);
const warn = (msg) => console.log(`  ! ${msg}`);
const fail = (msg) => console.log(`  ✖ ${msg}`);
const problems = [];

// -----------------------------------------------------------------------------
// --verificar: o site já publicado
// -----------------------------------------------------------------------------
if (process.argv.includes('--verificar')) {
  const saved = readEnvFile(OUT_FILE);
  const site = (process.argv[process.argv.indexOf('--verificar') + 1]?.startsWith('http')
    ? process.argv[process.argv.indexOf('--verificar') + 1]
    : saved.APP_URL || 'https://leads.vndesign.pt'
  ).replace(/\/$/, '');
  console.log(`\nA verificar ${site}…\n`);
  const get = (path, init) => fetch(site + path, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...init });
  try {
    const login = await get('/login');
    if (login.status === 200) ok('A página de login abre.');
    else {
      fail(`A página de login respondeu ${login.status}.`);
      problems.push('login');
    }
    if (login.headers.get('strict-transport-security')) ok('HTTPS obrigatório (HSTS) ativo.');
    else warn('Sem HSTS: confirma que o site está em https:// e que o SSL está ativo no hPanel.');

    const me = await get('/api/v1/me');
    if (me.status === 401) ok('A API responde e exige sessão.');
    else {
      fail(`A API respondeu ${me.status} sem sessão (esperado 401).`);
      problems.push('api');
    }

    const http = await fetch(site.replace(/^https:/, 'http:') + '/login', { redirect: 'manual', signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (http && http.status >= 300 && http.status < 400 && http.headers.get('location')?.startsWith('https:')) ok('http:// redireciona para https://.');
    else warn('http:// não redireciona para https:// — ativa "Forçar HTTPS" no hPanel (SSL).');

    const manifest = await get('/manifest.webmanifest');
    if (manifest.status === 200) ok('App instalável no telemóvel (manifesto PWA).');
    else warn(`Manifesto PWA respondeu ${manifest.status}.`);

    if (saved.CRON_SECRET) {
      const cron = await get('/api/v1/cron/daily-digest?dry_run=true', { headers: { Authorization: `Bearer ${saved.CRON_SECRET}` } });
      if (cron.status === 200) ok('Tarefa diária (cron) aceita o segredo (teste sem enviar nada).');
      else {
        fail(`A tarefa diária respondeu ${cron.status}: confirma CRON_SECRET no hPanel.`);
        problems.push('cron');
      }
    }
  } catch (error) {
    fail(`Não consegui ligar a ${site} (${error.message}). O domínio já aponta para a Hostinger?`);
    problems.push('ligação');
  }
  console.log(problems.length ? '\nHá pontos a corrigir (acima).' : '\nTudo certo. Entra em ' + site + ' e faz login.');
  process.exit(problems.length ? 1 : 0);
}

// -----------------------------------------------------------------------------
// 1. Projeto Supabase na nuvem
// -----------------------------------------------------------------------------
console.log('\nPublicar a VNDesign Leads — passo 1: Supabase na nuvem');
console.log('No supabase.com, abre o projeto → Project Settings → API Keys (e Data API para o URL).\n');

const saved = readEnvFile(OUT_FILE);
const urlIn = (await ask(`Project URL${saved.NEXT_PUBLIC_SUPABASE_URL ? ` [${saved.NEXT_PUBLIC_SUPABASE_URL}]` : ''}: `)) || saved.NEXT_PUBLIC_SUPABASE_URL || '';
const url = urlIn.replace(/\/$/, '');
const ref = /^https:\/\/([a-z0-9]{10,})\.supabase\.co$/.exec(url)?.[1];
if (!ref) {
  console.error('✖ O URL deve ser do tipo https://abcdefghijklmnop.supabase.co (o do projeto na nuvem, não o local).');
  process.exit(1);
}
const publishable =
  cleanSecret(await ask(`Publishable key (sb_publishable_…)${saved.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? ' [Enter = a mesma]' : ''}: `)) ||
  saved.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';
const secret =
  cleanSecret(await askHidden(`Secret key (sb_secret_…, não aparece no ecrã)${saved.SUPABASE_SECRET_KEY ? ' [Enter = a mesma]' : ''}: `)) ||
  saved.SUPABASE_SECRET_KEY ||
  '';
if (!publishable.startsWith('sb_publishable_') && !publishable.startsWith('eyJ')) {
  console.error('✖ A publishable key deve começar por "sb_publishable_".');
  process.exit(1);
}
if (!secret.startsWith('sb_secret_') && !secret.startsWith('eyJ')) {
  console.error('✖ A secret key deve começar por "sb_secret_".');
  process.exit(1);
}

const admin = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
const call = (path, init = {}) => fetch(url + path, { signal: AbortSignal.timeout(20_000), ...init });

console.log('\nA verificar o projeto…');
let users = [];
{
  const res = await call('/auth/v1/admin/users?per_page=50', { headers: admin }).catch((e) => ({ ok: false, status: 0, e }));
  if (res.status === 0) {
    fail(`Não consegui ligar a ${url} (${res.e?.message}). Confirma o Project URL e a ligação à internet.`);
    process.exit(1);
  }
  if (!res.ok) {
    fail(`A secret key não foi aceite (${res.status}). Copia-a outra vez em Project Settings → API Keys.`);
    process.exit(1);
  }
  users = (await res.json()).users ?? [];
  ok(`Chaves aceites (${secretHint(secret)}).`);
}

// Migrações: a coluna mais recente (arquivo de leads) tem de existir.
{
  const res = await call('/rest/v1/leads?select=archived_at&limit=1', { headers: admin });
  if (res.ok) ok('Base de dados com todas as migrações.');
  else {
    fail('A base de dados ainda não tem as tabelas todas. No PowerShell, na pasta do projeto, corre:');
    console.log(`      npx supabase login`);
    console.log(`      npx supabase link --project-ref ${ref}`);
    console.log(`      npx supabase db push`);
    console.log('    e depois volta a correr: npm run publicar');
    problems.push('migrações');
  }
}

// O registo público tem de estar desligado (senão qualquer pessoa cria conta).
{
  const probe = `verificacao-registo-${randomBytes(4).toString('hex')}@vndesign.pt`;
  const res = await call('/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: publishable, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: probe, password: randomBytes(16).toString('hex') }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    // Ficou criada uma conta de teste: apaga-a já.
    const id = body.user?.id ?? body.id;
    if (id) await call(`/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin });
    fail('O registo público está LIGADO: qualquer pessoa pode criar conta e gastar os teus créditos.');
    console.log('    Supabase → Authentication → Sign In / Providers → desliga "Allow new users to sign up" e guarda.');
    problems.push('registo público');
  } else if (body.error_code === 'signup_disabled' || /signups? not allowed/i.test(body.msg ?? body.message ?? '')) {
    ok('Registo público desligado (só tu entras).');
  } else {
    warn(`Não consegui confirmar o registo público (${res.status} ${body.error_code ?? body.msg ?? ''}). Confirma à mão que "Allow new users to sign up" está desligado.`);
  }
}

// O teu utilizador.
if (users.length) {
  ok(`Utilizador(es): ${users.map((u) => u.email).join(', ')}`);
} else if (!problems.includes('migrações')) {
  console.log('\nAinda não há utilizadores neste projeto. Vamos criar o teu.');
  const email = await ask('Email para entrar: ');
  const fullName = await ask('Nome (para a assinatura dos emails): ');
  const phone = await ask('Telefone (opcional): ');
  const password = await askHidden('Palavra-passe (mín. 10 carateres, não aparece): ');
  const again = await askHidden('Repete a palavra-passe: ');
  if (!email || password.length < 10 || password !== again) {
    fail('Email em falta, palavra-passe curta ou diferente. Corre outra vez: npm run publicar');
    process.exit(1);
  }
  const res = await call('/auth/v1/admin/users', {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName, phone } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail(`Não foi possível criar o utilizador (${res.status}): ${body.msg ?? body.message ?? ''}`);
    process.exit(1);
  }
  ok(`Utilizador criado: ${email} (com o workspace "VNDesign", setores, modelos e pacotes).`);
}

// -----------------------------------------------------------------------------
// 2. Variáveis para a Hostinger
// -----------------------------------------------------------------------------
console.log('\nPublicar — passo 2: variáveis para a Hostinger');
const domainIn = (await ask(`Endereço da plataforma [${saved.APP_URL ?? 'https://leads.vndesign.pt'}]: `)) || saved.APP_URL || 'https://leads.vndesign.pt';
const appUrl = (domainIn.startsWith('http') ? domainIn : `https://${domainIn}`).replace(/\/$/, '');

const local = readEnvFile(LOCAL_ENV);
const isLocalHost = (h) => !h || /^(127\.|localhost|0\.0\.0\.0)/.test(h);

// Chaves VAPID (notificações): nunca mudar depois de publicar, senão os telemóveis deixam de as receber.
let vapid = { publicKey: saved.VAPID_PUBLIC_KEY, privateKey: saved.VAPID_PRIVATE_KEY };
if (!vapid.publicKey || !vapid.privateKey) {
  if (local.VAPID_PUBLIC_KEY && local.VAPID_PRIVATE_KEY) vapid = { publicKey: local.VAPID_PUBLIC_KEY, privateKey: local.VAPID_PRIVATE_KEY };
  else vapid = createRequire(new URL('../apps/web/package.json', import.meta.url))('web-push').generateVAPIDKeys();
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
  SUPABASE_SECRET_KEY: secret,
  HOSTNAME: '0.0.0.0',
  APP_URL: appUrl,
  CRON_SECRET: saved.CRON_SECRET || randomBytes(32).toString('base64url'),
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: saved.VAPID_SUBJECT || local.VAPID_SUBJECT || 'mailto:geral@vndesign.pt',
  ANTHROPIC_API_KEY: saved.ANTHROPIC_API_KEY || local.ANTHROPIC_API_KEY || '',
  PAGESPEED_API_KEY: saved.PAGESPEED_API_KEY || local.PAGESPEED_API_KEY || '',
  // SMTP: só o real (o Mailpit local não serve em produção).
  SMTP_HOST: saved.SMTP_HOST || (isLocalHost(local.SMTP_HOST) ? 'smtp.hostinger.com' : local.SMTP_HOST),
  SMTP_PORT: saved.SMTP_PORT || (isLocalHost(local.SMTP_HOST) ? '465' : local.SMTP_PORT || '465'),
  SMTP_USER: saved.SMTP_USER || (isLocalHost(local.SMTP_HOST) ? '' : local.SMTP_USER || ''),
  SMTP_PASS: saved.SMTP_PASS || (isLocalHost(local.SMTP_HOST) ? '' : local.SMTP_PASS || ''),
  SMTP_FROM: saved.SMTP_FROM || local.SMTP_FROM || 'VNDesign Leads <leads@vndesign.pt>',
};

const lines = [
  '# Variáveis para a Hostinger (hPanel → o teu site Node.js → Variáveis de ambiente).',
  '# Gerado por "npm run publicar". NÃO enviar a ninguém nem pôr no GitHub (está no .gitignore).',
  '# Copia cada linha: nome à esquerda do "=", valor à direita.',
  '# NUNCA acrescentar as variáveis de teste (AUDIT_ALLOW_PRIVATE, AUDIT_SKIP_PAGESPEED, AI_BASE_URL, GEOCODER_URL, MAILPIT_URL).',
  '',
  '# --- Obrigatórias ---',
  ...['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'HOSTNAME', 'APP_URL', 'CRON_SECRET'].map((k) => `${k}=${env[k]}`),
  '',
  '# --- Notificações no telemóvel (não mudar estas chaves depois de publicar) ---',
  ...['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'].map((k) => `${k}=${env[k]}`),
  '',
  '# --- Email com IA e auditor de sites (vazio = funcionalidade desligada) ---',
  `ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY}`,
  `PAGESPEED_API_KEY=${env.PAGESPEED_API_KEY}`,
  '',
  '# --- Resumo diário por email (SMTP da Hostinger; preenche SMTP_USER e SMTP_PASS com a caixa de email) ---',
  ...['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].map((k) => `${k}=${env[k]}`),
  '',
];
writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
ok(`Variáveis prontas em ${OUT_FILE} (abre-o no Bloco de Notas: notepad ${OUT_FILE}).`);
if (!env.ANTHROPIC_API_KEY) warn('Sem ANTHROPIC_API_KEY: o email com IA fica desligado (podes acrescentá-la depois).');
if (!env.PAGESPEED_API_KEY) warn('Sem PAGESPEED_API_KEY: o auditor funciona, mas com limites baixos do Google.');
if (!env.SMTP_USER) warn('SMTP_USER e SMTP_PASS por preencher: sem eles não há resumo diário por email.');

// -----------------------------------------------------------------------------
// 3. O que falta fazer à mão
// -----------------------------------------------------------------------------
const host = new URL(appUrl).host;
console.log(`
Publicar — passo 3: no Supabase (supabase.com → o projeto)
  • Authentication → URL Configuration
      Site URL:       ${appUrl}
      Redirect URLs:  ${appUrl}/auth/callback   e   ${appUrl}/**
  • Authentication → Emails → SMTP Settings (para "Recuperar palavra-passe" chegar):
      Host smtp.hostinger.com · Porta 465 · utilizador e palavra-passe da caixa leads@… · remetente VNDesign Leads

Publicar — passo 4: na Hostinger (hPanel)
  • Websites → Adicionar website → Node.js Apps → liga o GitHub → repositório
    "Plataforma-de-Prospe-o-VNDesign", ramo "claude/dazzling-lamport-61uewp" (ou main, se o juntares)
  • Root directory "/", Node 22.x, Build script "build:standalone",
    Output "apps/web/.next/standalone", Entry file "apps/web/.next/standalone/apps/web/server.js"
  • Variáveis de ambiente: as do ficheiro ${OUT_FILE}
  • Domínio: ${host} com SSL ativo e "Forçar HTTPS"
  • Cron Jobs (diário, ~07:45): curl -fsS -m 120 -o /dev/null -H "Authorization: Bearer <CRON_SECRET do ficheiro>" ${appUrl}/api/v1/cron/daily-digest

Depois de o site estar no ar:  npm run publicar -- --verificar
`);

if (problems.length) {
  console.log(`Atenção: falta resolver: ${problems.join(', ')} (ver ✖ acima) e voltar a correr npm run publicar.`);
  process.exit(1);
}
