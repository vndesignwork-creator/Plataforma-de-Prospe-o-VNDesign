/**
 * Ferramentas dos projetos: prazo e fase, link para o cliente, rondas de
 * revisão, registo de horas, ficheiros/entregas, calendário e a página de
 * acompanhamento (/p/<código>, sem sessão).
 */
import { randomBytes } from 'node:crypto';
import {
  DEFAULT_PROJECT_INFO,
  PROJECT_STAGE_LABELS,
  WorkspaceSettingsSchema,
  addDays,
  entrySeconds,
  hourlyRate,
  summarizePayments,
  timeByTask,
  todayIso,
  type CalendarEvent,
  type ProjectDeliverable,
  type ProjectDeliverableCreate,
  type ProjectDeliverableUpdate,
  type ProjectInfo,
  type ProjectInfoUpdate,
  type ProjectRevision,
  type ProjectRevisionCreate,
  type ProjectStartResult,
  type ProjectTime,
  type RunningTimer,
  type SharedProject,
  type TimeEntry,
  type TimeEntryCreate,
  type TimeEntryUpdate,
  type ClientDeliverableAction,
  type ProjectExpense,
  type ProjectExpenseCreate,
  projectProfit,
} from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { createSupabaseAdminClient } from '../supabase-admin';
import { getLead } from './leads';
import { sendUserPush } from './push';

async function logActivity(ctx: ApiContext, leadId: string, type: string, body: string | null, payload: Record<string, unknown> = {}) {
  await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: leadId,
    type,
    body,
    payload,
    actor_user_id: ctx.user.id,
  });
}

// -----------------------------------------------------------------------------
// Prazo, fase e link do cliente
// -----------------------------------------------------------------------------

const INFO_SELECT = 'lead_id, due_on, stage, revisions_included, share_token';
type InfoRow = ProjectInfo & { lead_id: string };
const toInfo = (row: InfoRow | null | undefined): ProjectInfo =>
  row ? { due_on: row.due_on, stage: row.stage, revisions_included: row.revisions_included, share_token: row.share_token } : { ...DEFAULT_PROJECT_INFO };

/** Prazo, fase, revisões incluídas e link de vários projetos (sem linha = valores por omissão). */
export async function projectInfoMap(ctx: ApiContext, leadIds: string[]): Promise<Map<string, ProjectInfo>> {
  const map = new Map<string, ProjectInfo>();
  if (!leadIds.length) return map;
  const { data, error } = await ctx.supabase.from('lead_projects').select(INFO_SELECT).eq('workspace_id', ctx.workspaceId).in('lead_id', leadIds);
  if (error) throw fromPostgrest(error);
  for (const row of (data ?? []) as InfoRow[]) map.set(row.lead_id, toInfo(row));
  return map;
}

export async function getProjectInfo(ctx: ApiContext, leadId: string): Promise<ProjectInfo> {
  await getLead(ctx, leadId);
  return (await projectInfoMap(ctx, [leadId])).get(leadId) ?? { ...DEFAULT_PROJECT_INFO };
}

async function saveInfo(ctx: ApiContext, leadId: string, patch: Partial<ProjectInfo>): Promise<ProjectInfo> {
  const { data, error } = await ctx.supabase
    .from('lead_projects')
    .upsert({ lead_id: leadId, workspace_id: ctx.workspaceId, ...patch }, { onConflict: 'lead_id' })
    .select(INFO_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return toInfo(data as InfoRow);
}

export async function updateProjectInfo(ctx: ApiContext, leadId: string, patch: ProjectInfoUpdate): Promise<ProjectInfo> {
  const before = await getProjectInfo(ctx, leadId);
  const info = await saveInfo(ctx, leadId, patch);
  if (patch.stage && patch.stage !== before.stage) {
    await logActivity(ctx, leadId, 'project_stage_changed', null, { from: before.stage, to: patch.stage, label: PROJECT_STAGE_LABELS[patch.stage] });
  }
  return info;
}

/** Prepara o projeto (o mesmo que acontece sozinho ao passar a Cliente), completando o que faltar. */
export async function startProject(ctx: ApiContext, leadId: string): Promise<ProjectStartResult> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase.rpc('start_project', { p_lead_id: leadId });
  if (error) throw fromPostgrest(error, 'Lead não encontrado');
  if (!data) throw new ApiError(422, 'Lead arquivado ou anonimizado', 'Não é possível preparar o projeto deste lead.');
  return data as ProjectStartResult;
}

