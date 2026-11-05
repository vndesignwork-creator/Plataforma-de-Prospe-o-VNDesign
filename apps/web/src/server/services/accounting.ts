/**
 * Relatório mensal para a contabilidade: recebido (pagamentos pagos no mês),
 * despesas (dos projetos, no mês) e por receber (o que falta pagar com data até
 * ao fim do mês, ou sem data). Em JSON, PDF ou Excel.
 */
import { ACCOUNTING_MONTH, monthLabel, monthRange, todayIso, type AccountingReport } from '@vndesign/core';
import type { ApiContext } from '../context';
import { ApiError, fromPostgrest } from '../http';
import { getSettings } from './workspace';

type Lead = { id: string; number: number; company_name: string };
const round = (n: number) => Math.round(n * 100) / 100;

export async function accountingReport(ctx: ApiContext, month: string): Promise<AccountingReport> {
  if (!ACCOUNTING_MONTH.test(month)) throw new ApiError(422, 'Mês inválido', 'Usa o formato AAAA-MM (ex.: 2026-11).');
  const settings = await getSettings(ctx);
  if (!settings.features.accounting_report) throw new ApiError(404, 'Relatório desligado', 'Liga-o em Definições → Funcionalidades.');
  const { from, to } = monthRange(month);
  const today = todayIso();
  const [paid, spent, open] = await Promise.all([
    ctx.supabase.from('lead_payments').select('lead_id, description, amount, paid_on, method').eq('workspace_id', ctx.workspaceId).gte('paid_on', from).lte('paid_on', to).order('paid_on').limit(5000),
    settings.features.expenses
      ? ctx.supabase.from('project_expenses').select('lead_id, description, amount, spent_on').eq('workspace_id', ctx.workspaceId).gte('spent_on', from).lte('spent_on', to).order('spent_on').limit(5000)
      : Promise.resolve({ data: [], error: null }),
    ctx.supabase.from('lead_payments').select('lead_id, description, amount, due_on').eq('workspace_id', ctx.workspaceId).is('paid_on', null).or(`due_on.is.null,due_on.lte.${to}`).order('due_on', { nullsFirst: false }).limit(5000),
  ]);
  for (const r of [paid, spent, open]) if (r.error) throw fromPostgrest(r.error);
  type P = { lead_id: string; description: string; amount: number | string; paid_on?: string | null; method?: string | null; spent_on?: string; due_on?: string | null };
  const paidRows = (paid.data ?? []) as P[];
  const spentRows = (spent.data ?? []) as P[];
  const openRows = (open.data ?? []) as P[];
  const ids = [...new Set([...paidRows, ...spentRows, ...openRows].map((r) => r.lead_id))];
  const leads = new Map<string, Lead>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await ctx.supabase.from('leads').select('id, number, company_name').eq('workspace_id', ctx.workspaceId).in('id', ids.slice(i, i + 200));
    for (const l of (data ?? []) as Lead[]) leads.set(l.id, l);
  }
  const who = (id: string) => ({ client: leads.get(id)?.company_name ?? '—', lead_number: leads.get(id)?.number ?? null });
  // Passado da data: no mês de hoje conta até hoje; num mês passado, até ao fim desse mês.
  const cutoff = to < today ? to : today;
  const received = paidRows.map((r) => ({ date: r.paid_on ?? null, ...who(r.lead_id), description: r.description, amount: Number(r.amount), method: r.method ?? null }));
  const expenses = spentRows.map((r) => ({ date: r.spent_on ?? null, ...who(r.lead_id), description: r.description, amount: Number(r.amount) }));
  const outstanding = openRows.map((r) => ({
    date: r.due_on ?? null,
    ...who(r.lead_id),
    description: r.description,
    amount: Number(r.amount),
    overdue: !!r.due_on && r.due_on < cutoff,
  }));
  const sum = (rows: { amount: number }[]) => round(rows.reduce((a, r) => a + r.amount, 0));
  const receivedTotal = sum(received);
  const expensesTotal = sum(expenses);
  return {
    month,
    label: monthLabel(month),
    from,
    to,
    received: { total: receivedTotal, rows: received },
    expenses: { total: expensesTotal, rows: expenses },
    outstanding: { total: sum(outstanding), overdue: sum(outstanding.filter((r) => r.overdue)), rows: outstanding },
    result: round(receivedTotal - expensesTotal),
  };
}
