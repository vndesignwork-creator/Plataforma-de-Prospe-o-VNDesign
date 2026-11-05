/**
 * Tarefas por lead (lista com caixas e ordem) e listas-modelo por serviço.
 * Concluir uma tarefa regista "Tarefa concluída" na linha do tempo (trigger).
 */
import {
  addDays,
  entrySeconds,
  todayIso,
  type Lead,
  type LeadTask,
  type LeadTaskCreate,
  type LeadTaskUpdate,
  type TaskListItem,
  type TaskListQuery,
  type TaskSearchQuery,
  type TaskSearchResult,
  type TaskTemplate,
  type TaskTemplateCreate,
  type TaskTemplateUpdate,
  type TodayTask,
  type TodayTasks,
} from '@vndesign/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest, unwrap } from '../http';
import { createActivity } from './activities';
import { getLead, likeEscape } from './leads';
import { notifyTaskAssigned } from './team-work';

const BASE_SELECT = 'id, lead_id, title, due_on, done_at, remind_at, reminded_at, position, assigned_to, created_at, updated_at';
const CHECKLIST_SELECT = `${BASE_SELECT}, checklist`;
/** A coluna dos passos (migração 20261108002300) existe? Fica sabido; sem ela, volta a ver passados 5 min. */
let checklistColumn: { ok: boolean; at: number } | null = null;
async function taskSelect(client: SupabaseClient): Promise<string> {
  if (checklistColumn && (checklistColumn.ok || Date.now() - checklistColumn.at < 5 * 60_000)) return checklistColumn.ok ? CHECKLIST_SELECT : BASE_SELECT;
  const { error } = await client.from('lead_tasks').select('checklist').limit(1);
  checklistColumn = { ok: !error, at: Date.now() };
  return checklistColumn.ok ? CHECKLIST_SELECT : BASE_SELECT;
}
const TEMPLATE_SELECT = 'id, name, service, items, sort_order';
const TASK_NOT_FOUND = 'Tarefa não encontrada';

export async function listTasks(ctx: ApiContext, leadId: string): Promise<LeadTask[]> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('lead_tasks')
    .select(await taskSelect(ctx.supabase))
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('position')
    .order('created_at');
  if (error) throw fromPostgrest(error);
  // Tempo registado em cada tarefa (Pomodoro ou registos à mão com a tarefa).
  const { data: time } = await ctx.supabase
    .from('project_time_entries')
    .select('task_id, started_at, ended_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .not('task_id', 'is', null)
    .not('ended_at', 'is', null);
  const seconds = new Map<string, number>();
  for (const e of (time ?? []) as { task_id: string; started_at: string; ended_at: string }[]) {
    seconds.set(e.task_id, (seconds.get(e.task_id) ?? 0) + entrySeconds(e));
  }
  return ((data ?? []) as unknown as LeadTask[]).map((t) => (seconds.get(t.id) ? { ...t, time_seconds: seconds.get(t.id) } : t));
}

/** Pesquisa rápida: tarefas de todos os leads (as por fazer primeiro; sem arquivados nem anonimizados). */
export async function searchTasks(ctx: ApiContext, query: TaskSearchQuery): Promise<TaskSearchResult[]> {
  const { data, error } = await ctx.supabase
    .from('lead_tasks')
    .select(`${await taskSelect(ctx.supabase)}, lead:leads!inner(id, number, company_name, project_title, archived_at, anonymized_at)`)
    .eq('workspace_id', ctx.workspaceId)
    .ilike('title', `%${likeEscape(query.q)}%`)
    .is('lead.archived_at', null)
    .is('lead.anonymized_at', null)
    .order('done_at', { ascending: false, nullsFirst: true })
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(query.limit);
  if (error) throw fromPostgrest(error);
  type Row = LeadTask & { lead: TaskSearchResult['lead'] };
  return ((data ?? []) as unknown as Row[]).map(({ lead, ...task }) => ({
    ...task,
    lead: { id: lead.id, number: lead.number, company_name: lead.company_name, project_title: lead.project_title },
  }));
}

/** Posição a seguir à última tarefa do lead (listas prontas: entram no fim, pela ordem). */
async function nextPosition(ctx: ApiContext, leadId: string): Promise<number> {
  const { data, error } = await ctx.supabase
    .from('lead_tasks')
    .select('position')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('position', { ascending: false })
    .limit(1);
  if (error) throw fromPostgrest(error);
  return ((data?.[0]?.position as number | undefined) ?? 0) + 1;
}

/** Posição antes da primeira tarefa do lead (ou das tarefas soltas): uma tarefa nova fica em cima da lista. */
async function firstPosition(ctx: ApiContext, leadId: string | null): Promise<number> {
  let q = ctx.supabase.from('lead_tasks').select('position').eq('workspace_id', ctx.workspaceId);
  q = leadId ? q.eq('lead_id', leadId) : q.is('lead_id', null);
  const { data, error } = await q
    .order('position', { ascending: true })
    .limit(1);
  if (error) throw fromPostgrest(error);
  return ((data?.[0]?.position as number | undefined) ?? 1) - 1;
}

