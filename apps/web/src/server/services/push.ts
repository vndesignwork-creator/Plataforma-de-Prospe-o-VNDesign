/**
 * Subscrições de notificações push (uma por browser/dispositivo) e o aviso
 * diário de follow-ups enviado pelo cron. Quem tem horário de silêncio não
 * recebe push nesse período (os lembretes das tarefas esperam pelo fim).
 */
import {
  ALERTS_PREFERENCE,
  isQuietTime,
  leadPath,
  parseAlertsPreference,
  parseQuietHours,
  QUIET_HOURS_PREFERENCE,
  type AlertKind,
  type PushSubscriptionCreate,
  type Today,
} from '@vndesign/core';
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

type OwnedSubscription = StoredSubscription & { workspace_id: string; user_id: string };
const ownerKey = (s: { workspace_id: string; user_id: string }) => `${s.workspace_id}:${s.user_id}`;

/**
 * Horário de silêncio dos donos destas subscrições: quem o tem ligado
 * (`configured`) e quem está agora dentro dele (`quiet`), por "workspace:utilizador".
 * Se a leitura falhar, ninguém fica em silêncio (melhor avisar a mais do que perder um aviso).
 */
async function quietOwners(subs: { workspace_id: string; user_id: string }[], now = new Date()) {
  const quiet = new Set<string>();
  const configured = new Set<string>();
  if (!subs.length) return { quiet, configured };
  const { data, error } = await createSupabaseAdminClient()
    .from('user_preferences')
    .select('workspace_id, user_id, value')
    .eq('key', QUIET_HOURS_PREFERENCE)
    .in('user_id', [...new Set(subs.map((s) => s.user_id))]);
  if (error) {
    console.warn('[push] horário de silêncio por ler', error.message);
    return { quiet, configured };
  }
  for (const row of data ?? []) {
    const hours = parseQuietHours(row.value);
    if (!hours.enabled) continue;
    configured.add(ownerKey(row));
    if (isQuietTime(hours, now)) quiet.add(ownerKey(row));
  }
  return { quiet, configured };
}

/**
 * Notificação para todos os dispositivos de um utilizador (trabalho do servidor, ex.: cron).
 * No horário de silêncio não envia nada (o aviso fica no sino), menos com `ignoreQuiet`
 * (ex.: o pomodoro, que a própria pessoa pôs a correr).
 */
export async function sendUserPush(workspaceId: string, userId: string, payload: PushPayload, options: { ignoreQuiet?: boolean } = {}) {
  if (!isPushConfigured()) return { sent: 0, removed: 0, failed: 0 };
  const owner = { workspace_id: workspaceId, user_id: userId };
  if (!options.ignoreQuiet && (await quietOwners([owner])).quiet.has(ownerKey(owner))) {
    return { sent: 0, removed: 0, failed: 0 };
  }
  const { data, error } = await createSupabaseAdminClient()
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return data?.length ? deliver(data as StoredSubscription[], payload) : { sent: 0, removed: 0, failed: 0 };
}

export interface Alert {
  kind: AlertKind;
  title: string;
  body: string;
  /** Página da plataforma (começa por /). */
  url: string;
  tag: string;
  leadId?: string | null;
  taskId?: string | null;
}

/** Tipos de aviso que esta pessoa desligou (Definições → Notificações). */
async function alertsOff(workspaceId: string, userId: string): Promise<AlertKind[]> {
  const { data } = await createSupabaseAdminClient()
    .from('user_preferences')
    .select('value')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('key', ALERTS_PREFERENCE)
    .maybeSingle();
  return parseAlertsPreference((data as { value: unknown } | null)?.value).off;
}

/** Guarda o aviso no sino desta pessoa (sem push). Uma falha só fica no registo. */
export async function saveAlert(workspaceId: string, userId: string, alert: Alert): Promise<boolean> {
  if ((await alertsOff(workspaceId, userId)).includes(alert.kind)) return false;
  const { error } = await createSupabaseAdminClient()
    .from('notifications')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      kind: alert.kind,
      lead_id: alert.leadId ?? null,
      task_id: alert.taskId ?? null,
      title: alert.title.slice(0, 200),
      text: (alert.body.trim() || alert.title).slice(0, 300),
      url: alert.url.startsWith('/') ? alert.url.slice(0, 500) : null,
    });
  if (error) console.warn('[avisos] não foi possível guardar o aviso', error.message);
  return true;
}

