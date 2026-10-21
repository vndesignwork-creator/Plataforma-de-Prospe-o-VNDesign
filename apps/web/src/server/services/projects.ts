/**
 * Projetos: os clientes (estado "Cliente") com o projeto em curso ou concluído,
 * com o prazo, a fase, o progresso das tarefas, os pagamentos, a próxima
 * reunião, as revisões, as horas e as entregas.
 */
import { DEFAULT_PROJECT_INFO, addDays, addMonths, entrySeconds, summarizePayments, todayIso, type Lead, type Project, type ProjectComplete } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { LEAD_SELECT, getLead } from './leads';
import { projectInfoMap, projectValues } from './project-tools';
import { createTask } from './tasks';

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

  const now = new Date().toISOString();
  const ws = ctx.workspaceId;
  const [tasks, payments, meetings, revisions, time, deliverables, infos, values] = await Promise.all([
    ctx.supabase.from('lead_tasks').select('id, lead_id, title, due_on, done_at, position').eq('workspace_id', ws).in('lead_id', ids).order('position', { ascending: true }),
    ctx.supabase.from('lead_payments').select('lead_id, amount, due_on, paid_on').eq('workspace_id', ws).in('lead_id', ids),
    ctx.supabase
      .from('lead_meetings')
      .select('id, lead_id, starts_at')
      .eq('workspace_id', ws)
      .in('lead_id', ids)
      .is('canceled_at', null)
      .gte('starts_at', now)
      .order('starts_at', { ascending: true }),
    ctx.supabase.from('project_revisions').select('lead_id').eq('workspace_id', ws).in('lead_id', ids),
    ctx.supabase.from('project_time_entries').select('lead_id, user_id, started_at, ended_at').eq('workspace_id', ws).in('lead_id', ids),
    ctx.supabase.from('project_deliverables').select('lead_id, status').eq('workspace_id', ws).in('lead_id', ids),
    projectInfoMap(ctx, ids),
    projectValues(ctx, leads),
  ]);
  for (const r of [tasks, payments, meetings, revisions, time, deliverables]) if (r.error) throw fromPostgrest(r.error);
  const today = todayIso();
  const nowMs = Date.now();
  const byLead = <T extends { lead_id: string }>(rows: T[] | null, id: string) => (rows ?? []).filter((r) => r.lead_id === id);

  const projects = leads.map((lead): Project => {
    const own = byLead(tasks.data as { id: string; lead_id: string; title: string; due_on: string | null; done_at: string | null }[], lead.id);
    const open = own.filter((t) => !t.done_at);
    // Próxima tarefa: a com prazo mais próximo; sem prazos, a primeira da lista.
    const next = [...open].sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))[0] ?? null;
    const pays = byLead(payments.data as { lead_id: string; amount: number | string; due_on: string | null; paid_on: string | null }[], lead.id).map((p) => ({
      amount: Number(p.amount),
      due_on: p.due_on,
      paid_on: p.paid_on,
    }));
    const meeting = byLead(meetings.data as { id: string; lead_id: string; starts_at: string }[], lead.id)[0];
    const entries = byLead(time.data as { lead_id: string; user_id: string; started_at: string; ended_at: string | null }[], lead.id);
    const mine = entries.find((e) => !e.ended_at && e.user_id === ctx.user.id);
    const delivered = byLead(deliverables.data as { lead_id: string; status: string }[], lead.id);
    return {
      lead,
      info: infos.get(lead.id) ?? { ...DEFAULT_PROJECT_INFO },
      tasks: { total: own.length, done: own.length - open.length },
      next_task: next ? { id: next.id, title: next.title, due_on: next.due_on } : null,
      payments: summarizePayments(pays, today),
      next_meeting: meeting ? { id: meeting.id, starts_at: meeting.starts_at } : null,
      revisions: { used: byLead(revisions.data as { lead_id: string }[], lead.id).length },
      time: {
        minutes: Math.floor(entries.reduce((sum, e) => sum + entrySeconds(e, nowMs), 0) / 60),
        logged_seconds: entries.filter((e) => e.ended_at).reduce((sum, e) => sum + entrySeconds(e, nowMs), 0),
        running_since: mine?.started_at ?? null,
      },
      deliverables: { total: delivered.length, approved: delivered.filter((d) => d.status === 'aprovada').length },
      value: values.get(lead.id) ?? null,
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
        title: 'Propor um novo serviço (manutenção, redes sociais, novos materiais…)',
        due_on: addMonths(today, input.upsell_months),
        remind_at: null,
      });
    }
  }
  return getLead(ctx, leadId);
}