export async function createTask(ctx: ApiContext, leadId: string | null, input: LeadTaskCreate): Promise<LeadTask> {
  // Sem lead: uma tarefa solta (página Tarefas).
  if (leadId) await getLead(ctx, leadId);
  const result = await ctx.supabase
    .from('lead_tasks')
    .insert({
      ...input,
      // Um lembrete sem prazo põe a tarefa nesse dia (aparece em "Hoje").
      due_on: input.due_on ?? (input.remind_at ? todayIso(new Date(input.remind_at)) : null),
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      // As novas ficam em cima (as listas prontas entram no fim, pela ordem da lista).
      position: await firstPosition(ctx, leadId),
    })
    .select(await taskSelect(ctx.supabase))
    .single();
  // Tarefa solta antes da migração 20261108002200 (lead_id ainda obrigatório na base de dados).
  if (!leadId && result.error?.code === '23502') {
    throw new ApiError(
      503,
      'Tarefas sem lead ainda não estão ativas',
      'A base de dados ainda não foi atualizada para aceitar tarefas sem lead. Escolhe um lead ou projeto, ou atualiza a base de dados (npx supabase db push).',
    );
  }
  const task = unwrap(result) as unknown as LeadTask;
  if (task.assigned_to) await notifyTaskAssigned(ctx, task);
  return task;
}

export async function updateTask(ctx: ApiContext, id: string, patch: LeadTaskUpdate): Promise<LeadTask> {
  const { done, ...rest } = patch;
  const update: Record<string, unknown> = { ...rest };
  // Para avisar só quando o responsável muda.
  const before =
    rest.assigned_to !== undefined
      ? ((await ctx.supabase.from('lead_tasks').select('assigned_to').eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle()).data as {
          assigned_to: string | null;
        } | null)
      : null;
  if (done !== undefined || (rest.remind_at && rest.due_on === undefined)) {
    const current = unwrap(
      await ctx.supabase.from('lead_tasks').select('done_at, due_on').eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle(),
      TASK_NOT_FOUND,
    ) as { done_at: string | null; due_on: string | null };
    // Só muda a data quando o estado muda (voltar a marcar não regista outra vez).
    if (done && !current.done_at) update.done_at = new Date().toISOString();
    if (done === false) update.done_at = null;
    // Lembrete numa tarefa sem prazo: o prazo passa a ser o dia do lembrete.
    if (rest.remind_at && rest.due_on === undefined && !current.due_on) update.due_on = todayIso(new Date(rest.remind_at));
  }
  if (!Object.keys(update).length) {
    return unwrap(
      await ctx.supabase.from('lead_tasks').select(await taskSelect(ctx.supabase)).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle(),
      TASK_NOT_FOUND,
    ) as LeadTask;
  }
  const result = await ctx.supabase
    .from('lead_tasks')
    .update(update)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(await taskSelect(ctx.supabase))
    .maybeSingle();
  const task = unwrap(result, TASK_NOT_FOUND) as unknown as LeadTask;
  if (before && task.assigned_to && task.assigned_to !== before.assigned_to) await notifyTaskAssigned(ctx, task);
  return task;
}

/**
 * Página Tarefas: as por fazer (pelo prazo) ou as concluídas nos últimos 30 dias (as mais
 * recentes primeiro), dos leads e projetos (sem arquivados nem anonimizados) e as soltas.
 */
