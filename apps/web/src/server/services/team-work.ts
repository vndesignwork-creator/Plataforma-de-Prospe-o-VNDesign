/**
 * Trabalho em equipa: comentários com @menções, avisos e as notificações push
 * que os acompanham. Os avisos (tabela notifications) são criados por triggers
 * na base de dados; aqui só se leem, se marcam como lidos e se manda o push.
 */
import {
  leadPath,
  notificationTitle,
  type Activity,
  type CommentCreate,
  type LeadTask,
  type Notification,
  type NotificationList,
  type NotificationRead,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest, unwrap } from '../http';
import { getLead } from './leads';
import { sendUserPush } from './push';
import { teamNames } from './team';

const NOTIFICATION_SELECT = 'id, kind, lead_id, task_id, activity_id, actor_user_id, text, read_at, created_at, lead:leads(id, number, company_name)';

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