/**
 * Aviso para uma pessoa: fica no sino e vai por push (se a pessoa o ligou e não
 * está no horário de silêncio). Quem desligou este tipo de aviso não recebe nenhum dos dois.
 */
export async function alertUser(workspaceId: string, userId: string, alert: Alert, options: { ignoreQuiet?: boolean } = {}) {
  if (!(await saveAlert(workspaceId, userId, alert))) return { sent: 0, removed: 0, failed: 0 };
  return sendUserPush(workspaceId, userId, { title: alert.title, body: alert.body, url: alert.url, tag: alert.tag }, options);
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
  status: 'sent' | 'skipped' | 'quiet' | 'dry_run';
  /** Dispositivos que ficaram de fora por estarem no horário de silêncio. */
  quiet?: number;
  sent?: number;
  removed?: number;
  failed?: number;
}

/** Aviso diário (cron) para todos os dispositivos subscritos. */
export async function sendDailyPushes(options: { dryRun?: boolean } = {}): Promise<DailyPushResult[]> {
  if (!isPushConfigured()) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('push_subscriptions').select('id, workspace_id, user_id, endpoint, p256dh, auth');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OwnedSubscription[];
  const { quiet } = await quietOwners(rows);
  const byWorkspace = new Map<string, OwnedSubscription[]>();
  for (const row of rows) byWorkspace.set(row.workspace_id, [...(byWorkspace.get(row.workspace_id) ?? []), row]);
  const results: DailyPushResult[] = [];
  for (const [workspaceId, all] of byWorkspace) {
    const subs = all.filter((s) => !quiet.has(ownerKey(s)));
    const silenced = all.length - subs.length;
    const payload = buildDailyPush(await fetchToday(admin, workspaceId));
    if (!payload) {
      results.push({ workspace_id: workspaceId, devices: all.length, status: 'skipped' });
    } else if (!subs.length) {
      results.push({ workspace_id: workspaceId, devices: all.length, status: 'quiet', quiet: silenced });
    } else if (options.dryRun) {
      results.push({ workspace_id: workspaceId, devices: subs.length, status: 'dry_run', quiet: silenced });
    } else {
      results.push({ workspace_id: workspaceId, devices: subs.length, status: 'sent', quiet: silenced, ...(await deliver(subs, payload)) });
    }
  }
  return results;
}

/**
 * Resumo do dia no sino (cron diário) de quem gere o workspace (dono e administradores):
 * follow-ups e tarefas em atraso ou para hoje. No máximo um por dia.
 */
export async function saveDailyAlerts(options: { dryRun?: boolean } = {}): Promise<{ workspaces: number; saved: number }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('workspace_members').select('workspace_id, user_id').in('role', ['owner', 'admin']);
  if (error) throw new Error(error.message);
  const byWorkspace = new Map<string, string[]>();
  for (const m of (data ?? []) as { workspace_id: string; user_id: string }[]) byWorkspace.set(m.workspace_id, [...(byWorkspace.get(m.workspace_id) ?? []), m.user_id]);
  const since = new Date(Date.now() - 20 * 3_600_000).toISOString();
  let saved = 0;
  for (const [workspaceId, users] of byWorkspace) {
    const payload = buildDailyPush(await fetchToday(admin, workspaceId));
    if (!payload || options.dryRun) continue;
    for (const userId of users) {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .eq('kind', 'daily')
        .gte('created_at', since);
      if (count) continue;
      if (await saveAlert(workspaceId, userId, { kind: 'daily', title: payload.title, body: payload.body, url: payload.url ?? '/dashboard', tag: payload.tag ?? 'daily' })) saved++;
    }
  }
  return { workspaces: byWorkspace.size, saved };
}

// -----------------------------------------------------------------------------
// Lembretes das tarefas (cron /api/v1/cron/reminders, de 5 em 5 minutos)
// -----------------------------------------------------------------------------
export interface ReminderResult {
  task_id: string;
  workspace_id: string;
  devices: number;
  status: 'sent' | 'no_devices' | 'quiet' | 'expired' | 'dry_run';
}

