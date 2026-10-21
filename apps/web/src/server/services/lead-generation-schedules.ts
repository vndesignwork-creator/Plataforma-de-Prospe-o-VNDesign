/**
 * Pesquisas automáticas do gerador de leads: uma pesquisa guardada que corre
 * sozinha uma vez por semana (dia e hora de Lisboa). Quem as lança é o cron
 * (ver /api/v1/cron/reminders); no fim, o utilizador recebe uma notificação e
 * um email com o resumo. Cada pesquisa tem o seu interruptor ativar/desativar.
 */
import {
  LEAD_GENERATION_MAX_SCHEDULES,
  describeWeeklyRun,
  nextWeeklyRun,
  plainTextToHtml,
  type LeadGenerationRun,
  type LeadGenerationSchedule,
  type LeadGenerationScheduleUpdate,
  type LeadGenerationScheduleUpsert,
} from '@vndesign/core';
import type { ApiContext, MemberRole } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { isMailConfigured, sendMail, sendWithAccount } from '../mailer';
import { createSupabaseAdminClient } from '../supabase-admin';
import { detachedContext, startLeadGeneration } from './lead-generation';
import { loadSmtpAccount } from './mail-account';
import { sendUserPush } from './push';

const SELECT =
  'id, enabled, query, city, sector_id, services, max_results, weekday, hour, auto_add, audit, next_run_at, last_run_at, last_run_id, last_error, checked_at, created_at';
const NOT_FOUND = 'Pesquisa automática não encontrada';
/** Se já houver uma pesquisa a correr, tenta outra vez daqui a pouco. */
const RETRY_MS = 10 * 60_000;

type Row = LeadGenerationSchedule & { workspace_id?: string; created_by?: string | null };

export async function listSchedules(ctx: ApiContext): Promise<LeadGenerationSchedule[]> {
  const { data, error } = await ctx.supabase
    .from('lead_generation_schedules')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: true });
  // Antes da migração 20261027000100 a tabela não existe.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
  if (error) throw fromPostgrest(error);
  return (data ?? []) as LeadGenerationSchedule[];
}

async function getSchedule(ctx: ApiContext, id: string): Promise<LeadGenerationSchedule> {
  const { data, error } = await ctx.supabase
    .from('lead_generation_schedules')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  if (!data) throw new ApiError(404, NOT_FOUND);
  return data as LeadGenerationSchedule;
}

const nextRunFor = (enabled: boolean, weekday: number, hour: number) =>
  enabled ? nextWeeklyRun(weekday, hour).toISOString() : null;

export async function createSchedule(ctx: ApiContext, input: LeadGenerationScheduleUpsert): Promise<LeadGenerationSchedule> {
  const { count } = await ctx.supabase
    .from('lead_generation_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', ctx.workspaceId);
  if ((count ?? 0) >= LEAD_GENERATION_MAX_SCHEDULES) {
    throw new ApiError(422, 'Demasiadas pesquisas automáticas', `O máximo é ${LEAD_GENERATION_MAX_SCHEDULES}. Apaga uma antes de criar outra.`);
  }
  const { data, error } = await ctx.supabase
    .from('lead_generation_schedules')
    .insert({
      ...input,
      workspace_id: ctx.workspaceId,
      created_by: ctx.user.id,
      next_run_at: nextRunFor(input.enabled, input.weekday, input.hour),
    })
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return data as LeadGenerationSchedule;
}

export async function updateSchedule(
  ctx: ApiContext,
  id: string,
  input: LeadGenerationScheduleUpdate,
): Promise<LeadGenerationSchedule> {
  const current = await getSchedule(ctx, id);
  const enabled = input.enabled ?? current.enabled;
  const weekday = input.weekday ?? current.weekday;
  const hour = input.hour ?? current.hour;
  const reschedule = enabled !== current.enabled || weekday !== current.weekday || hour !== current.hour;
  const { data, error } = await ctx.supabase
    .from('lead_generation_schedules')
    .update({
      ...input,
      // Quem a muda passa a recebê-la (notificação e email).
      created_by: ctx.user.id,
      ...(reschedule || (enabled && !current.next_run_at) ? { next_run_at: nextRunFor(enabled, weekday, hour) } : {}),
      ...(input.enabled ? { last_error: null } : {}),
    })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(SELECT)
    .maybeSingle();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  if (!data) throw new ApiError(404, NOT_FOUND);
  return data as LeadGenerationSchedule;
}

