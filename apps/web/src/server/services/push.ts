/**
 * Subscrições de notificações push (uma por browser/dispositivo) e o aviso
 * diário de follow-ups enviado pelo cron.
 */
import { leadPath, type PushSubscriptionCreate, type Today } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { isPushConfigured, sendPush, vapidPublicKey, type PushPayload, type StoredSubscription } from '../push';
import { createSupabaseAdminClient } from '../supabase-admin';
import { fetchToday } from './dashboard';
import { urgentTasks } from './digest';

export async function getPushStatus(ctx: ApiContext) {
  const { data, error } = await ctx.supabase
    .from('push_subscriptions')
    .select('id, endpoint, user_agent, created_at, last_used_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false });
  if (error) throw fromPostgrest(error);
  return { configured: isPushConfigured(), public_key: vapidPublicKey(), subscriptions: data ?? [] };
}

export async function saveSubscription(ctx: ApiContext, input: PushSubscriptionCreate, userAgent: string | null) {
  if (!isPushConfigured()) {
    throw new ApiError(503, 'Push não configurado', 'Faltam as chaves VAPID no servidor (ver README).');
  }
  // O mesmo browser pode já ter sido registado (ex.: noutra sessão): substitui.
  await ctx.supabase.from('push_subscriptions').delete().eq('endpoint', input.endpoint);
  const { error } = await ctx.supabase.from('push_subscriptions').insert({
    workspace_id: ctx.workspaceId,
    user_id: ctx.user.id,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    user_agent: userAgent?.slice(0, 300) ?? null,
  });
  if (error) throw fromPostgrest(error);
}

export async function deleteSubscription(ctx: ApiContext, endpoint: string) {
  const { error } = await ctx.supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', ctx.user.id)
    .eq('endpoint', endpoint);
  if (error) throw fromPostgrest(error);
}

async function deliver(subs: StoredSubscription[], payload: PushPayload) {
  const admin = createSupabaseAdminClient();
  const results = await Promise.all(subs.map(async (s) => ({ id: s.id, status: await sendPush(s, payload) })));
  const gone = results.filter((r) => r.status === 'gone').map((r) => r.id);
  const sent = results.filter((r) => r.status === 'sent').map((r) => r.id);
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone);
  if (sent.length) await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).in('id', sent);
  return { sent: sent.length, removed: gone.length, failed: results.length - sent.length - gone.length };
}

/** Notificação de teste para todos os dispositivos do utilizador. */
export async function sendTestPush(ctx: ApiContext) {
  if (!isPushConfigured()) throw new ApiError(503, 'Push não configurado', 'Faltam as chaves VAPID no servidor.');
  const { data, error } = await ctx.supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id);
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(422, 'Sem dispositivos', 'Ativa primeiro as notificações neste dispositivo.');
  return deliver(data as StoredSubscription[], {
    title: 'VNDesign Leads',
    body: 'As notificações estão a funcionar. 🎉',
    url: '/dashboard',
    tag: 'test',
  });
}

