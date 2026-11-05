/**
 * Tarefas por lead (lista com caixas e ordem) e listas-modelo por serviço.
 * Concluir uma tarefa regista "Tarefa concluída" na linha do tempo (trigger).
 */
import {
  addDays,
  daysBetween,
  entrySeconds,
  nextRepeatDate,
  todayIso,
  type Lead,
  type LeadTask,
  type LeadTaskCreate,
  type LeadTaskUpdate,
  type TaskList,
  type TaskListItem,
  type TaskListUpdate,
  type TaskListWithTasks,
  type TaskRepeat,
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
import { createSupabaseAdminClient } from '../supabase-admin';
import { createActivity } from './activities';
import { getLead, likeEscape } from './leads';
import { notifyTaskAssigned } from './team-work';

const TASK_FIELDS = 'id, lead_id, title, due_on, done_at, remind_at, reminded_at, position, assigned_to, created_at, updated_at';
// Listas (cartões): a coluna list_id só existe depois da migração 20261108002800.
let hasListColumn: { value: boolean; at: number } | null = null;
export async function taskListsReady(): Promise<boolean> {
  if (hasListColumn && (hasListColumn.value || Date.now() - hasListColumn.at < 60_000)) return hasListColumn.value;
  const { error } = await createSupabaseAdminClient().from('lead_tasks').select('list_id').limit(0);
  hasListColumn = { value: !error, at: Date.now() };
  return !error;
}
// Repetir, quem marcou e cartões partilhados/arquivados: depois da migração 20261108002900.
let hasExtras: { value: boolean; at: number } | null = null;
export async function taskExtrasReady(): Promise<boolean> {
  if (hasExtras && (hasExtras.value || Date.now() - hasExtras.at < 60_000)) return hasExtras.value;
  const { error } = await createSupabaseAdminClient().from('lead_tasks').select('repeat, done_by').limit(0);
  hasExtras = { value: !error, at: Date.now() };
  return !error;
}
const taskSelect = async () =>
  `${TASK_FIELDS}${(await taskListsReady()) ? ', list_id' : ''}${(await taskExtrasReady()) ? ', repeat, done_by, next_task_id, created_by' : ''}`;
const TEMPLATE_SELECT = 'id, name, service, items, sort_order';
const TASK_NOT_FOUND = 'Tarefa não encontrada';

export async function listTasks(ctx: ApiContext, leadId: string): Promise<LeadTask[]> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('lead_tasks')
    .select(await taskSelect())
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
    .select(`${await taskSelect()}, lead:leads!inner(id, number, company_name, project_title, archived_at, anonymized_at)`)
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

/** Posição antes da primeira tarefa do lead, da lista ou das soltas: uma tarefa nova fica em cima. */
async function firstPosition(ctx: ApiContext, leadId: string | null, listId: string | null = null): Promise<number> {
  let q = ctx.supabase.from('lead_tasks').select('position').eq('workspace_id', ctx.workspaceId);
  q = leadId ? q.eq('lead_id', leadId) : listId ? q.eq('list_id', listId) : q.is('lead_id', null);
  const { data, error } = await q
    .order('position', { ascending: true })
    .limit(1);
  if (error) throw fromPostgrest(error);
  return ((data?.[0]?.position as number | undefined) ?? 1) - 1;
}

export async function createTask(ctx: ApiContext, leadId: string | null, input: LeadTaskCreate & { list_id?: string | null }): Promise<LeadTask> {
  // Sem lead: uma tarefa solta (página Tarefas), sozinha ou numa lista.
  if (leadId) await getLead(ctx, leadId);
  const { list_id: requestedList, repeat, ...fields } = input;
  const listId = leadId ? null : (requestedList ?? null);
  if (repeat && !(await taskExtrasReady())) throw extrasNotReady();
  if (listId) await getTaskList(ctx, listId);
  const result = await ctx.supabase
    .from('lead_tasks')
    .insert({
      ...fields,
      ...(listId ? { list_id: listId } : {}),
      ...(repeat ? { repeat } : {}),
      // Um lembrete sem prazo põe a tarefa nesse dia (aparece em "Hoje").
      due_on: input.due_on ?? (input.remind_at ? todayIso(new Date(input.remind_at)) : null),
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      // As novas ficam em cima (as listas prontas entram no fim, pela ordem da lista).
      position: await firstPosition(ctx, leadId, listId),
    })
    .select(await taskSelect())
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
  const { done, lead_id: toLead, list_id: toList, ...rest } = patch;
  const extras = await taskExtrasReady();
  if (rest.repeat !== undefined && !extras) {
    if (rest.repeat) throw extrasNotReady();
    delete rest.repeat;
  }
  const update: Record<string, unknown> = { ...rest };
  // Mover para outro cartão (lead/projeto, lista ou soltas): fica em cima no destino.
  if (toLead !== undefined || toList !== undefined) {
    if (toLead) {
      await getLead(ctx, toLead);
      update.lead_id = toLead;
      if (await taskListsReady()) update.list_id = null;
    } else {
      if (toList) await getTaskList(ctx, toList);
      update.lead_id = null;
      if (toList !== undefined || (await taskListsReady())) update.list_id = toList ?? null;
    }
    update.position = await firstPosition(ctx, toLead ?? null, toLead ? null : (toList ?? null));
  }
  // Para avisar só quando o responsável muda.
  const before =
    rest.assigned_to !== undefined
      ? ((await ctx.supabase.from('lead_tasks').select('assigned_to').eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle()).data as {
          assigned_to: string | null;
        } | null)
      : null;
  let spawnFrom: RepeatSource | null = null;
  let undoNext: string | null = null;
  if (done !== undefined || (rest.remind_at && rest.due_on === undefined)) {
    const current = unwrap(
      await ctx.supabase
        .from('lead_tasks')
        .select(extras ? REPEAT_SOURCE_FIELDS : 'done_at, due_on')
        .eq('workspace_id', ctx.workspaceId)
        .eq('id', id)
        .maybeSingle(),
      TASK_NOT_FOUND,
    ) as unknown as RepeatSource;
    // Só muda a data quando o estado muda (voltar a marcar não regista outra vez).
    if (done && !current.done_at) {
      update.done_at = new Date().toISOString();
      if (extras) update.done_by = ctx.user.id;
      // Repetir: ao concluir cria-se a seguinte (uma só vez).
      if (extras && current.repeat && !current.next_task_id) spawnFrom = { ...current, ...rest } as RepeatSource;
    }
    if (done === false) {
      update.done_at = null;
      if (extras) update.done_by = null;
      // "Anular" logo a seguir: a seguinte (ainda por fazer) sai.
      if (extras && current.done_at && current.next_task_id) undoNext = current.next_task_id;
    }
    // Lembrete numa tarefa sem prazo: o prazo passa a ser o dia do lembrete.
    if (rest.remind_at && rest.due_on === undefined && !current.due_on) update.due_on = todayIso(new Date(rest.remind_at));
  }
  if (!Object.keys(update).length) {
    return unwrap(
      await ctx.supabase.from('lead_tasks').select(await taskSelect()).eq('workspace_id', ctx.workspaceId).eq('id', id).maybeSingle(),
      TASK_NOT_FOUND,
    ) as LeadTask;
  }
  const result = await ctx.supabase
    .from('lead_tasks')
    .update(update)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(await taskSelect())
    .maybeSingle();
  let task = unwrap(result, TASK_NOT_FOUND) as unknown as LeadTask;
  if (before && task.assigned_to && task.assigned_to !== before.assigned_to) await notifyTaskAssigned(ctx, task);
  if (spawnFrom) task = await spawnRepeat(ctx, task, spawnFrom);
  if (undoNext) {
    const { data: removed } = await ctx.supabase
      .from('lead_tasks')
      .delete()
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', undoNext)
      .is('done_at', null)
      .select('id');
    if (removed?.length) {
      await ctx.supabase.from('lead_tasks').update({ next_task_id: null }).eq('workspace_id', ctx.workspaceId).eq('id', task.id);
      task = { ...task, next_task_id: null } as LeadTask;
    }
  }
  return task;
}

const extrasNotReady = () =>
  new ApiError(503, 'Ainda não disponível', 'A base de dados ainda não foi atualizada para as tarefas que se repetem (npx supabase db push).');

const REPEAT_SOURCE_FIELDS = 'done_at, due_on, repeat, next_task_id, lead_id, list_id, title, assigned_to, remind_at, position';
type RepeatSource = {
  done_at: string | null;
  due_on: string | null;
  repeat?: TaskRepeat | null;
  next_task_id?: string | null;
  lead_id?: string | null;
  list_id?: string | null;
  title?: string;
  assigned_to?: string | null;
  remind_at?: string | null;
  position?: number;
};

/** Cria a próxima vez de uma tarefa que se repete (no lugar dela, com a data seguinte). */
async function spawnRepeat(ctx: ApiContext, task: LeadTask, source: RepeatSource): Promise<LeadTask> {
  const today = todayIso();
  const due = nextRepeatDate(source.due_on ?? null, source.repeat!, today);
  // O lembrete anda os mesmos dias (mantém a hora).
  const shift = daysBetween(source.due_on ?? today, due);
  const remindAt = source.remind_at ? new Date(new Date(source.remind_at).getTime() + shift * 86_400_000).toISOString() : null;
  const { data, error } = await ctx.supabase
    .from('lead_tasks')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: task.lead_id,
      list_id: task.list_id ?? null,
      title: task.title,
      due_on: due,
      remind_at: remindAt,
      assigned_to: task.assigned_to ?? null,
      repeat: source.repeat,
      position: task.position,
    })
    .select('id')
    .single();
  if (error) {
    // A tarefa fica concluída na mesma; só a seguinte não foi criada.
    console.warn('[tarefas] repetir', error.message);
    return task;
  }
  await ctx.supabase.from('lead_tasks').update({ next_task_id: data.id }).eq('workspace_id', ctx.workspaceId).eq('id', task.id);
  return { ...task, next_task_id: data.id } as LeadTask;
}