/** Liga, desliga ou renova o link da página do cliente. */
export async function setProjectShare(ctx: ApiContext, leadId: string, input: { enabled: boolean; regenerate: boolean }): Promise<ProjectInfo> {
  const before = await getProjectInfo(ctx, leadId);
  const token = input.enabled ? (input.regenerate || !before.share_token ? randomBytes(18).toString('base64url') : before.share_token) : null;
  return saveInfo(ctx, leadId, { share_token: token });
}

// -----------------------------------------------------------------------------
// Rondas de revisão
// -----------------------------------------------------------------------------

const REVISION_SELECT = 'id, lead_id, description, billable, requested_on, created_at';

export async function listRevisions(ctx: ApiContext, leadId: string): Promise<ProjectRevision[]> {
  const { data, error } = await ctx.supabase
    .from('project_revisions')
    .select(REVISION_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('requested_on', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw fromPostgrest(error);
  return (data ?? []) as ProjectRevision[];
}

export async function createRevision(ctx: ApiContext, leadId: string, input: ProjectRevisionCreate): Promise<ProjectRevision> {
  const [info, existing] = await Promise.all([getProjectInfo(ctx, leadId), listRevisions(ctx, leadId)]);
  // Sem indicação: a partir da primeira além das incluídas, é a cobrar.
  const billable = input.billable ?? existing.length >= info.revisions_included;
  const { data, error } = await ctx.supabase
    .from('project_revisions')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      description: input.description,
      billable,
      requested_on: input.requested_on ?? todayIso(),
      created_by: ctx.user.id,
    })
    .select(REVISION_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  const n = existing.length + 1;
  await logActivity(ctx, leadId, 'revision_requested', input.description, {
    number: n,
    included: info.revisions_included,
    billable,
    label: `Revisão ${n} de ${info.revisions_included}${billable ? ' · a cobrar à parte' : ''}`,
  });
  return data as ProjectRevision;
}

export async function deleteRevision(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('project_revisions').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error, 'Revisão não encontrada');
  if (!data?.length) throw new ApiError(404, 'Revisão não encontrada');
}

// -----------------------------------------------------------------------------
// Registo de horas
// -----------------------------------------------------------------------------

const TIME_SELECT = 'id, lead_id, user_id, started_at, ended_at, notes, task_id, created_at';
type TimeRow = Omit<TimeEntry, 'minutes' | 'seconds'>;
const toEntry = (row: TimeRow, now = Date.now()): TimeEntry => {
  const seconds = entrySeconds(row, now);
  return { ...row, seconds, minutes: Math.floor(seconds / 60) };
};

/** Valor de cada projeto: a proposta aceite; sem ela, o total dos pagamentos; por fim, o valor estimado. */
export async function projectValues(ctx: ApiContext, leads: { id: string; estimated_value: number | string | null }[]): Promise<Map<string, number | null>> {
  const ids = leads.map((l) => l.id);
  const map = new Map<string, number | null>();
  if (!ids.length) return map;
  const [proposals, payments] = await Promise.all([
    ctx.supabase.from('proposals').select('lead_id, total').eq('workspace_id', ctx.workspaceId).eq('status', 'aceite').in('lead_id', ids),
    ctx.supabase.from('lead_payments').select('lead_id, amount').eq('workspace_id', ctx.workspaceId).in('lead_id', ids),
  ]);
  for (const r of [proposals, payments]) if (r.error) throw fromPostgrest(r.error);
  for (const lead of leads) {
    const accepted = ((proposals.data ?? []) as { lead_id: string; total: number | string }[]).filter((p) => p.lead_id === lead.id);
    const paid = ((payments.data ?? []) as { lead_id: string; amount: number | string }[]).filter((p) => p.lead_id === lead.id);
    const value = accepted.length
      ? Math.max(...accepted.map((p) => Number(p.total)))
      : paid.length
        ? paid.reduce((sum, p) => sum + Number(p.amount), 0)
        : lead.estimated_value === null
          ? null
          : Number(lead.estimated_value);
    map.set(lead.id, value && value > 0 ? Math.round(value * 100) / 100 : null);
  }
  return map;
}

