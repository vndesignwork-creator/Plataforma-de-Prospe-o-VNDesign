import { timingSafeEqual } from 'node:crypto';
import { handleError, json, problemResponse } from '@/server/http';
import { sendDailyDigests } from '@/server/services/digest';
import { sendDailyPushes } from '@/server/services/push';

export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization') ?? '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET/POST /api/v1/cron/daily-digest — envia o resumo diário a todos os
 * workspaces com o resumo ativo e a notificação push a todos os dispositivos
 * subscritos. Autenticação: "Authorization: Bearer CRON_SECRET"
 * (o Vercel Cron envia-o automaticamente). ?dry_run=true não envia.
 */
async function handler(req: Request) {
  if (!authorized(req)) return problemResponse(401, 'Não autorizado', 'CRON_SECRET em falta ou inválido.');
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dry_run') === 'true';
    const [results, push] = await Promise.all([
      sendDailyDigests({ appUrl: process.env.APP_URL ?? url.origin, dryRun }),
      sendDailyPushes({ dryRun }),
    ]);
    return json({ data: results, push });
  } catch (e) {
    return handleError(e);
  }
}

export const GET = handler;
export const POST = handler;
