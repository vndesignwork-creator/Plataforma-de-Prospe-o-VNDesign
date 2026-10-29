/**
 * Trabalho em equipa: comentários com @menções, avisos e as notificações push
 * que os acompanham. Os avisos (tabela notifications) são criados por triggers
 * na base de dados; aqui só se leem, se marcam como lidos e se manda o push.
 */
import {
  buildNotificationsEmail,
  leadPath,
  notificationTitle,
  plainTextToHtml,
  type Activity,
  type CommentCreate,
  type LeadTask,
  type Notification,
  type NotificationClearQuery,
  type NotificationList,
  type NotificationRead,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { getLead } from './leads';
import { isMailConfigured, sendMail } from '../mailer';
import { createSupabaseAdminClient } from '../supabase-admin';
import { sendUserPush } from './push';
import { teamNames } from './team';

const NOTIFICATION_SELECT = 'id, kind, lead_id, task_id, activity_id, actor_user_id, title, text, url, read_at, created_at, lead:leads(id, number, company_name)';

export async function listNotifications(ctx: ApiContext): Promise<NotificationList> {
  const [list, unread] = await Promise.all([
    ctx.supabase
      .from('notifications')
      .select(NOTIFICATION_SELECT)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(30),
    ctx.supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', ctx.user.id)
      .is('read_at', null),
  ]);
  if (list.error) throw fromPostgrest(list.error);
  if (unread.error) throw fromPostgrest(unread.error);
  return { data: (list.data ?? []) as unknown as Notification[], unread: unread.count ?? 0 };
}

export async function markNotificationsRead(ctx: ApiContext, input: NotificationRead): Promise<{ updated: number }> {
  let q = ctx.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() }, { count: 'exact' })
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .is('read_at', null);
  if (!input.all) q = q.in('id', input.ids ?? []);
  const { error, count } = await q;
  if (error) throw fromPostgrest(error);
  return { updated: count ?? 0 };
}

/** Apagar um aviso meu. */
export async function deleteNotification(ctx: ApiContext, id: string): Promise<void> {
  const { error, count } = await ctx.supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .eq('id', id);
  if (error) throw fromPostgrest(error);
  if (!count) throw new ApiError(404, 'Aviso não encontrado');
}

/** Limpar o sino: só os avisos lidos ou todos. */
export async function clearNotifications(ctx: ApiContext, input: NotificationClearQuery): Promise<{ deleted: number }> {
  let q = ctx.supabase.from('notifications').delete({ count: 'exact' }).eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.user.id);
  if (input.which === 'read') q = q.not('read_at', 'is', null);
  const { error, count } = await q;
  if (error) throw fromPostgrest(error);
  return { deleted: count ?? 0 };
}

/** Nome de quem fez a ação (para o texto da notificação push). */
async function actorName(ctx: ApiContext): Promise<string | null> {
  try {
    return (await teamNames(ctx)).find((m) => m.user_id === ctx.user.id)?.name ?? null;
  } catch {
    return null;
  }
}

/** Notificação push (se a pessoa a ligou); uma falha nunca estraga o pedido. */
async function push(ctx: ApiContext, userId: string, payload: { title: string; body: string; url: string; tag: string }) {
  try {
    await sendUserPush(ctx.workspaceId, userId, payload);
  } catch {
    // Sem push: o aviso fica no sino da plataforma.
  }
}

/** Deram uma tarefa a alguém (o aviso no sino foi criado pelo trigger): push para essa pessoa. */
export async function notifyTaskAssigned(ctx: ApiContext, task: LeadTask) {
  if (!task.assigned_to || task.assigned_to === ctx.user.id || task.done_at) return;
  const lead = await getLead(ctx, task.lead_id);
  await push(ctx, task.assigned_to, {
    title: notificationTitle({ kind: 'task_assigned' }, await actorName(ctx)),
    body: `${task.title} · #${lead.number} ${lead.company_name}`,
    url: `${leadPath(lead)}#tarefas`,
    tag: `task-${task.id}`,
  });
}