export async function getProjectTime(ctx: ApiContext, leadId: string): Promise<ProjectTime> {
  const lead = await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('project_time_entries')
    .select(TIME_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('started_at', { ascending: false })
    .limit(500);
  if (error) throw fromPostgrest(error);
  const now = Date.now();
  const entries = ((data ?? []) as TimeRow[]).map((r) => toEntry(r, now));
  const total = Math.floor(entries.reduce((sum, e) => sum + e.seconds, 0) / 60);
  const [values, expenses, taskTitles] = await Promise.all([projectValues(ctx, [lead]), expenseTotals(ctx, [leadId]), leadTaskTitles(ctx, leadId)]);
  const value = values.get(leadId) ?? null;
  const spent = expenses.get(leadId) ?? 0;
  const { profit, net_rate } = projectProfit(value, spent, total);
  return {
    expenses: spent,
    profit,
    net_rate,
    entries,
    total_minutes: total,
    logged_seconds: entries.filter((e) => e.ended_at).reduce((sum, e) => sum + e.seconds, 0),
    running: entries.find((e) => !e.ended_at && e.user_id === ctx.user.id) ?? null,
    value,
    hourly_rate: hourlyRate(value, total),
    by_task: timeByTask(entries, taskTitles),
  };
}

/** Títulos das tarefas do lead (para o tempo por tarefa). */
async function leadTaskTitles(ctx: ApiContext, leadId: string): Promise<Map<string, string>> {
  const { data, error } = await ctx.supabase.from('lead_tasks').select('id, title').eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId);
  if (error) throw fromPostgrest(error);
  return new Map(((data ?? []) as { id: string; title: string }[]).map((t) => [t.id, t.title]));
}

/** A tarefa tem de ser deste lead. */
async function checkTask(ctx: ApiContext, leadId: string, taskId: string | null | undefined) {
  if (!taskId) return;
  const titles = await leadTaskTitles(ctx, leadId);
  if (!titles.has(taskId)) throw new ApiError(422, 'Tarefa inválida', 'Essa tarefa não é deste projeto.', { errors: { task_id: ['Escolhe uma tarefa deste projeto.'] } });
}

/** Registos mais curtos do que isto (começar e pausar logo a seguir) não ficam guardados. */
export const MIN_ENTRY_SECONDS = 5;