/**
 * Página Tarefas: as por fazer (pelo prazo) ou as concluídas nos últimos 30 dias (as mais
 * recentes primeiro), dos leads e projetos (sem arquivados nem anonimizados) e as soltas.
 */
export async function listOpenTasks(ctx: ApiContext, query: TaskListQuery): Promise<TaskListItem[]> {
  const done = query.state === 'done';
  const TASK_SELECT = await taskSelect();
  const base = (select: string, byPerson = true) => {
    let q = ctx.supabase.from('lead_tasks').select(select).eq('workspace_id', ctx.workspaceId);
    q = done ? q.not('done_at', 'is', null).gte('done_at', new Date(Date.now() - 30 * 86_400_000).toISOString()) : q.is('done_at', null);
    // Como nos leads: sem responsável é do dono, por isso entram nas "minhas" dele.
    if (!byPerson) {
      // (as tarefas das listas vêm todas)
    } else if (query.assigned === 'me') q = ctx.role === 'owner' ? q.or(`assigned_to.eq.${ctx.user.id},assigned_to.is.null`) : q.eq('assigned_to', ctx.user.id);
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
  // Listas (cartões): só as que a pessoa vê (as dela e as partilhadas), sem as arquivadas.
  const withLists = (await taskListsReady()) && (await taskExtrasReady());
  const visibleLists = withLists ? (await listTaskLists(ctx)).map((l) => l.id) : [];
  const loose = () => {
    // Tarefas soltas: o prospetor só vê as que são dele.
    const q = (ctx.role === 'prospector' ? base(TASK_SELECT).eq('assigned_to', ctx.user.id) : base(TASK_SELECT)).is('lead_id', null);
    return withLists ? q.is('list_id', null) : q;
  };
  const [withLead, personal, inLists] = await Promise.all([
    base(`${TASK_SELECT}, lead:leads!inner(id, number, company_name, project_title, status, archived_at, anonymized_at)`)
      .is('lead.archived_at', null)
      .is('lead.anonymized_at', null),
    loose(),
    withLists && visibleLists.length
      ? base(TASK_SELECT, query.lists !== 'all' && ctx.role !== 'prospector').in('list_id', visibleLists)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (withLead.error) throw fromPostgrest(withLead.error);
  // Antes da migração 20261108002200 não há tarefas soltas (a consulta pode só não devolver nada).
  if (personal.error) console.warn('[tarefas] tarefas soltas', personal.error.message);
  if (inLists.error) console.warn('[tarefas] tarefas das listas', inLists.error.message);
  type Row = LeadTask & { lead: NonNullable<TaskListItem['lead']> & { archived_at: unknown; anonymized_at: unknown } };
  const items: TaskListItem[] = [
    ...((withLead.data ?? []) as unknown as Row[]).map(({ lead, ...task }) => ({
      ...task,
      lead: { id: lead.id, number: lead.number, company_name: lead.company_name, project_title: lead.project_title, status: lead.status },
    })),
    ...((personal.error ? [] : (personal.data ?? [])) as unknown as LeadTask[]).map((task) => ({ ...task, lead: null })),
    ...((inLists.error ? [] : (inLists.data ?? [])) as unknown as LeadTask[]).map((task) => ({ ...task, lead: null })),
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

/** Nova ordem de tarefas do mesmo cartão (lead, lista ou soltas), de qualquer página. */
export async function reorderAnyTasks(ctx: ApiContext, ids: string[]): Promise<void> {
  const { data, error } = await ctx.supabase.from('lead_tasks').select(`id, lead_id${(await taskListsReady()) ? ', list_id' : ''}`).eq('workspace_id', ctx.workspaceId).in('id', ids);
  if (error) throw fromPostgrest(error);
  const rows = (data ?? []) as unknown as { id: string; lead_id: string | null; list_id?: string | null }[];
  if (rows.length !== ids.length) throw new ApiError(404, TASK_NOT_FOUND);
  const containers = new Set(rows.map((r) => `${r.lead_id ?? ''}|${r.list_id ?? ''}`));
  if (containers.size > 1) throw new ApiError(400, 'Pedido inválido', 'As tarefas têm de ser do mesmo cartão.');
  const results = await Promise.all(ids.map((id, i) => ctx.supabase.from('lead_tasks').update({ position: i + 1 }).eq('workspace_id', ctx.workspaceId).eq('id', id)));
  for (const r of results) if (r.error) throw fromPostgrest(r.error);
}

// -----------------------------------------------------------------------------
// Listas (cartões com título, página Tarefas)
// -----------------------------------------------------------------------------
const LIST_BASE = 'id, title, position, created_at, updated_at';
const listSelect = async () => ((await taskExtrasReady()) ? `${LIST_BASE}, shared, archived_at, created_by` : LIST_BASE);
const LIST_NOT_FOUND = 'Lista não encontrada';
const missingLists = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205';
const listsNotReady = () => new ApiError(503, 'Listas ainda não disponíveis', 'A base de dados ainda não foi atualizada (npx supabase db push).');

/**
 * As listas que a pessoa vê: as dela, as partilhadas e as antigas (sem autor).
 * (Síncrona: uma consulta devolvida por uma função async era logo executada.)
 */
function visibleListsQuery(ctx: ApiContext, extras: boolean) {
  const q = ctx.supabase.from('task_lists').select(extras ? `${LIST_BASE}, shared, archived_at, created_by` : LIST_BASE).eq('workspace_id', ctx.workspaceId);
  if (extras) return q.or(`created_by.eq.${ctx.user.id},shared.is.true,created_by.is.null`);
  // Antes da migração: o prospetor vê só as listas dele.
  return ctx.role === 'prospector' ? q.eq('created_by', ctx.user.id) : q;
}

export async function listTaskLists(ctx: ApiContext): Promise<TaskList[]> {
  const extras = await taskExtrasReady();
  let q = visibleListsQuery(ctx, extras);
  if (extras) q = q.is('archived_at', null);
  const { data, error } = await q.order('position').order('created_at');
  if (missingLists(error)) return [];
  if (error) throw fromPostgrest(error);
  return (data ?? []) as unknown as TaskList[];
}

/** As listas arquivadas (com as tarefas delas), as mais recentes primeiro. */
export async function listArchivedTaskLists(ctx: ApiContext): Promise<TaskListWithTasks[]> {
  if (!(await taskExtrasReady())) return [];
  const { data, error } = await visibleListsQuery(ctx, true).not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(100);
  if (missingLists(error)) return [];
  if (error) throw fromPostgrest(error);
  const lists = (data ?? []) as unknown as TaskList[];
  if (!lists.length) return [];
  const tasks = await ctx.supabase
    .from('lead_tasks')
    .select(await taskSelect())
    .eq('workspace_id', ctx.workspaceId)
    .in(
      'list_id',
      lists.map((l) => l.id),
    )
    .order('position');
  if (tasks.error) throw fromPostgrest(tasks.error);
  const byList = new Map<string, LeadTask[]>();
  for (const t of (tasks.data ?? []) as unknown as LeadTask[]) byList.set(t.list_id!, [...(byList.get(t.list_id!) ?? []), t]);
  return lists.map((l) => ({ ...l, tasks: byList.get(l.id) ?? [] }));
}

async function getTaskList(ctx: ApiContext, id: string): Promise<TaskList> {
  const result = await visibleListsQuery(ctx, await taskExtrasReady()).eq('id', id).maybeSingle();
  if (missingLists(result.error)) throw listsNotReady();
  return unwrap(result, LIST_NOT_FOUND) as unknown as TaskList;
}

/** Nova lista (em primeiro lugar), já com as tarefas escritas, pela ordem. */
export async function createTaskList(ctx: ApiContext, input: { title: string; items: string[]; assigned_to?: string | null; shared?: boolean }): Promise<TaskList> {
  const { data: first } = await ctx.supabase.from('task_lists').select('position').eq('workspace_id', ctx.workspaceId).order('position').limit(1);
  const extras = await taskExtrasReady();
  const result = await ctx.supabase
    .from('task_lists')
    .insert({
      workspace_id: ctx.workspaceId,
      title: input.title,
      position: ((first?.[0]?.position as number | undefined) ?? 1) - 1,
      ...(extras && input.shared ? { shared: true } : {}),
    })
    .select(await listSelect())
    .single();
  if (missingLists(result.error)) throw listsNotReady();
  const list = unwrap(result) as unknown as TaskList;
  if (input.items.length) {
    // Numa lista partilhada as tarefas ficam sem responsável (são da equipa).
    const assigned = input.shared ? null : ctx.role === 'prospector' ? ctx.user.id : (input.assigned_to ?? null);
    const { error } = await ctx.supabase
      .from('lead_tasks')
      .insert(input.items.map((title, i) => ({ workspace_id: ctx.workspaceId, lead_id: null, list_id: list.id, title, position: i + 1, assigned_to: assigned })));
    if (error) throw fromPostgrest(error);
  }
  return list;
}

/** Quem pode partilhar, deixar de partilhar ou apagar: quem a criou, o dono e os administradores. */
function canManageList(ctx: ApiContext, list: TaskList): boolean {
  return ctx.role === 'owner' || ctx.role === 'admin' || !list.created_by || list.created_by === ctx.user.id;
}

export async function updateTaskList(ctx: ApiContext, id: string, patch: TaskListUpdate): Promise<TaskList> {
  const { archived, shared, ...rest } = patch;
  const update: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const list = await getTaskList(ctx, id);
  if (archived !== undefined || shared !== undefined) {
    if (!(await taskExtrasReady())) throw listsNotReady();
    if (archived !== undefined) update.archived_at = archived ? new Date().toISOString() : null;
    if (shared !== undefined) {
      if (!canManageList(ctx, list)) throw new ApiError(403, 'Sem permissão', 'Só quem criou a lista (ou o dono) a pode partilhar ou deixar de partilhar.');
      update.shared = shared;
    }
  }
  if (!Object.keys(update).length) return list;
  return unwrap(
    await ctx.supabase.from('task_lists').update(update).eq('workspace_id', ctx.workspaceId).eq('id', id).select(await listSelect()).maybeSingle(),
    LIST_NOT_FOUND,
  ) as unknown as TaskList;
}

/** Apaga a lista e as tarefas dela. */
export async function deleteTaskList(ctx: ApiContext, id: string): Promise<void> {
  const list = await getTaskList(ctx, id);
  if (!canManageList(ctx, list)) throw new ApiError(403, 'Sem permissão', 'Só quem criou a lista (ou o dono) a pode apagar.');
  const { data, error } = await ctx.supabase.from('task_lists').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error);
  if (!data?.length) throw new ApiError(404, LIST_NOT_FOUND);
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
  const TASK_SELECT = await taskSelect();
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
  // Sem as tarefas das listas arquivadas.
  let archivedLists = new Set<string>();
  if (await taskExtrasReady()) {
    const { data: archived } = await client.from('task_lists').select('id').eq('workspace_id', workspaceId).not('archived_at', 'is', null);
    archivedLists = new Set(((archived ?? []) as { id: string }[]).map((l) => l.id));
  }
  type LeadRow = LeadTask & { lead: NonNullable<TodayTask['lead']> & Record<string, unknown> };
  const tasks: TodayTask[] = [
    ...((data ?? []) as unknown as LeadRow[]).map(({ lead, ...t }) => ({
      ...t,
      lead: { id: lead.id, number: lead.number, company_name: lead.company_name, status: lead.status },
    })),
    ...((personal.error ? [] : (personal.data ?? [])) as unknown as LeadTask[])
      .filter((t) => !t.list_id || !archivedLists.has(t.list_id))
      .map((t) => ({ ...t, lead: null })),
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