/** Texto da notificação diária (null = nada para avisar). */
export function buildDailyPush(today: Today): PushPayload | null {
  const urgent = [...today.overdue, ...today.due_today];
  const tasks = urgentTasks(today);
  if (!urgent.length && !tasks.length) return null;
  const parts = [
    today.overdue.length ? `${today.overdue.length} em atraso` : null,
    today.due_today.length ? `${today.due_today.length} para hoje` : null,
    tasks.length ? `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  const names = [...new Set([...urgent.map((l) => l.company_name), ...tasks.map((t) => t.lead.company_name)])];
  const single =
    urgent.length === 1 && !tasks.length ? urgent[0]! : !urgent.length && new Set(tasks.map((t) => t.lead.id)).size === 1 ? tasks[0]!.lead : null;
  const title = !urgent.length
    ? tasks.length === 1
      ? '1 tarefa para hoje'
      : `${tasks.length} tarefas para hoje`
    : urgent.length === 1
      ? '1 follow-up à tua espera'
      : `${urgent.length} follow-ups à tua espera`;
  return {
    title,
    body: `${parts.join(' · ')} — ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`,
    url: single ? leadPath(single) : '/dashboard',
    tag: 'daily-follow-ups',
  };
}

export interface DailyPushResult {
  workspace_id: string;
  devices: number;
  status: 'sent' | 'skipped' | 'dry_run';
  sent?: number;
  removed?: number;
  failed?: number;
}

/** Aviso diário (cron) para todos os dispositivos subscritos. */
export async function sendDailyPushes(options: { dryRun?: boolean } = {}): Promise<DailyPushResult[]> {
  if (!isPushConfigured()) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('push_subscriptions').select('id, workspace_id, endpoint, p256dh, auth');
  if (error) throw new Error(error.message);
  const byWorkspace = new Map<string, StoredSubscription[]>();
  for (const row of (data ?? []) as (StoredSubscription & { workspace_id: string })[]) {
    byWorkspace.set(row.workspace_id, [...(byWorkspace.get(row.workspace_id) ?? []), row]);
  }
  const results: DailyPushResult[] = [];
  for (const [workspaceId, subs] of byWorkspace) {
    const payload = buildDailyPush(await fetchToday(admin, workspaceId));
    if (!payload) {
      results.push({ workspace_id: workspaceId, devices: subs.length, status: 'skipped' });
    } else if (options.dryRun) {
      results.push({ workspace_id: workspaceId, devices: subs.length, status: 'dry_run' });
    } else {
      results.push({ workspace_id: workspaceId, devices: subs.length, status: 'sent', ...(await deliver(subs, payload)) });
    }
  }
  return results;
}

// -----------------------------------------------------------------------------
// Lembretes das tarefas (cron /api/v1/cron/reminders, de 5 em 5 minutos)
// -----------------------------------------------------------------------------
export interface ReminderResult {
  task_id: string;
  workspace_id: string;
  devices: number;
  status: 'sent' | 'no_devices' | 'expired' | 'dry_run';
}

/** Lembretes mais antigos do que isto (ex.: o cron esteve parado) já não são enviados, só marcados. */
const REMINDER_MAX_DELAY_MS = 12 * 60 * 60 * 1000;

export function buildReminderPush(task: {
  id: string;
  title: string;
  lead: { number: number; company_name: string } | null;
}): PushPayload {
  return {
    title: `⏰ ${task.title}`,
    body: task.lead ? `Lembrete · #${task.lead.number} ${task.lead.company_name}` : 'Lembrete de tarefa',
    url: task.lead ? `${leadPath(task.lead)}#tarefas` : '/dashboard',
    tag: `task-${task.id}`,
  };
}

/** Envia as notificações dos lembretes que já chegaram à hora e marca-os como enviados. */
export async function sendTaskReminders(options: { dryRun?: boolean; now?: Date } = {}): Promise<ReminderResult[]> {
  const admin = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const { data, error } = await admin
    .from('lead_tasks')
    .select('id, workspace_id, title, remind_at, lead:leads(number, company_name)')
    .is('reminded_at', null)
    .is('done_at', null)
    .not('remind_at', 'is', null)
    .lte('remind_at', now.toISOString())
    .order('remind_at')
    .limit(200);
  if (error) throw new Error(error.message);
  const tasks = (data ?? []) as unknown as {
    id: string;
    workspace_id: string;
    title: string;
    remind_at: string;
    lead: { number: number; company_name: string } | null;
  }[];
  if (!tasks.length) return [];

  const configured = isPushConfigured();
  const workspaces = [...new Set(tasks.map((t) => t.workspace_id))];
  const subsByWorkspace = new Map<string, StoredSubscription[]>();
  if (configured) {
    const { data: subs, error: subsError } = await admin
      .from('push_subscriptions')
      .select('id, workspace_id, endpoint, p256dh, auth')
      .in('workspace_id', workspaces);
    if (subsError) throw new Error(subsError.message);
    for (const row of (subs ?? []) as (StoredSubscription & { workspace_id: string })[]) {
      subsByWorkspace.set(row.workspace_id, [...(subsByWorkspace.get(row.workspace_id) ?? []), row]);
    }
  }

  const results: ReminderResult[] = [];
  for (const task of tasks) {
    const subs = subsByWorkspace.get(task.workspace_id) ?? [];
    const expired = now.getTime() - new Date(task.remind_at).getTime() > REMINDER_MAX_DELAY_MS;
    const status: ReminderResult['status'] = options.dryRun ? 'dry_run' : expired ? 'expired' : subs.length ? 'sent' : 'no_devices';
    if (status === 'sent') await deliver(subs, buildReminderPush(task));
    // Marca sempre (menos no teste): sem dispositivos, o aviso aparece na plataforma ("Hoje").
    if (!options.dryRun) {
      await admin.from('lead_tasks').update({ reminded_at: now.toISOString() }).eq('id', task.id);
    }
    results.push({ task_id: task.id, workspace_id: task.workspace_id, devices: subs.length, status });
  }
  return results;
}