/** Para o temporizador que estiver a contar (em qualquer projeto). */
async function stopRunning(ctx: ApiContext): Promise<TimeRow[]> {
  const { data, error } = await ctx.supabase
    .from('project_time_entries')
    .update({ ended_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .is('ended_at', null)
    .select(TIME_SELECT);
  if (error) throw fromPostgrest(error);
  const rows = (data ?? []) as TimeRow[];
  const tiny = rows.filter((r) => entrySeconds(r) < MIN_ENTRY_SECONDS).map((r) => r.id);
  if (tiny.length) await ctx.supabase.from('project_time_entries').delete().eq('workspace_id', ctx.workspaceId).in('id', tiny);
  return rows;
}

export async function startTimer(ctx: ApiContext, leadId: string, notes: string | null): Promise<TimeEntry> {
  await getLead(ctx, leadId);
  await stopRunning(ctx);
  const { data, error } = await ctx.supabase
    .from('project_time_entries')
    .insert({ workspace_id: ctx.workspaceId, lead_id: leadId, user_id: ctx.user.id, started_at: new Date().toISOString(), notes })
    .select(TIME_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return toEntry(data as TimeRow);
}

export async function stopTimer(ctx: ApiContext): Promise<TimeEntry | null> {
  const [stopped] = await stopRunning(ctx);
  return stopped ? toEntry(stopped) : null;
}

export async function getRunningTimer(ctx: ApiContext): Promise<RunningTimer> {
  const { data, error } = await ctx.supabase
    .from('project_time_entries')
    .select(`${TIME_SELECT}, lead:leads!inner(id, number, company_name)`)
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.user.id)
    .is('ended_at', null)
    .limit(1)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) return null;
  const { lead, ...row } = data as unknown as TimeRow & { lead: { id: string; number: number; company_name: string } };
  // O que já estava registado nesse projeto (para o relógio mostrar o total, não só esta sessão).
  const { data: closed, error: closedError } = await ctx.supabase
    .from('project_time_entries')
    .select('started_at, ended_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', lead.id)
    .not('ended_at', 'is', null);
  if (closedError) throw fromPostgrest(closedError);
  const logged = ((closed ?? []) as { started_at: string; ended_at: string }[]).reduce((sum, e) => sum + entrySeconds(e), 0);
  return { entry: toEntry(row), lead, logged_seconds: logged };
}

export async function addTimeEntry(ctx: ApiContext, leadId: string, input: TimeEntryCreate): Promise<TimeEntry> {
  await getLead(ctx, leadId);
  await checkTask(ctx, leadId, input.task_id);
  // Registo à mão: no próprio dia, a começar às 09:00 (UTC).
  const started = new Date(`${input.date}T09:00:00Z`);
  const { data, error } = await ctx.supabase
    .from('project_time_entries')
    .insert({
      workspace_id: ctx.workspaceId,
      lead_id: leadId,
      user_id: ctx.user.id,
      started_at: started.toISOString(),
      ended_at: new Date(started.getTime() + input.minutes * 60_000).toISOString(),
      notes: input.notes,
      task_id: input.task_id ?? null,
    })
    .select(TIME_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  return toEntry(data as TimeRow);
}

/** Corrigir um registo já fechado: dia, duração ou o que foi feito. */
export async function updateTimeEntry(ctx: ApiContext, id: string, patch: TimeEntryUpdate): Promise<TimeEntry> {
  const { data: current, error: readError } = await ctx.supabase
    .from('project_time_entries')
    .select(TIME_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw fromPostgrest(readError, 'Registo não encontrado');
  if (!current) throw new ApiError(404, 'Registo não encontrado');
  const row = current as TimeRow;
  if (!row.ended_at) throw new ApiError(422, 'Ainda a contar', 'Pausa o temporizador antes de corrigir este registo.');
  const update: Record<string, unknown> = {};
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.task_id !== undefined) {
    await checkTask(ctx, row.lead_id, patch.task_id);
    update.task_id = patch.task_id;
  }
  if (patch.date !== undefined || patch.minutes !== undefined) {
    // Mantém a hora de início; muda o dia e/ou a duração.
    const started = new Date(row.started_at);
    if (patch.date) {
      const [y, m, d] = patch.date.split('-').map(Number) as [number, number, number];
      started.setUTCFullYear(y, m - 1, d);
    }
    const seconds = patch.minutes !== undefined ? patch.minutes * 60 : entrySeconds(row);
    update.started_at = started.toISOString();
    update.ended_at = new Date(started.getTime() + seconds * 1000).toISOString();
  }
  const { data, error } = await ctx.supabase
    .from('project_time_entries')
    .update(update)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(TIME_SELECT)
    .single();
  if (error) throw fromPostgrest(error, 'Registo não encontrado');
  return toEntry(data as TimeRow);
}

export async function deleteTimeEntry(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('project_time_entries').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error, 'Registo não encontrado');
  if (!data?.length) throw new ApiError(404, 'Registo não encontrado');
}

/** Pôr as horas do projeto a zero: apaga todos os registos (e para o temporizador e o pomodoro deste projeto). */
export async function clearProjectTime(ctx: ApiContext, leadId: string): Promise<{ deleted: number }> {
  await getLead(ctx, leadId);
  const { error: pError } = await ctx.supabase.from('pomodoro_timers').delete().eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId);
  if (pError) throw fromPostgrest(pError);
  const { data, error } = await ctx.supabase.from('project_time_entries').delete().eq('workspace_id', ctx.workspaceId).eq('lead_id', leadId).select('id');
  if (error) throw fromPostgrest(error);
  return { deleted: data?.length ?? 0 };
}

// -----------------------------------------------------------------------------
// Despesas
// -----------------------------------------------------------------------------

const EXPENSE_SELECT = 'id, lead_id, description, amount, spent_on, created_at';
type ExpenseRow = Omit<ProjectExpense, 'amount'> & { amount: number | string };

