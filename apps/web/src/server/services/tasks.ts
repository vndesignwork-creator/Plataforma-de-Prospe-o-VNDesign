/**
 * Tarefas por lead (lista com caixas e ordem) e listas-modelo por serviço.
 * Concluir uma tarefa regista "Tarefa concluída" na linha do tempo (trigger).
 */
import {
  addDays,
  todayIso,
  type Lead,
  type LeadTask,
  type LeadTaskCreate,
  type LeadTaskUpdate,
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
import { getLead } from './leads';

const TASK_SELECT = 'id, lead_id, title, due_on, done_at, position, created_at, updated_at';
const TEMPLATE_SELECT = 'id, name, service, items, sort_order';
const TASK_NOT_FOUND = 'Tarefa não encontrada';

export async function listTasks(ctx: ApiContext, leadId: string): Promise<LeadTask[]> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('lead_tasks')
    .select(TASK_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('position')
    .order('created_at');
  if (error) throw fromPostgrest(error);
  return (data ?? []) as LeadTask[];
}

/** Posição a seguir à última tarefa do lead (as novas ficam no fim da lista). */
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

export async function createTask(ctx: ApiContext, leadId: string, input: LeadTaskCreate): Promise<LeadTask> {
  await getLead(ctx, leadId);
  const result = await ctx.supabase
    .from('lead_tasks')
    .insert({ ...input, workspace_id: ctx.workspaceId, lead_id: leadId, position: await nextPosition(ctx, leadId) })
    .select(TASK_SELECT)
    .single();
  return unwrap(result) as LeadTask;
}

export async function updateTask(ctx: ApiContext, id: string, patch: LeadTaskUpdate): Promise<LeadTask> {
  const { done, ...rest } = patch;
  const update: Record<string, unknown> = { ...rest };
  if (done !== undefined) {
    // Só muda a data quando o estado muda (voltar a marcar não regista outra vez).
    const current = unwrap(
      await ctx.supabase.from('lead_tasks').select('done_at').eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle(),
      TASK_NOT_FOUND,
    ) as { done_at: string | null };
    if (done && !current.done_at) update.done_at = new Date().toISOString();
    if (!done) update.done_at = null;
  }
  if (!Object.keys(update).length) {
    return unwrap(
      await ctx.supabase.from('lead_tasks').select(TASK_SELECT).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle(),
      TASK_NOT_FOUND,
    ) as LeadTask;
  }
  const result = await ctx.supabase
    .from('lead_tasks')
    .update(update)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(TASK_SELECT)
    .maybeSingle();
  return unwrap(result, TASK_NOT_FOUND) as LeadTask;
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
  const tasks = ((data ?? []) as unknown as (LeadTask & { lead: TodayTask['lead'] & Record<string, unknown> })[]).map(
    ({ lead, ...t }) => ({ ...t, lead: { id: lead.id, number: lead.number, company_name: lead.company_name, status: lead.status } }),
  );
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
