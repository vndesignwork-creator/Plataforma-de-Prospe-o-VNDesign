import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Guarda a hora de início da corrida (no fim, a limpeza só apaga o que foi criado depois disto)
 * e, no Supabase local, dá as tarefas automáticas como corridas agora: entre corridas o cron não
 * corre e a faixa "As tarefas automáticas pararam" do Dashboard apareceria em todos os testes.
 */
export default async function globalSetup() {
  mkdirSync('e2e/.auth', { recursive: true });
  writeFileSync('e2e/.auth/inicio-corrida.txt', new Date().toISOString());

  const env: Record<string, string> = {};
  if (existsSync('apps/web/.env.local')) {
    for (const line of readFileSync('apps/web/.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SECRET_KEY;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if (!['127.0.0.1', 'localhost'].includes(host) || !key) return;
  const now = new Date().toISOString();
  await fetch(`${url}/rest/v1/platform_status?reminders_at=not.is.null`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ reminders_at: now }),
  }).catch(() => undefined);
  await fetch(`${url}/rest/v1/platform_status?digest_at=not.is.null`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ digest_at: now }),
  }).catch(() => undefined);
}