export async function listExpenses(ctx: ApiContext, leadId: string): Promise<ProjectExpense[]> {
  const { data, error } = await ctx.supabase
    .from('project_expenses')
    .select(EXPENSE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('spent_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as ExpenseRow[]).map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function createExpense(ctx: ApiContext, leadId: string, input: ProjectExpenseCreate): Promise<ProjectExpense> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('project_expenses')
    .insert({ ...input, spent_on: input.spent_on ?? todayIso(), workspace_id: ctx.workspaceId, lead_id: leadId, created_by: ctx.user.id })
    .select(EXPENSE_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  const row = data as ExpenseRow;
  return { ...row, amount: Number(row.amount) };
}

export async function deleteExpense(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('project_expenses').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error, 'Despesa não encontrada');
  if (!data?.length) throw new ApiError(404, 'Despesa não encontrada');
}

/** Total das despesas de vários projetos. */
export async function expenseTotals(ctx: ApiContext, leadIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!leadIds.length) return map;
  const { data, error } = await ctx.supabase.from('project_expenses').select('lead_id, amount').eq('workspace_id', ctx.workspaceId).in('lead_id', leadIds);
  if (error) throw fromPostgrest(error);
  for (const r of (data ?? []) as { lead_id: string; amount: number | string }[]) map.set(r.lead_id, Math.round(((map.get(r.lead_id) ?? 0) + Number(r.amount)) * 100) / 100);
  return map;
}

// -----------------------------------------------------------------------------
// Ficheiros e entregas
// -----------------------------------------------------------------------------

const DELIVERABLE_SELECT = 'id, lead_id, title, url, status, sent_at, approved_at, created_at';
const DELIVERABLE_NOT_FOUND = 'Entrega não encontrada';

export async function listDeliverables(ctx: ApiContext, leadId: string): Promise<ProjectDeliverable[]> {
  const { data, error } = await ctx.supabase
    .from('project_deliverables')
    .select(DELIVERABLE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });
  if (error) throw fromPostgrest(error);
  return (data ?? []) as ProjectDeliverable[];
}

/** Datas de envio/aprovação conforme o estado (e a atividade quando muda). */
function statusDates(status: ProjectDeliverable['status'], before?: ProjectDeliverable): Partial<ProjectDeliverable> {
  const now = new Date().toISOString();
  if (status === 'rascunho') return { sent_at: null, approved_at: null };
  if (status === 'enviada') return { sent_at: before?.sent_at ?? now, approved_at: null };
  return { sent_at: before?.sent_at ?? now, approved_at: before?.approved_at ?? now };
}

async function logDeliverable(ctx: ApiContext, d: ProjectDeliverable, before?: ProjectDeliverable) {
  if (d.status === before?.status || d.status === 'rascunho') return;
  await logActivity(ctx, d.lead_id, d.status === 'aprovada' ? 'deliverable_approved' : 'deliverable_sent', d.title, { url: d.url });
}

export async function createDeliverable(ctx: ApiContext, leadId: string, input: ProjectDeliverableCreate): Promise<ProjectDeliverable> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('project_deliverables')
    .insert({ ...input, ...statusDates(input.status), workspace_id: ctx.workspaceId, lead_id: leadId, created_by: ctx.user.id })
    .select(DELIVERABLE_SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  const deliverable = data as ProjectDeliverable;
  await logDeliverable(ctx, deliverable);
  return deliverable;
}

export async function updateDeliverable(ctx: ApiContext, id: string, patch: ProjectDeliverableUpdate): Promise<ProjectDeliverable> {
  const { data: current, error: readError } = await ctx.supabase
    .from('project_deliverables')
    .select(DELIVERABLE_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw fromPostgrest(readError, DELIVERABLE_NOT_FOUND);
  if (!current) throw new ApiError(404, DELIVERABLE_NOT_FOUND);
  const before = current as ProjectDeliverable;
  const { data, error } = await ctx.supabase
    .from('project_deliverables')
    .update({ ...patch, ...(patch.status ? statusDates(patch.status, before) : {}) })
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(DELIVERABLE_SELECT)
    .single();
  if (error) throw fromPostgrest(error, DELIVERABLE_NOT_FOUND);
  const deliverable = data as ProjectDeliverable;
  await logDeliverable(ctx, deliverable, before);
  return deliverable;
}

export async function deleteDeliverable(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('project_deliverables').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error, DELIVERABLE_NOT_FOUND);
  if (!data?.length) throw new ApiError(404, DELIVERABLE_NOT_FOUND);
}

// -----------------------------------------------------------------------------
// Calendário
// -----------------------------------------------------------------------------

type LeadRef = { id: string; number: number; company_name: string; archived_at?: string | null; anonymized_at?: string | null };
const leadRef = (l: LeadRef) => ({ id: l.id, number: l.number, company_name: l.company_name });
const LEAD_EMBED = 'lead:leads!inner(id, number, company_name, status, archived_at, anonymized_at, project_completed_at)';

/**
 * Prazos de entrega (projetos em curso), reuniões, pagamentos previstos e tarefas
 * com prazo; com `followups`, também as próximas ações dos leads.
 */