export async function deleteSchedule(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('lead_generation_schedules')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select('id');
  if (error) throw fromPostgrest(error, NOT_FOUND);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
}

/** Lança a pesquisa de um agendamento (pelo cron ou pelo botão "Correr agora"). */
async function launch(ctx: ApiContext, schedule: LeadGenerationSchedule, appUrl: string): Promise<LeadGenerationRun> {
  // O aviso é enviado depois de o pedido responder: não pode depender dos cookies.
  const background = await detachedContext(ctx);
  const run = await startLeadGeneration(
    ctx,
    {
      query: schedule.query,
      city: schedule.city,
      sector_id: schedule.sector_id,
      services: schedule.services,
      max_results: schedule.max_results,
    },
    {
      scheduleId: schedule.id,
      autoAdd: schedule.auto_add ? { audit: schedule.audit } : null,
      onFinished: (finished) => notifyFinished(background, schedule, finished, appUrl),
    },
  );
  await ctx.supabase
    .from('lead_generation_schedules')
    .update({ last_run_at: run.created_at, last_run_id: run.id, last_error: null })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', schedule.id);
  return run;
}

/** "Correr agora": a mesma pesquisa, sem esperar pelo dia marcado (não muda a próxima data). */
export async function runScheduleNow(ctx: ApiContext, id: string, appUrl: string): Promise<LeadGenerationRun> {
  return launch(ctx, await getSchedule(ctx, id), appUrl);
}

// -----------------------------------------------------------------------------
// Aviso no fim
// -----------------------------------------------------------------------------

export function summarizeRun(run: LeadGenerationRun): { title: string; body: string } {
  if (run.status === 'error') {
    return { title: 'A pesquisa automática falhou', body: `“${run.query}”: ${run.error ?? 'erro inesperado'}` };
  }
  const fresh = run.candidates.filter((c) => c.match.status === 'new' || c.added_lead_id).length;
  const where = run.city ? ` · ${run.city}` : '';
  if (run.auto_added) {
    return {
      title: run.auto_added === 1 ? '1 lead novo do gerador semanal' : `${run.auto_added} leads novos do gerador semanal`,
      body: `“${run.query}”${where} — já estão na lista de leads.`,
    };
  }
  if (!fresh) return { title: 'Gerador semanal: nada de novo', body: `“${run.query}”${where} — não encontrou empresas novas esta semana.` };
  return {
    title: fresh === 1 ? 'Gerador semanal: 1 empresa nova' : `Gerador semanal: ${fresh} empresas novas`,
    body: `“${run.query}”${where} — revê a lista e escolhe quais entram como leads.`,
  };
}

async function notifyFinished(ctx: ApiContext, schedule: LeadGenerationSchedule, run: LeadGenerationRun, appUrl: string) {
  const { title, body } = summarizeRun(run);
  const path = `/gerar-leads?pesquisa=${run.id}`;
  await sendUserPush(ctx.workspaceId, ctx.user.id, { title, body, url: path, tag: `leadgen-${schedule.id}` }).catch((error) =>
    console.warn('[gerador] notificação falhou', error instanceof Error ? error.message : error),
  );

  const lines = [
    body,
    '',
    run.status === 'done' && run.candidates.length
      ? run.candidates
          .filter((c) => c.match.status === 'new' || c.added_lead_id)
          .slice(0, 15)
          .map((c) => `• ${c.company_name}${c.city ? ` (${c.city})` : ''} — ${c.opportunity}`)
          .join('\n')
      : null,
    '',
    `Abrir: ${appUrl}${path}`,
    '',
    `Pesquisa automática: ${describeWeeklyRun(schedule.weekday, schedule.hour)}. Desliga-a em Gerar leads → Pesquisas automáticas.`,
  ].filter((l): l is string => l !== null);
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  const subject = `${title} — VNDesign Leads`;
  try {
    // Pela conta de envio do utilizador (para ele próprio) ou, sem ela, pelo SMTP do servidor.
    const account = await loadSmtpAccount(ctx).catch(() => null);
    if (account) {
      await sendWithAccount(account.account, { to: account.account.fromEmail, subject, text, html: plainTextToHtml(text) });
    } else if (isMailConfigured() && ctx.user.email) {
      await sendMail({ to: ctx.user.email, subject, text, html: plainTextToHtml(text) });
    }
  } catch (error) {
    console.warn('[gerador] email de aviso falhou', error instanceof Error ? error.message : error);
  }
}

