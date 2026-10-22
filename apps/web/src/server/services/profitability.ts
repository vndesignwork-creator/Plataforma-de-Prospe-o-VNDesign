/**
 * Rentabilidade dos projetos (Estatísticas): €/hora por serviço e por cliente,
 * horas e valor recebido por mês, duração média dos projetos.
 */
import { daysBetween, entrySeconds, hourlyRate, lastMonths, projectProfit, todayIso, type Profitability } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { expenseTotals, projectValues } from './project-tools';

type LeadRow = {
  id: string;
  number: number;
  company_name: string;
  services: string[] | null;
  estimated_value: number | string | null;
  status_changed_at: string;
  project_completed_at: string | null;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export async function profitability(ctx: ApiContext): Promise<Profitability> {
  const ws = ctx.workspaceId;
  const today = todayIso();
  const months = lastMonths(today, 12);
  const from = `${months[0]}-01`;
  const [leadsRes, timeRes, paidRes] = await Promise.all([
    ctx.supabase
      .from('leads')
      .select('id, number, company_name, services, estimated_value, status_changed_at, project_completed_at')
      .eq('workspace_id', ws)
      .eq('status', 'cliente')
      .is('archived_at', null)
      .is('anonymized_at', null)
      .limit(2000),
    ctx.supabase.from('project_time_entries').select('lead_id, started_at, ended_at').eq('workspace_id', ws).not('ended_at', 'is', null).limit(20_000),
    ctx.supabase.from('lead_payments').select('amount, paid_on').eq('workspace_id', ws).gte('paid_on', from).limit(10_000),
  ]);
  for (const r of [leadsRes, timeRes, paidRes]) if (r.error) throw fromPostgrest(r.error);
  const leads = (leadsRes.data ?? []) as LeadRow[];
  const [values, expenses] = await Promise.all([projectValues(ctx, leads), expenseTotals(ctx, leads.map((l) => l.id))]);

  // Minutos por lead e por mês (hora de Lisboa).
  const minutesByLead = new Map<string, number>();
  const minutesByMonth = new Map<string, number>();
  for (const e of (timeRes.data ?? []) as { lead_id: string; started_at: string; ended_at: string }[]) {
    const min = entrySeconds(e) / 60;
    minutesByLead.set(e.lead_id, (minutesByLead.get(e.lead_id) ?? 0) + min);
    const month = todayIso(new Date(e.started_at)).slice(0, 7);
    minutesByMonth.set(month, (minutesByMonth.get(month) ?? 0) + min);
  }
  const receivedByMonth = new Map<string, number>();
  for (const p of (paidRes.data ?? []) as { amount: number | string; paid_on: string }[]) {
    const month = p.paid_on.slice(0, 7);
    receivedByMonth.set(month, (receivedByMonth.get(month) ?? 0) + Number(p.amount));
  }

  // Por serviço: um projeto com vários serviços conta uma parte igual para cada um.
  const services = new Map<string, { projects: number; minutes: number; value: number; valueWithTime: number; minutesWithValue: number }>();
  let rateValue = 0;
  let rateMinutes = 0;
  let rateExpenses = 0;
  let totalExpenses = 0;
  const completedDays: number[] = [];
  const completedMinutes: number[] = [];
  const clients: Profitability['by_client'] = [];
  for (const lead of leads) {
    const minutes = minutesByLead.get(lead.id) ?? 0;
    const value = values.get(lead.id) ?? null;
    const spent = expenses.get(lead.id) ?? 0;
    totalExpenses += spent;
    if (minutes >= 15 && value) {
      rateValue += value;
      rateMinutes += minutes;
      rateExpenses += spent;
    }
    if (lead.project_completed_at) {
      completedDays.push(Math.max(0, daysBetween(todayIso(new Date(lead.status_changed_at)), todayIso(new Date(lead.project_completed_at)))));
      if (minutes > 0) completedMinutes.push(minutes);
    }
    if (minutes > 0 || value || spent) {
      clients.push({
        lead: { id: lead.id, number: lead.number, company_name: lead.company_name },
        minutes: Math.round(minutes),
        value,
        expenses: spent,
        rate: hourlyRate(value, minutes),
        net_rate: projectProfit(value, spent, minutes).net_rate,
        completed: !!lead.project_completed_at,
      });
    }
    const keys = lead.services ?? [];
    for (const key of keys) {
      const share = 1 / keys.length;
      const s = services.get(key) ?? { projects: 0, minutes: 0, value: 0, valueWithTime: 0, minutesWithValue: 0 };
      s.projects += 1;
      s.minutes += minutes * share;
      s.value += (value ?? 0) * share;
      if (minutes >= 15 && value) {
        s.valueWithTime += value * share;
        s.minutesWithValue += minutes * share;
      }
      services.set(key, s);
    }
  }
  const avg = (list: number[]) => (list.length ? round2(list.reduce((a, b) => a + b, 0) / list.length) : null);

  return {
    totals: {
      expenses: round2(totalExpenses),
      net_rate: rateMinutes >= 15 ? round2((rateValue - rateExpenses) / (rateMinutes / 60)) : null,
      projects: leads.length,
      completed: leads.filter((l) => l.project_completed_at).length,
      minutes: Math.round([...minutesByLead.entries()].filter(([id]) => leads.some((l) => l.id === id)).reduce((a, [, m]) => a + m, 0)),
      rate: rateMinutes >= 15 ? round2(rateValue / (rateMinutes / 60)) : null,
      avg_days: avg(completedDays),
      avg_minutes: avg(completedMinutes),
    },
    by_service: [...services.entries()]
      .map(([service, s]) => ({
        service,
        projects: s.projects,
        minutes: Math.round(s.minutes),
        value: round2(s.value),
        rate: hourlyRate(s.valueWithTime, s.minutesWithValue),
      }))
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.value - a.value),
    by_client: clients.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || (b.value ?? 0) - (a.value ?? 0)).slice(0, 15),
    monthly: months.map((month) => ({
      month,
      minutes: Math.round(minutesByMonth.get(month) ?? 0),
      received: round2(receivedByMonth.get(month) ?? 0),
    })),
  };
}