export async function projectCalendar(ctx: ApiContext, from: string, to: string, options: { followups?: boolean } = {}): Promise<CalendarEvent[]> {
  const ws = ctx.workspaceId;
  const [dues, meetings, payments, tasks, followups] = await Promise.all([
    ctx.supabase
      .from('lead_projects')
      .select(`lead_id, due_on, ${LEAD_EMBED}`)
      .eq('workspace_id', ws)
      .gte('due_on', from)
      .lte('due_on', to)
      .eq('lead.status', 'cliente')
      .is('lead.project_completed_at', null)
      .is('lead.archived_at', null),
    ctx.supabase
      .from('lead_meetings')
      .select(`id, starts_at, location, ${LEAD_EMBED}`)
      .eq('workspace_id', ws)
      .is('canceled_at', null)
      // Um dia de folga de cada lado (fuso de Lisboa); o dia certo filtra-se abaixo.
      .gte('starts_at', `${addDays(from, -1)}T00:00:00Z`)
      .lt('starts_at', `${addDays(to, 2)}T00:00:00Z`)
      .is('lead.archived_at', null),
    ctx.supabase
      .from('lead_payments')
      .select(`id, description, amount, due_on, paid_on, ${LEAD_EMBED}`)
      .eq('workspace_id', ws)
      .gte('due_on', from)
      .lte('due_on', to)
      .is('lead.archived_at', null),
    ctx.supabase
      .from('lead_tasks')
      .select(`id, title, due_on, done_at, ${LEAD_EMBED}`)
      .eq('workspace_id', ws)
      .gte('due_on', from)
      .lte('due_on', to)
      .is('lead.archived_at', null),
    // Os mesmos follow-ups do "Hoje" (sem clientes nem "sem interesse").
    options.followups
      ? ctx.supabase
          .from('leads')
          .select('id, number, company_name, next_action_text, next_action_on')
          .eq('workspace_id', ws)
          .is('anonymized_at', null)
          .is('archived_at', null)
          .not('status', 'in', '(cliente,sem_interesse)')
          .gte('next_action_on', from)
          .lte('next_action_on', to)
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [dues, meetings, payments, tasks, followups]) if (r.error) throw fromPostgrest(r.error);
  const events: CalendarEvent[] = [];
  for (const d of (dues.data ?? []) as unknown as { lead_id: string; due_on: string; lead: LeadRef }[]) {
    events.push({ id: `due-${d.lead_id}`, date: d.due_on, type: 'due', title: 'Entrega do projeto', starts_at: null, amount: null, done: false, lead: leadRef(d.lead) });
  }
  for (const m of (meetings.data ?? []) as unknown as { id: string; starts_at: string; location: string | null; lead: LeadRef }[]) {
    const date = todayIso(new Date(m.starts_at));
    if (date < from || date > to || m.lead.anonymized_at) continue;
    events.push({ id: `meeting-${m.id}`, date, type: 'meeting', title: m.location ? `Reunião · ${m.location}` : 'Reunião', starts_at: m.starts_at, amount: null, done: false, lead: leadRef(m.lead) });
  }
  for (const p of (payments.data ?? []) as unknown as { id: string; description: string; amount: number | string; due_on: string; paid_on: string | null; lead: LeadRef }[]) {
    events.push({ id: `payment-${p.id}`, date: p.due_on, type: 'payment', title: p.description, starts_at: null, amount: Number(p.amount), done: !!p.paid_on, lead: leadRef(p.lead) });
  }
  for (const t of (tasks.data ?? []) as unknown as { id: string; title: string; due_on: string; done_at: string | null; lead: LeadRef }[]) {
    events.push({ id: `task-${t.id}`, date: t.due_on, type: 'task', title: t.title, starts_at: null, amount: null, done: !!t.done_at, lead: leadRef(t.lead) });
  }
  for (const l of (followups.data ?? []) as { id: string; number: number; company_name: string; next_action_text: string | null; next_action_on: string }[]) {
    events.push({ id: `followup-${l.id}`, date: l.next_action_on, type: 'followup', title: l.next_action_text ?? 'Próxima ação', starts_at: null, amount: null, done: false, lead: leadRef(l) });
  }
  const order = { due: 0, meeting: 1, followup: 2, payment: 3, task: 4 } as const;
  return events.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type] || (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));
}