/** Comentário da equipa na linha do tempo; as pessoas mencionadas (só da equipa) recebem um aviso. */
export async function createComment(ctx: ApiContext, leadId: string, input: CommentCreate): Promise<Activity> {
  const lead = await getLead(ctx, leadId);
  const team = await teamNames(ctx);
  const members = new Set(team.map((m) => m.user_id));
  const mentions = [...new Set(input.mentions)].filter((id) => members.has(id) && id !== ctx.user.id);
  const result = await ctx.supabase
    .from('lead_activities')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      type: 'comment',
      body: input.body,
      payload: mentions.length ? { mentions } : {},
      actor_user_id: ctx.user.id,
    })
    .select('id, lead_id, type, body, payload, actor_user_id, actor_token_id, created_at')
    .single();
  const activity = unwrap(result) as Activity;
  const actor = team.find((m) => m.user_id === ctx.user.id)?.name ?? null;
  await Promise.all(
    mentions.map((userId) =>
      push(ctx, userId, {
        title: `${notificationTitle({ kind: 'mention' }, actor)} · #${lead.number} ${lead.company_name}`,
        body: input.body.slice(0, 180),
        url: `${leadPath(lead)}#atividade`,
        tag: `mention-${activity.id}`,
      }),
    ),
  );
  return activity;
}

/**
 * Cron diário: os avisos por ler (dos últimos 3 dias) de quem não tem as
 * notificações push ligadas seguem num email ("Tens 2 avisos…"). Cada aviso vai
 * no máximo uma vez (emailed_at); quem tem push já os recebeu no telemóvel.
 */
export async function sendNotificationEmails(options: { appUrl: string; dryRun?: boolean }) {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('notifications')
    .select('id, workspace_id, user_id, kind, text, created_at, actor_user_id, lead:leads(number, company_name)')
    .is('read_at', null)
    .is('emailed_at', null)
    // Por email só as tarefas e as menções (os outros avisos já têm o seu email ou são do dia).
    .in('kind', ['task_assigned', 'mention'])
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    workspace_id: string;
    user_id: string;
    kind: Notification['kind'];
    text: string;
    created_at: string;
    actor_user_id: string | null;
    lead: { number: number; company_name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(`${r.workspace_id}:${r.user_id}`, [...(byUser.get(`${r.workspace_id}:${r.user_id}`) ?? []), r]);
  let sent = 0;
  let skipped = 0;
  for (const [key, items] of byUser) {
    const [workspaceId, userId] = key.split(':') as [string, string];
    const done = async () => {
      if (!options.dryRun) await admin.from('notifications').update({ emailed_at: new Date().toISOString() }).in('id', items.map((i) => i.id));
    };
    const { count } = await admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('user_id', userId);
    if (count) {
      skipped++;
      await done();
      continue;
    }
    const { data: user } = await admin.auth.admin.getUserById(userId);
    const email = user.user?.email;
    if (!email || options.dryRun || !isMailConfigured()) {
      skipped++;
      continue;
    }
    const people = [userId, ...items.map((i) => i.actor_user_id).filter((v): v is string => !!v)];
    const { data: sigs } = await admin.from('signatures').select('user_id, full_name').eq('workspace_id', workspaceId).in('user_id', people);
    const nameOf = (id: string | null) => (id ? ((sigs ?? []) as { user_id: string; full_name: string | null }[]).find((s) => s.user_id === id)?.full_name ?? null : null);
    const mail = buildNotificationsEmail({
      name: nameOf(userId),
      appUrl: options.appUrl,
      items: items.map((i) => ({
        kind: i.kind,
        text: i.text,
        created_at: i.created_at,
        actor: nameOf(i.actor_user_id),
        lead: i.lead ? { ...i.lead, url: `${options.appUrl}${leadPath(i.lead)}` } : null,
      })),
    });
    try {
      await sendMail({ to: email, subject: mail.subject, text: mail.text, html: plainTextToHtml(mail.text) });
      sent++;
      await done();
    } catch {
      skipped++;
    }
  }
  return { sent, skipped };
}