export async function listOpenTasks(ctx: ApiContext, query: TaskListQuery): Promise<TaskListItem[]> {
  const done = query.state === 'done';
  const TASK_SELECT = await taskSelect(ctx.supabase);
  const base = (select: string) => {
    let q = ctx.supabase.from('lead_tasks').select(select).eq('workspace_id', ctx.workspaceId);
    q = done ? q.not('done_at', 'is', null).gte('done_at', new Date(Date.now() - 30 * 86_400_000).toISOString()) : q.is('done_at', null);
    // Como nos leads: sem responsável é do dono, por isso entram nas "minhas" dele.
    if (query.assigned === 'me') q = ctx.role === 'owner' ? q.or(`assigned_to.eq.${ctx.user.id},assigned_to.is.null`) : q.eq('assigned_to', ctx.user.id);
    else if (query.assigned === 'none') q = q.is('assigned_to', null);
    else if (query.assigned !== 'all') q = q.eq('assigned_to', query.assigned);
    return done
      ? q.order('done_at', { ascending: false }).limit(query.limit)
      : q
          .order('due_on', { ascending: true, nullsFirst: false })
          // No mesmo dia (e nas sem prazo), as mais recentes primeiro.
          .order('created_at', { ascending: false })
          .limit(query.limit);
  };
  const [withLead, personal] = await Promise.all([
    base(`${TASK_SELECT}, lead:leads!inner(id, number, company_name, project_title, status, archived_at, anonymized_at)`)
      .is('lead.archived_at', null)
      .is('lead.anonymized_at', null),
    // Tarefas soltas: o prospetor só vê as que são dele.
    (ctx.role === 'prospector' ? base(TASK_SELECT).eq('assigned_to', ctx.user.id) : base(TASK_SELECT)).is('lead_id', null),
  ]);
  if (withLead.error) throw fromPostgrest(withLead.error);
  // Antes da migração 20261108002200 não há tarefas soltas (a consulta pode só não devolver nada).
  if (personal.error) console.warn('[tarefas] tarefas soltas', personal.error.message);
  type Row = LeadTask & { lead: NonNullable<TaskListItem['lead']> & { archived_at: unknown; anonymized_at: unknown } };
  const items: TaskListItem[] = [
    ...((withLead.data ?? []) as unknown as Row[]).map(({ lead, ...task }) => ({
      ...task,
      lead: { id: lead.id, number: lead.number, company_name: lead.company_name, project_title: lead.project_title, status: lead.status },
    })),
    ...((personal.error ? [] : (personal.data ?? [])) as unknown as LeadTask[]).map((task) => ({ ...task, lead: null })),
  ];
  const order = done
    ? (a: TaskListItem, b: TaskListItem) => (b.done_at ?? '').localeCompare(a.done_at ?? '')
    : (a: TaskListItem, b: TaskListItem) => (a.due_on ?? '9999-12-31').localeCompare(b.due_on ?? '9999-12-31') || b.created_at.localeCompare(a.created_at);
  return items.sort(order).slice(0, query.limit);
}

export async function deleteTask(ctx: ApiContext, id: string): Promise<void> {
  const { error, count } = await ctx.supabase
    .from('lead_tasks')
    .delete({ count: 'exact' })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id);
  if (error) throw fromPostgrest(error);
  if (!count) throw new ApiError(404, TASK_NOT_FOUND);
}

/** Nova ordem das tarefas do lead (as que não vierem na lista mantêm a posição). */
export async function reorderTasks(ctx: ApiContext, leadId: string, ids: string[]): Promise<LeadTask[]> {
  const tasks = await listTasks(ctx, leadId);
  const known = new Set(tasks.map((t) => t.id));
  const unknown = ids.find((id) => !known.has(id));
  if (unknown) throw new ApiError(400, 'Pedido inválido', 'Há tarefas que não pertencem a este lead.');
  const results = await Promise.all(
    ids.map((id, i) =>
      ctx.supabase.from('lead_tasks').update({ position: i + 1 }).eq('workspace_id', ctx.workspaceId).eq('id', id),
    ),
  );
  for (const r of results) if (r.error) throw fromPostgrest(r.error);
  return listTasks(ctx, leadId);
}

/** Acrescenta ao fim da lista as tarefas de uma lista-modelo (sem repetir as que já lá estão). */
export async function applyTemplate(ctx: ApiContext, leadId: string, templateId: string): Promise<LeadTask[]> {
  const template = unwrap(
    await ctx.supabase
      .from('task_templates')
      .select(TEMPLATE_SELECT)
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', templateId)
      .maybeSingle(),
    'Lista não encontrada',
  ) as TaskTemplate;
  const existing = new Set((await listTasks(ctx, leadId)).map((t) => t.title.trim().toLowerCase()));
  const titles = template.items.filter((t) => !existing.has(t.trim().toLowerCase()));
  if (titles.length) {
    const start = await nextPosition(ctx, leadId);
    const { error } = await ctx.supabase.from('lead_tasks').insert(
      titles.map((title, i) => ({ workspace_id: ctx.workspaceId, lead_id: leadId, title, position: start + i })),
    );
    if (error) throw fromPostgrest(error);
    await createActivity(ctx, leadId, { type: 'tasks_added', payload: { template: template.name, count: titles.length } });
  }
  return listTasks(ctx, leadId);
}