/** Lembretes mais antigos do que isto (ex.: o cron esteve parado) já não são enviados, só marcados. */
const REMINDER_MAX_DELAY_MS = 12 * 60 * 60 * 1000;
/** Com horário de silêncio (que pode ser o fim de semana inteiro), o lembrete pode esperar mais. */
const REMINDER_MAX_DELAY_QUIET_MS = 3 * 24 * 60 * 60 * 1000;

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

/** Lembrete no sino de quem tem a tarefa (ou de quem a criou), se ainda lá não estiver. */
async function saveReminderAlert(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  task: { id: string; workspace_id: string; title: string; assigned_to: string | null; created_by: string | null; lead: { id: string; number: number; company_name: string } | null },
) {
  const userId = task.assigned_to ?? task.created_by;
  if (!userId) return;
  const { count } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('task_id', task.id).eq('kind', 'reminder');
  if (count) return;
  const push = buildReminderPush(task);
  // No sino o lead já aparece por baixo: o texto é só o tipo de aviso.
  await saveAlert(task.workspace_id, userId, { kind: 'reminder', title: push.title, body: task.lead ? 'Lembrete da tarefa' : push.body, url: push.url ?? '/tarefas', tag: push.tag ?? 'reminder', leadId: task.lead?.id ?? null, taskId: task.id });
}

/** Envia as notificações dos lembretes que já chegaram à hora e marca-os como enviados. */
export async function sendTaskReminders(options: { dryRun?: boolean; now?: Date } = {}): Promise<ReminderResult[]> {
  const admin = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const { data, error } = await admin
    .from('lead_tasks')
    .select('id, workspace_id, title, remind_at, assigned_to, created_by, lead:leads(id, number, company_name)')
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
    assigned_to: string | null;
    created_by: string | null;
    lead: { id: string; number: number; company_name: string } | null;
  }[];
  if (!tasks.length) return [];

  const configured = isPushConfigured();
  const workspaces = [...new Set(tasks.map((t) => t.workspace_id))];
  const subsByWorkspace = new Map<string, OwnedSubscription[]>();
  let silence = { quiet: new Set<string>(), configured: new Set<string>() };
  if (configured) {
    const { data: subs, error: subsError } = await admin
      .from('push_subscriptions')
      .select('id, workspace_id, user_id, endpoint, p256dh, auth')
      .in('workspace_id', workspaces);
    if (subsError) throw new Error(subsError.message);
    const rows = (subs ?? []) as OwnedSubscription[];
    for (const row of rows) subsByWorkspace.set(row.workspace_id, [...(subsByWorkspace.get(row.workspace_id) ?? []), row]);
    silence = await quietOwners(rows, now);
  }

  const results: ReminderResult[] = [];
  for (const task of tasks) {
    const all = subsByWorkspace.get(task.workspace_id) ?? [];
    const subs = all.filter((s) => !silence.quiet.has(ownerKey(s)));
    const maxDelay = all.some((s) => silence.configured.has(ownerKey(s))) ? REMINDER_MAX_DELAY_QUIET_MS : REMINDER_MAX_DELAY_MS;
    const expired = now.getTime() - new Date(task.remind_at).getTime() > maxDelay;
    const status: ReminderResult['status'] = options.dryRun
      ? 'dry_run'
      : expired
        ? 'expired'
        : subs.length
          ? 'sent'
          : all.length
            ? 'quiet'
            : 'no_devices';
    if (status === 'sent') await deliver(subs, buildReminderPush(task));
    // No sino de quem tem a tarefa (uma vez, mesmo que o push espere pelo fim do silêncio).
    if (!options.dryRun && !expired) await saveReminderAlert(admin, task);
    // Todos em silêncio: fica por marcar e vai no primeiro cron depois do silêncio.
    if (status === 'quiet') {
      results.push({ task_id: task.id, workspace_id: task.workspace_id, devices: all.length, status });
      continue;
    }
    // Marca sempre (menos no teste): sem dispositivos, o aviso aparece na plataforma ("Hoje").
    if (!options.dryRun) {
      await admin.from('lead_tasks').update({ reminded_at: now.toISOString() }).eq('id', task.id);
    }
    results.push({ task_id: task.id, workspace_id: task.workspace_id, devices: subs.length, status });
  }
  return results;
}
