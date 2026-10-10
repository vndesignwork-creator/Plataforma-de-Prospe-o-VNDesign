/**
 * Subscrições de notificações push (uma por browser/dispositivo) e o aviso
 * diário de follow-ups enviado pelo cron.
 */
import type { PushSubscriptionCreate, Today } from '@vndesign/core';
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
  const single = urgent.length === 1 && !tasks.length ? urgent[0]!.id : !urgent.length && new Set(tasks.map((t) => t.lead.id)).size === 1 ? tasks[0]!.lead.id : null;
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
    url: single ? `/leads/${single}` : '/dashboard',
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
