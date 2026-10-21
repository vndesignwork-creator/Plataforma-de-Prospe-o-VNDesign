/**
 * Projetos: os clientes (estado "Cliente") com o projeto em curso ou concluído,
 * com o progresso das tarefas, os pagamentos e a próxima reunião.
 */
import { summarizePayments, todayIso, type Project } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { getLead } from './leads';

type LeadRow = Project['lead'] & { estimated_value: number | string | null };

export async function listProjects(ctx: ApiContext, state: 'active' | 'completed'): Promise<Project[]> {
  let q = ctx.supabase
    .from('leads')
    .select('id, number, company_name, status, services, estimated_value, status_changed_at, project_completed_at')
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
  const leads = (data ?? []) as LeadRow[];
  if (!leads.length) return [];
  const ids = leads.map((l) => l.id);

  const now = new Date().toISOString();
  const [tasks, payments, meetings] = await Promise.all([
    ctx.supabase
      .from('lead_tasks')
      .select('id, lead_id, title, due_on, done_at, position')
      .eq('workspace_id', ctx.workspaceId)
      .in('lead_id', ids)
      .order('position', { ascending: true }),
    ctx.supabase.from('lead_payments').select('lead_id, amount, due_on, paid_on').eq('workspace_id', ctx.workspaceId).in('lead_id', ids),
    ctx.supabase
      .from('lead_meetings')
      .select('id, lead_id, starts_at')
      .eq('workspace_id', ctx.workspaceId)
      .in('lead_id', ids)
      .is('canceled_at', null)
      .gte('starts_at', now)
      .order('starts_at', { ascending: true }),
  ]);
  for (const r of [tasks, payments, meetings]) if (r.error) throw fromPostgrest(r.error);
  const today = todayIso();

  return leads.map((lead) => {
    const own = ((tasks.data ?? []) as { id: string; lead_id: string; title: string; due_on: string | null; done_at: string | null }[]).filter(
      (t) => t.lead_id === lead.id,
    );
    const open = own.filter((t) => !t.done_at);
    // Próxima tarefa: a com prazo mais próximo; sem prazos, a primeira da lista.
    const next = [...open].sort((a, b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))[0] ?? null;
    const pays = ((payments.data ?? []) as { lead_id: string; amount: number | string; due_on: string | null; paid_on: string | null }[])
      .filter((p) => p.lead_id === lead.id)
      .map((p) => ({ amount: Number(p.amount), due_on: p.due_on, paid_on: p.paid_on }));
    const meeting = ((meetings.data ?? []) as { id: string; lead_id: string; starts_at: string }[]).find((m) => m.lead_id === lead.id);
    return {
      lead: { ...lead, estimated_value: lead.estimated_value === null ? null : Number(lead.estimated_value), services: lead.services ?? [] },
      tasks: { total: own.length, done: own.length - open.length },
      next_task: next ? { id: next.id, title: next.title, due_on: next.due_on } : null,
      payments: summarizePayments(pays, today),
      next_meeting: meeting ? { id: meeting.id, starts_at: meeting.starts_at } : null,
    };
  });
}

/** Concluir (ou reabrir) o projeto de um cliente. */
export async function setProjectCompleted(ctx: ApiContext, leadId: string, completed: boolean) {
  await getLead(ctx, leadId);
  const { error } = await ctx.supabase.rpc('set_project_completed', { p_lead_id: leadId, p_completed: completed });
  if (error) throw fromPostgrest(error, 'Lead não encontrado');
  return getLead(ctx, leadId);
}
