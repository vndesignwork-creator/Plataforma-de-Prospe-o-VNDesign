/**
 * Projetos: os clientes (estado "Cliente") com o projeto em curso ou concluído,
 * com o prazo, a fase, o progresso das tarefas, os pagamentos, as revisões,
 * as horas e as entregas.
 */
import { DEFAULT_PROJECT_INFO, UPSELL_TASK_PREFIX, addDays, addMonths, entrySeconds, summarizePayments, todayIso, type Lead, type Project, type ProjectComplete } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { selectInBatches } from '../batch';
import { LEAD_SELECT, getLead } from './leads';
import { expenseTotals, projectInfoMap, projectValues } from './project-tools';
import { createTask, listTasksForLeads } from './tasks';

/**
 * A última vez que se mexeu neste projeto: um registo meu na linha do tempo,
 * qualquer mudança nas tarefas (criar, mudar o nome ou o prazo, trocar a ordem,
 * concluir) ou tempo registado por mim.
 */
function lastTouch(
  tasks: { updated_at?: string; done_at: string | null }[],
  entries: { started_at: string; ended_at: string | null }[],
  activity: string | null,
): string | null {
  const dates = [
    activity,
    ...tasks.map((t) => t.updated_at ?? t.done_at),
    ...entries.map((e) => e.ended_at ?? e.started_at),
  ].filter((d): d is string => !!d);
  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

export async function listProjects(ctx: ApiContext, state: 'active' | 'completed'): Promise<Project[]> {
  let q = ctx.supabase
    .from('leads')
    .select(LEAD_SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('status', 'cliente')
    .is('archived_at', null)
    .is('anonymized_at', null)
    .limit(500);
  q = state === 'active'
    ? q.is('project_completed_at', null).order('status_changed_at', { ascending: false })
    : q.not('project_completed_at', 'is', null).order('project_completed_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw fromPostgrest(error);
  const leads = (data ?? []) as unknown as Lead[];
  if (!leads.length) return [];
  const ids = leads.map((l) => l.id);

  const ws = ctx.workspaceId;
  const [tasks, payments, revisions, time, deliverables, infos, values, expenses, recentActivity] = await Promise.all([
    // Completas (como GET /leads/{id}/tasks): a página Projetos não as pede uma a uma.
    listTasksForLeads(ctx, ids),
    selectInBatches<{ lead_id: string; amount: number | string; due_on: string | null; paid_on: string | null }>(ids, (batch) =>
      ctx.supabase.from('lead_payments').select('lead_id, amount, due_on, paid_on').eq('workspace_id', ws).in('lead_id', batch),
    ),
    selectInBatches<{ lead_id: string }>(ids, (batch) => ctx.supabase.from('project_revisions').select('lead_id').eq('workspace_id', ws).in('lead_id', batch)),
    selectInBatches<{ lead_id: string; user_id: string; started_at: string; ended_at: string | null }>(ids, (batch) =>
      ctx.supabase.from('project_time_entries').select('lead_id, user_id, started_at, ended_at').eq('workspace_id', ws).in('lead_id', batch),
    ),
    selectInBatches<{ lead_id: string; status: string }>(ids, (batch) =>
      ctx.supabase.from('project_deliverables').select('lead_id, status').eq('workspace_id', ws).in('lead_id', batch),
    ),
    projectInfoMap(ctx, ids),
    projectValues(ctx, leads),
    expenseTotals(ctx, ids),
    // Em que projetos mexi nos últimos dias (para o cartão "A trabalhar agora").
    selectInBatches<{ lead_id: string; created_at: string }>(ids, (batch) =>
      ctx.supabase
        .from('lead_activities')
        .select('lead_id, created_at')
        .eq('workspace_id', ws)
        .eq('actor_user_id', ctx.user.id)
        .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
        .in('lead_id', batch),
    ),
  ]);
  // A atividade mais recente de cada projeto (só a minha).
  const lastActivity = new Map<string, string>();
  for (const row of recentActivity) {
    const seen = lastActivity.get(row.lead_id);
    if (!seen || Date.parse(row.created_at) > Date.parse(seen)) lastActivity.set(row.lead_id, row.created_at);
  }
  const today = todayIso();
  const nowMs = Date.now();
  const byLead = <T extends { lead_id: string }>(rows: T[], id: string) => rows.filter((r) => r.lead_id === id);

  const projects = leads.map((lead): Project => {
    const own = tasks.get(lead.id) ?? [];
    const open = own.filter((t) => !t.done_at);
    // Próxima tarefa: a com prazo mais próximo; sem prazos, a primeira da lista.
    const next = [...open].sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))[0] ?? null;
    const pays = byLead(payments, lead.id).map((p) => ({
      amount: Number(p.amount),
      due_on: p.due_on,
      paid_on: p.paid_on,
    }));
    const entries = byLead(time, lead.id);
    const mine = entries.find((e) => !e.ended_at && e.user_id === ctx.user.id);
    const delivered = byLead(deliverables, lead.id);
    return {
      lead,
      info: infos.get(lead.id) ?? { ...DEFAULT_PROJECT_INFO },
      tasks: { total: own.length, done: own.length - open.length },
      next_task: next ? { id: next.id, title: next.title, due_on: next.due_on } : null,
      payments: summarizePayments(pays, today),
      revisions: { used: byLead(revisions, lead.id).length },
      time: {
        minutes: Math.floor(entries.reduce((sum, e) => sum + entrySeconds(e, nowMs), 0) / 60),
        logged_seconds: entries.filter((e) => e.ended_at).reduce((sum, e) => sum + entrySeconds(e, nowMs), 0),
        running_since: mine?.started_at ?? null,
      },
      deliverables: { total: delivered.length, approved: delivered.filter((d) => d.status === 'aprovada').length },
      value: values.get(lead.id) ?? null,
      expenses: expenses.get(lead.id) ?? 0,
      last_touch: lastTouch(own, entries.filter((e) => e.user_id === ctx.user.id), lastActivity.get(lead.id) ?? null),
      task_items: own,
    };
  });
  // Em curso: primeiro os com prazo mais próximo (os sem prazo no fim).
  if (state === 'active') projects.sort((a, b) => (a.info.due_on ?? '9999').localeCompare(b.info.due_on ?? '9999'));
  return projects;
}

/**
 * Concluir (ou reabrir) o projeto de um cliente. Ao concluir, pode criar as
 * tarefas "Juntar ao portefólio" (daqui a uma semana) e "Propor um novo
 * serviço" (daqui a N meses), que aparecem em "Hoje" no dia.
 */
export async function setProjectCompleted(ctx: ApiContext, leadId: string, input: ProjectComplete) {
  await getLead(ctx, leadId);
  const { error } = await ctx.supabase.rpc('set_project_completed', { p_lead_id: leadId, p_completed: input.completed });
  if (error) throw fromPostgrest(error, 'Lead não encontrado');
  if (input.completed) {
    const today = todayIso();
    if (input.portfolio_task) {
      await createTask(ctx, leadId, { title: 'Juntar o projeto ao portefólio', due_on: addDays(today, 7), remind_at: null });
    }
    if (input.upsell_months) {
      await createTask(ctx, leadId, {
        title: `${UPSELL_TASK_PREFIX} (manutenção, redes sociais, novos materiais…)`,
        due_on: addMonths(today, input.upsell_months),
        remind_at: null,
      });
    }
  }
  return getLead(ctx, leadId);
}
