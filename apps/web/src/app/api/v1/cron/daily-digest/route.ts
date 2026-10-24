import { cronAuthorized } from '@/server/cron-auth';
import { handleError, json, problemResponse } from '@/server/http';
import { publicOrigin } from '@/lib/public-url';
import { createSupabaseAdminClient } from '@/server/supabase-admin';
import { sendDailyDigests } from '@/server/services/digest';
import { autoArchiveLeads } from '@/server/services/leads';
import { sendDailyPushes } from '@/server/services/push';
import { runDueSchedules } from '@/server/services/lead-generation-schedules';
import { runWeeklyBackups } from '@/server/services/backup';
import { purgeExpiredTrash } from '@/server/services/lead-trash';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/v1/cron/daily-digest — arquiva os leads "Sem interesse" antigos
 * (nos workspaces com o arquivo automático ligado), envia a cópia de segurança
 * semanal (no dia escolhido), esvazia a reciclagem (mais de 30 dias), envia o resumo diário a todos
 * os workspaces com o resumo ativo e a notificação push a todos os dispositivos
 * subscritos. Autenticação: "Authorization: Bearer CRON_SECRET"
 * (o Vercel Cron envia-o automaticamente). ?dry_run=true não envia.
 */
async function handler(req: Request) {
  if (!cronAuthorized(req)) return problemResponse(401, 'Não autorizado', 'CRON_SECRET em falta ou inválido.');
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dry_run') === 'true';
    // Primeiro o arquivo automático, para o resumo já não contar esses leads.
    const archived = await autoArchiveLeads(createSupabaseAdminClient(), dryRun);
    const [results, push, leadGeneration, backups, trashPurged] = await Promise.all([
      sendDailyDigests({ appUrl: publicOrigin(req), dryRun }),
      sendDailyPushes({ dryRun }),
      // Se o cron dos lembretes não estiver ligado, as pesquisas automáticas correm pelo menos aqui.
      runDueSchedules({ appUrl: publicOrigin(req), dryRun }),
      // Cópia de segurança semanal (no dia escolhido em Definições → Funcionalidades).
      runWeeklyBackups({ dryRun }),
      // Reciclagem: o que foi apagado há mais de 30 dias sai de vez.
      purgeExpiredTrash({ dryRun }),
    ]);
    return json({ data: results, push, archived, lead_generation: leadGeneration, backups, trash_purged: trashPurged });
  } catch (e) {
    return handleError(e);
  }
}

export const GET = handler;
export const POST = handler;