// -----------------------------------------------------------------------------
// Progresso (listas e Kanban)
// -----------------------------------------------------------------------------
/** Junta { total, done } das tarefas a cada lead (null se não tiver tarefas). */
export async function withTaskProgress<L extends Pick<Lead, 'id'>>(
  client: SupabaseClient,
  workspaceId: string,
  leads: L[],
): Promise<(L & { task_progress: { total: number; done: number } | null })[]> {
  if (!leads.length) return [];
  const ids = leads.map((l) => l.id);
  // Poucos leads (uma página): só os desses; muitos (Kanban): todas as tarefas do workspace.
  let q = client.from('lead_tasks').select('lead_id, done_at').eq('workspace_id', workspaceId);
  if (ids.length <= 100) q = q.in('lead_id', ids);
  const { data, error } = await q.range(0, 19_999);
  if (error) {
    // O progresso é um extra: um problema nas tarefas (ex.: migração ainda por aplicar)
    // nunca pode deixar a lista de leads ou o Kanban em branco.
    console.error('[tarefas] progresso indisponível', error);
    return leads.map((l) => ({ ...l, task_progress: null }));
  }
  const progress = new Map<string, { total: number; done: number }>();
  for (const row of (data ?? []) as { lead_id: string; done_at: string | null }[]) {
    const p = progress.get(row.lead_id) ?? { total: 0, done: 0 };
    p.total += 1;
    if (row.done_at) p.done += 1;
    progress.set(row.lead_id, p);
  }
  return leads.map((l) => ({ ...l, task_progress: progress.get(l.id) ?? null }));
}

// -----------------------------------------------------------------------------
// "Hoje": tarefas por fazer com prazo
// -----------------------------------------------------------------------------
export async function fetchTodayTasks(client: SupabaseClient, workspaceId: string, today = todayIso()): Promise<TodayTasks> {
  const TASK_SELECT = await taskSelect(client);
  const { data, error } = await client
    .from('lead_tasks')
    .select(`${TASK_SELECT}, lead:leads!inner(id, number, company_name, status, archived_at, anonymized_at)`)
    .eq('workspace_id', workspaceId)
    .is('done_at', null)
    .not('due_on', 'is', null)
    .lte('due_on', addDays(today, 7))
    .is('lead.archived_at', null)
    .is('lead.anonymized_at', null)
    .order('due_on')
    .order('position')
    .limit(500);
  if (error) {
    // Tal como o progresso: sem tarefas, "Hoje", o resumo e o aviso continuam a funcionar.
    console.error('[tarefas] "Hoje" sem tarefas', error);
    return { overdue: [], due_today: [], upcoming: [] };
  }
  // Tarefas soltas (sem lead) com prazo também entram em "Hoje".
  const personal = await client
    .from('lead_tasks')
    .select(TASK_SELECT)
    .eq('workspace_id', workspaceId)
    .is('lead_id', null)
    .is('done_at', null)
    .not('due_on', 'is', null)
    .lte('due_on', addDays(today, 7))
    .order('due_on')
    .order('position')
    .limit(200);
  type LeadRow = LeadTask & { lead: NonNullable<TodayTask['lead']> & Record<string, unknown> };
  const tasks: TodayTask[] = [
    ...((data ?? []) as unknown as LeadRow[]).map(({ lead, ...t }) => ({
      ...t,
      lead: { id: lead.id, number: lead.number, company_name: lead.company_name, status: lead.status },
    })),
    ...((personal.error ? [] : (personal.data ?? [])) as unknown as LeadTask[]).map((t) => ({ ...t, lead: null })),
  ].sort((a, b) => a.due_on!.localeCompare(b.due_on!) || a.position - b.position);
  return {
    overdue: tasks.filter((t) => t.due_on! < today),
    due_today: tasks.filter((t) => t.due_on === today),
    upcoming: tasks.filter((t) => t.due_on! > today),
  };
}

// -----------------------------------------------------------------------------
// Listas-modelo
// -----------------------------------------------------------------------------
export async function listTemplates(ctx: ApiContext): Promise<TaskTemplate[]> {
  const { data, error } = await ctx.supabase
    .from('task_templates')
    .select(TEMPLATE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .order('sort_order')
    .order('name');
  if (error) throw fromPostgrest(error);
  return (data ?? []) as TaskTemplate[];
}

export async function createTemplate(ctx: ApiContext, input: TaskTemplateCreate): Promise<TaskTemplate> {
  const sortOrder = input.sort_order ?? (await listTemplates(ctx)).length + 1;
  const result = await ctx.supabase
    .from('task_templates')
    .insert({ ...input, sort_order: sortOrder, workspace_id: ctx.workspaceId })
    .select(TEMPLATE_SELECT)
    .single();
  return unwrap(result) as TaskTemplate;
}

export async function updateTemplate(ctx: ApiContext, id: string, patch: TaskTemplateUpdate): Promise<TaskTemplate> {
  const result = await ctx.supabase
    .from('task_templates')
    .update(patch)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(TEMPLATE_SELECT)
    .maybeSingle();
  return unwrap(result, 'Lista não encontrada') as TaskTemplate;
}

export async function deleteTemplate(ctx: ApiContext, id: string): Promise<void> {
  const { error, count } = await ctx.supabase
    .from('task_templates')
    .delete({ count: 'exact' })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id);
  if (error) throw fromPostgrest(error);
  if (!count) throw new ApiError(404, 'Lista não encontrada');
}