// -----------------------------------------------------------------------------
// Cron
// -----------------------------------------------------------------------------

export interface ScheduleCronResult {
  schedule_id: string;
  workspace_id: string;
  status: 'started' | 'busy' | 'error' | 'dry_run';
  run_id?: string;
  error?: string;
}

/** Contexto do cron, em nome de quem criou (ou mudou por último) a pesquisa. */
async function systemContext(workspaceId: string, userId: string | null): Promise<ApiContext | null> {
  const admin = createSupabaseAdminClient();
  const { data: members } = await admin
    .from('workspace_members')
    .select('user_id, role, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  const list = (members ?? []) as { user_id: string; role: MemberRole }[];
  // Se quem a criou já não é membro, fica em nome do dono do workspace.
  const member = list.find((m) => m.user_id === userId) ?? list.find((m) => m.role === 'owner') ?? list[0];
  if (!member) return null;
  const { data } = await admin.auth.admin.getUserById(member.user_id);
  return {
    // O autor das alterações (leads criados, atividade) chega aos triggers por este cabeçalho.
    supabase: createSupabaseAdminClient({ 'x-vnd-actor-user': member.user_id }),
    user: { id: member.user_id, email: data.user?.email ?? null },
    workspaceId,
    role: member.role,
    authMethod: 'system',
  };
}

/** Corre as pesquisas automáticas que chegaram à hora (chamado pelo cron de 5 em 5 minutos). */
export async function runDueSchedules(options: { appUrl: string; dryRun?: boolean; now?: Date }): Promise<ScheduleCronResult[]> {
  const admin = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  // Marca a passagem do cron (a página mostra se o agendador está a funcionar).
  const touched = await admin.from('lead_generation_schedules').update({ checked_at: now.toISOString() }).eq('enabled', true);
  if (touched.error?.code === '42P01' || touched.error?.code === 'PGRST205') return [];

  const { data, error } = await admin
    .from('lead_generation_schedules')
    .select(`${SELECT}, workspace_id, created_by`)
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at')
    .limit(20);
  if (error) throw new Error(error.message);
  const due = (data ?? []) as Row[];
  const results: ScheduleCronResult[] = [];

  for (const schedule of due) {
    const workspaceId = schedule.workspace_id!;
    if (options.dryRun) {
      results.push({ schedule_id: schedule.id, workspace_id: workspaceId, status: 'dry_run' });
      continue;
    }
    // Reserva esta execução (se dois crons chegarem ao mesmo tempo, só um a corre).
    const next = nextWeeklyRun(schedule.weekday, schedule.hour, now).toISOString();
    const { data: claimed } = await admin
      .from('lead_generation_schedules')
      .update({ next_run_at: next })
      .eq('id', schedule.id)
      .eq('next_run_at', schedule.next_run_at!)
      .select('id');
    if (!claimed?.length) continue;

    const ctx = await systemContext(workspaceId, schedule.created_by ?? null);
    if (!ctx) continue;
    try {
      const run = await launch(ctx, schedule, options.appUrl);
      results.push({ schedule_id: schedule.id, workspace_id: workspaceId, status: 'started', run_id: run.id });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Já há uma pesquisa a correr neste workspace: tenta daqui a 10 minutos.
        await admin
          .from('lead_generation_schedules')
          .update({ next_run_at: new Date(now.getTime() + RETRY_MS).toISOString() })
          .eq('id', schedule.id);
        results.push({ schedule_id: schedule.id, workspace_id: workspaceId, status: 'busy' });
        continue;
      }
      const message = error instanceof ApiError ? (error.detail ?? error.title) : 'Erro inesperado.';
      if (!(error instanceof ApiError)) console.error('[gerador] pesquisa automática', error);
      await admin.from('lead_generation_schedules').update({ last_error: message, last_run_at: now.toISOString() }).eq('id', schedule.id);
      results.push({ schedule_id: schedule.id, workspace_id: workspaceId, status: 'error', error: message });
    }
  }
  return results;
}
