import { cronAuthorized } from '@/server/cron-auth';
import { handleError, json, problemResponse } from '@/server/http';
import { publicOrigin } from '@/lib/public-url';
import { createSupabaseAdminClient } from '@/server/supabase-admin';
import { sendDailyDigests } from '@/server/services/digest';
import { autoArchiveLeads, retryLostLeads } from '@/server/services/leads';
import { sendNotificationEmails } from '@/server/services/team-work';
import { saveDailyAlerts, sendDailyPushes } from '@/server/services/push';
import { runDueSchedules } from '@/server/services/lead-generation-schedules';
import { runWeeklyBackups } from '@/server/services/backup';
import { purgeExpiredTrash } from '@/server/services/lead-trash';
import { purgeOldActivities } from '@/server/services/activity-cleanup';
import { runMonthlyUpdateReminders, saveCoolingAlerts } from '@/server/services/periodic-alerts';
import { runRenewalReminders } from '@/server/services/renewals';
import { syncProspectWatch } from '@/server/services/site-monitors';
import { runTimedRules } from '@/server/services/automation';
import { runFreeAuditFollowUps } from '@/server/services/free-audit';
import { cronHeartbeat } from '@/server/services/platform';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/v1/cron/daily-digest — arquiva os leads "Sem interesse" antigos
 * (nos workspaces com o arquivo automático ligado), traz de volta à prospeção os
 * "agora não" com a data chegada, envia os avisos da equipa por email, envia a cópia de segurança
 * semanal (no dia escolhido), esvazia a reciclagem (mais de 30 dias), apaga os "Lead editado" antigos
 * (onde a limpeza automática está ligada), à segunda-feira avisa dos leads a arrefecer, no dia 1
 * prepara o ponto de situação mensal dos projetos (tarefa + aviso), envia o resumo diário a todos
 * os workspaces com o resumo ativo, avisa das renovações e avenças a chegar (tarefa + aviso), a notificação push a todos os dispositivos
 * subscritos e o mesmo resumo no sino. Autenticação: "Authorization: Bearer CRON_SECRET"
 * (o Vercel Cron envia-o automaticamente). ?dry_run=true não envia.
 */
async function handler(req: Request) {
  if (!cronAuthorized(req)) return problemResponse(401, 'Não autorizado', 'CRON_SECRET em falta ou inválido.');
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dry_run') === 'true';
    // Primeiro o arquivo automático, para o resumo já não contar esses leads.
    const archived = await autoArchiveLeads(createSupabaseAdminClient(), dryRun);
    // Os leads "agora não" com a data de voltar a tentar chegada voltam à prospeção (e ao resumo de hoje).
    const retried = await retryLostLeads(createSupabaseAdminClient(), dryRun);
    const [results, push, alerts, leadGeneration, backups, trashPurged, notificationEmails, activitiesPurged, cooling, monthlyUpdates, renewals, rules, prospectWatch, freeAuditFollowUps] = await Promise.all([
      sendDailyDigests({ appUrl: publicOrigin(req), dryRun }),
      sendDailyPushes({ dryRun }),
      // O mesmo resumo (atrasados e para hoje) no sino do dono e dos administradores.
      saveDailyAlerts({ dryRun }),
      // Se o cron dos lembretes não estiver ligado, as pesquisas automáticas correm pelo menos aqui.
      runDueSchedules({ appUrl: publicOrigin(req), dryRun }),
      // Cópia de segurança semanal (no dia escolhido em Definições → Funcionalidades).
      runWeeklyBackups({ dryRun }),
      // Reciclagem: o que foi apagado há mais de 30 dias sai de vez.
      purgeExpiredTrash({ dryRun }),
      // Avisos da equipa por email para quem não tem notificações push.
      sendNotificationEmails({ appUrl: publicOrigin(req), dryRun }),
      // Limpeza automática dos "Lead editado" antigos (só nos workspaces que a ligaram).
      purgeOldActivities({ dryRun }),
      // Segunda-feira: leads em conversa sem novidades há mais de 14 dias.
      saveCoolingAlerts({ dryRun }),
      // Dia 1: ponto de situação mensal (tarefa em cada projeto em curso + aviso).
      runMonthlyUpdateReminders({ dryRun }),
      // Renovações e avenças com a data a chegar: tarefa + aviso (uma vez por data).
      runRenewalReminders({ dryRun }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
      // Regras automáticas que dependem do tempo ("parado na fase há N dias").
      runTimedRules({ dryRun }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
      // Leads quentes cujo site se vigia (os de maior pontuação): junta os novos e tira os que saíram.
      syncProspectWatch({ dryRun }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
      // Análise grátis: follow-up a quem recebeu o PDF há N dias e não respondeu (uma vez).
      dryRun ? Promise.resolve({ sent: 0, skipped: 0 }) : runFreeAuditFollowUps().catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
    ]);
    if (!dryRun) await cronHeartbeat('digest');
    return json({ data: results, push, alerts, archived, retried, lead_generation: leadGeneration, backups, trash_purged: trashPurged, notification_emails: notificationEmails, activities_purged: activitiesPurged, cooling, monthly_updates: monthlyUpdates, renewals, automation_rules: rules, prospect_watch: prospectWatch, free_audit_follow_ups: freeAuditFollowUps });
  } catch (e) {
    return handleError(e);
  }
}

export const GET = handler;
export const POST = handler;