// -----------------------------------------------------------------------------
// Página de acompanhamento para o cliente (sem sessão)
// -----------------------------------------------------------------------------

/**
 * O cliente aprova uma entrega ou pede alterações (na página /p/<código>).
 * Aprovar: "Aprovada pelo cliente". Pedir alterações: volta a "Por enviar" e
 * fica uma revisão com o pedido (a cobrar se já passou das incluídas). Avisa
 * quem criou o lead com uma notificação.
 */
export async function clientDeliverableAction(
  token: string,
  deliverableId: string,
  input: ClientDeliverableAction,
): Promise<{ status: ProjectDeliverable['status']; revision: number | null }> {
  const shared = await getSharedProject(token);
  if (!shared?.approvals) throw new ApiError(404, 'Página não encontrada');
  const target = shared.deliverables.find((d) => d.id === deliverableId);
  if (!target) throw new ApiError(404, DELIVERABLE_NOT_FOUND);
  if (target.status !== 'enviada') throw new ApiError(409, 'Já respondido', 'Esta entrega já foi aprovada ou está a ser alterada.');
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin.from('lead_projects').select('lead_id, workspace_id, revisions_included').eq('share_token', token).maybeSingle();
  if (!project) throw new ApiError(404, 'Página não encontrada');
  const ws = project.workspace_id as string;
  const leadId = project.lead_id as string;
  const who = input.name ? `${input.name} (cliente)` : 'O cliente';
  const now = new Date().toISOString();
  let revision: number | null = null;

  if (input.action === 'approve') {
    const { error } = await admin.from('project_deliverables').update({ status: 'aprovada', approved_at: now }).eq('id', deliverableId).eq('lead_id', leadId);
    if (error) throw fromPostgrest(error, DELIVERABLE_NOT_FOUND);
    await admin.from('lead_activities').insert({
      workspace_id: ws,
      lead_id: leadId,
      type: 'deliverable_approved',
      body: target.title,
      payload: { via: 'cliente', name: input.name, comment: input.comment },
    });
  } else {
    const { count } = await admin.from('project_revisions').select('id', { count: 'exact', head: true }).eq('lead_id', leadId);
    revision = (count ?? 0) + 1;
    const included = project.revisions_included as number;
    const billable = revision > included;
    const description = `${target.title}: ${input.comment}`.slice(0, 500);
    const [upd, rev] = await Promise.all([
      admin.from('project_deliverables').update({ status: 'rascunho', sent_at: null, approved_at: null }).eq('id', deliverableId).eq('lead_id', leadId),
      admin.from('project_revisions').insert({ workspace_id: ws, lead_id: leadId, description, billable, requested_on: todayIso() }),
    ]);
    for (const r of [upd, rev]) if (r.error) throw fromPostgrest(r.error);
    await admin.from('lead_activities').insert({
      workspace_id: ws,
      lead_id: leadId,
      type: 'revision_requested',
      body: description,
      payload: { via: 'cliente', name: input.name, number: revision, included, billable, label: `Revisão ${revision} de ${included}${billable ? ' · a cobrar à parte' : ''}` },
    });
  }

  const { data: lead } = await admin.from('leads').select('created_by, number, company_name').eq('id', leadId).maybeSingle();
  if (lead?.created_by) {
    await sendUserPush(ws, lead.created_by as string, {
      title: input.action === 'approve' ? `✅ Entrega aprovada · ${lead.company_name}` : `✏️ Pedido de alterações · ${lead.company_name}`,
      body: input.action === 'approve' ? `${who} aprovou "${target.title}".` : `${who}: ${input.comment}`,
      url: `/leads/${leadId}#projeto`,
      tag: `deliverable-${deliverableId}`,
    }).catch(() => undefined);
  }
  return { status: input.action === 'approve' ? 'aprovada' : 'rascunho', revision };
}

