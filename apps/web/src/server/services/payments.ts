/**
 * Pagamentos dos clientes (sinal, prestações) e a faturação do Dashboard.
 * Marcar um pagamento como pago regista "Pagamento recebido" na linha do tempo.
 */
import {
  formatCurrency,
  paymentPlanItems,
  todayIso,
  type BillingSummary,
  type LeadPayment,
  type LeadPaymentCreate,
  type LeadPaymentUpdate,
  type PaymentPlan,
} from '@vndesign/core';
import { PAGE_SIZE, selectAllPages } from '../batch';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { getLead } from './leads';

const SELECT = 'id, lead_id, description, amount, due_on, paid_on, method, created_at';
const NOT_FOUND = 'Pagamento não encontrado';

type Row = Omit<LeadPayment, 'amount'> & { amount: number | string };
const toPayment = (r: Row): LeadPayment => ({ ...r, amount: Number(r.amount) });

export async function listPayments(ctx: ApiContext, leadId: string): Promise<LeadPayment[]> {
  const { data, error } = await ctx.supabase
    .from('lead_payments')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('lead_id', leadId)
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as Row[]).map(toPayment);
}

async function logReceived(ctx: ApiContext, payment: LeadPayment) {
  await ctx.supabase.from('lead_activities').insert({
    workspace_id: ctx.workspaceId,
    lead_id: payment.lead_id,
    type: 'payment_received',
    body: payment.description,
    payload: { amount: payment.amount, paid_on: payment.paid_on, method: payment.method, label: formatCurrency(payment.amount) },
    actor_user_id: ctx.user.id,
  });
}

export async function createPayment(ctx: ApiContext, leadId: string, input: LeadPaymentCreate): Promise<LeadPayment> {
  await getLead(ctx, leadId);
  const { data, error } = await ctx.supabase
    .from('lead_payments')
    .insert({ ...input, workspace_id: ctx.workspaceId, lead_id: leadId, created_by: ctx.user.id })
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error);
  const payment = toPayment(data as Row);
  if (payment.paid_on) await logReceived(ctx, payment);
  return payment;
}

/** Plano pronto (ex.: 50% de sinal hoje + 50% na entrega, sem data). */
export async function createPaymentPlan(ctx: ApiContext, leadId: string, plan: PaymentPlan): Promise<LeadPayment[]> {
  await getLead(ctx, leadId);
  const today = todayIso();
  const rows = paymentPlanItems(plan.total, plan.split).map((item, i) => ({
    ...item,
    workspace_id: ctx.workspaceId,
    lead_id: leadId,
    due_on: i === 0 ? today : null,
    created_by: ctx.user.id,
  }));
  const { error } = await ctx.supabase.from('lead_payments').insert(rows);
  if (error) throw fromPostgrest(error);
  return listPayments(ctx, leadId);
}

export async function updatePayment(ctx: ApiContext, id: string, patch: LeadPaymentUpdate): Promise<LeadPayment> {
  const { data: before, error: readError } = await ctx.supabase
    .from('lead_payments')
    .select(SELECT)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw fromPostgrest(readError, NOT_FOUND);
  if (!before) throw new ApiError(404, NOT_FOUND);
  const { data, error } = await ctx.supabase
    .from('lead_payments')
    .update(patch)
    .eq('workspace_id', ctx.workspaceId)
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw fromPostgrest(error, NOT_FOUND);
  const payment = toPayment(data as Row);
  if (payment.paid_on && !(before as Row).paid_on) await logReceived(ctx, payment);
  return payment;
}

export async function deletePayment(ctx: ApiContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase.from('lead_payments').delete().eq('workspace_id', ctx.workspaceId).eq('id', id).select('id');
  if (error) throw fromPostgrest(error, NOT_FOUND);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
}

/** Faturação do Dashboard: recebido este mês, por receber, em atraso e projetos em curso. */
export async function billingSummary(ctx: ApiContext): Promise<BillingSummary> {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  // Os pagamentos página a página (o Supabase devolve no máximo 1000 linhas por pedido).
  const paymentsPage = (from: number, to: number) =>
    ctx.supabase
      .from('lead_payments')
      .select('amount, due_on, paid_on, lead:leads!inner(archived_at, anonymized_at)')
      .eq('workspace_id', ctx.workspaceId)
      .or(`paid_on.is.null,paid_on.gte.${monthStart}`)
      .order('id')
      .range(from, to);
  const [payments, projects] = await Promise.all([
    paymentsPage(0, PAGE_SIZE - 1).then(async (first) => {
      if (first.error || (first.data?.length ?? 0) < PAGE_SIZE) return first;
      const rest = await selectAllPages<unknown>((from, to) => paymentsPage(from + PAGE_SIZE, to + PAGE_SIZE));
      return { ...first, data: [...(first.data ?? []), ...rest] as typeof first.data };
    }),
    ctx.supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ctx.workspaceId)
      .eq('status', 'cliente')
      .is('archived_at', null)
      .is('anonymized_at', null)
      .is('project_completed_at', null),
  ]);
  // Antes da migração 20261029000100 não há pagamentos.
  if (payments.error?.code === '42P01' || payments.error?.code === 'PGRST205' || projects.error?.code === '42703') {
    return { received_month: 0, outstanding: 0, overdue: 0, overdue_count: 0, active_projects: 0 };
  }
  if (payments.error) throw fromPostgrest(payments.error);
  if (projects.error) throw fromPostgrest(projects.error);
  const r = (v: number) => Math.round(v * 100) / 100;
  let received = 0;
  let outstanding = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const p of (payments.data ?? []) as unknown as { amount: number | string; due_on: string | null; paid_on: string | null; lead: { anonymized_at: string | null } }[]) {
    const amount = Number(p.amount);
    if (p.paid_on) received += amount;
    else if (!p.lead.anonymized_at) {
      outstanding += amount;
      if (p.due_on && p.due_on < today) {
        overdue += amount;
        overdueCount += 1;
      }
    }
  }
  return { received_month: r(received), outstanding: r(outstanding), overdue: r(overdue), overdue_count: overdueCount, active_projects: projects.count ?? 0 };
}