/** O projeto do link /p/<código>, ou null se o link não existir ou estiver desligado. */
export async function getSharedProject(token: string): Promise<SharedProject | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data: project } = await admin
    .from('lead_projects')
    .select('lead_id, workspace_id, due_on, stage, revisions_included, updated_at')
    .eq('share_token', token)
    .maybeSingle();
  if (!project) return null;
  const ws = project.workspace_id as string;
  const leadId = project.lead_id as string;
  const [{ data: workspace }, { data: lead }] = await Promise.all([
    admin.from('workspaces').select('settings').eq('id', ws).maybeSingle(),
    admin
      .from('leads')
      .select('company_name, contact_name, status, project_completed_at, archived_at, anonymized_at, created_by, updated_at')
      .eq('workspace_id', ws)
      .eq('id', leadId)
      .maybeSingle(),
  ]);
  if (!workspace || !lead || lead.anonymized_at || lead.archived_at) return null;
  const features = WorkspaceSettingsSchema.parse(workspace.settings ?? {}).features;
  if (!features.projects || !features.client_page) return null;

  const [tasks, meetings, deliverables, payments, revisions, signatures, contracts] = await Promise.all([
    admin.from('lead_tasks').select('title, done_at, position').eq('workspace_id', ws).eq('lead_id', leadId).order('position', { ascending: true }),
    features.meetings
      ? admin
          .from('lead_meetings')
          .select('starts_at, location')
          .eq('workspace_id', ws)
          .eq('lead_id', leadId)
          .is('canceled_at', null)
          .gte('starts_at', new Date().toISOString())
          .order('starts_at', { ascending: true })
          .limit(1)
      : Promise.resolve({ data: [] }),
    features.deliverables
      ? admin
          .from('project_deliverables')
          .select('id, title, url, status, sent_at, approved_at, created_at')
          .eq('workspace_id', ws)
          .eq('lead_id', leadId)
          .neq('status', 'rascunho')
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    features.payments
      ? admin.from('lead_payments').select('description, amount, due_on, paid_on').eq('workspace_id', ws).eq('lead_id', leadId).order('due_on', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: null }),
    features.revisions
      ? admin.from('project_revisions').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).eq('lead_id', leadId)
      : Promise.resolve({ count: null }),
    admin
      .from('signatures')
      .select('full_name, company, email, phone, website, user_id, is_default')
      .eq('workspace_id', ws)
      .order('is_default', { ascending: false }),
    features.contracts
      ? admin
          .from('lead_contracts')
          .select('token, status, title')
          .eq('workspace_id', ws)
          .eq('lead_id', leadId)
          .neq('status', 'rascunho')
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
  ]);

  const sigs = (signatures.data ?? []) as { full_name: string; company: string | null; email: string | null; phone: string | null; website: string | null; user_id: string }[];
  const sig = sigs.find((s) => s.user_id === lead.created_by) ?? sigs[0];
  const pays = ((payments.data ?? null) as { description: string; amount: number | string; due_on: string | null; paid_on: string | null }[] | null)?.map((p) => ({
    ...p,
    amount: Number(p.amount),
  }));
  const sum = pays?.length ? summarizePayments(pays, todayIso()) : null;
  const nextPay = pays?.find((p) => !p.paid_on) ?? null;
  const meeting = ((meetings.data ?? []) as { starts_at: string; location: string | null }[])[0] ?? null;

  return {
    company_name: lead.company_name as string,
    contact_name: (lead.contact_name as string | null) ?? null,
    stage: project.stage as SharedProject['stage'],
    due_on: (project.due_on as string | null) ?? null,
    completed_at: (lead.project_completed_at as string | null) ?? null,
    tasks: ((tasks.data ?? []) as { title: string; done_at: string | null }[]).map((t) => ({ title: t.title, done: !!t.done_at })),
    next_meeting: meeting,
    deliverables: (
      (deliverables.data ?? []) as { id: string; title: string; url: string | null; status: SharedProject['deliverables'][number]['status']; sent_at: string | null; approved_at: string | null }[]
    ).map((d) => ({ id: d.id, title: d.title, url: d.url, status: d.status, date: d.approved_at ?? d.sent_at })),
    approvals: features.deliverables && features.client_approvals && !lead.project_completed_at,
    contract: ((contracts.data ?? []) as SharedProject['contract'][])[0] ?? null,
    payments: sum
      ? { total: sum.total, paid: sum.paid, outstanding: sum.outstanding, next: nextPay ? { description: nextPay.description, amount: nextPay.amount, due_on: nextPay.due_on } : null }
      : null,
    revisions: features.revisions ? { used: (revisions as { count: number | null }).count ?? 0, included: project.revisions_included as number } : null,
    from: {
      name: sig?.full_name ?? 'VNDesign',
      company: sig?.company ?? null,
      email: sig?.email ?? null,
      phone: sig?.phone ?? null,
      website: sig?.website ?? null,
    },
    updated_at: [project.updated_at as string, lead.updated_at as string].sort().at(-1)!,
  };
}
