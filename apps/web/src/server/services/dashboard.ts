import {
  STALLED_STATUSES,
  addDays,
  dashboardPeriodRange,
  todayIso,
  type Dashboard,
  type DashboardPeriod,
  type DashboardPeriodNumbers,
  type Lead,
  type Today,
} from '@vndesign/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { LEAD_SELECT } from './leads';
import { fetchTodayTasks } from './tasks';
import { fetchRecentlyOpened } from './email-tracking';
import { fetchTodayMeetings } from './meetings';

export async function getDashboard(ctx: ApiContext): Promise<Dashboard> {
  const { data, error } = await ctx.supabase.rpc('dashboard_summary', { p_workspace_id: ctx.workspaceId });
  if (error) throw fromPostgrest(error);
  const d = data as Dashboard;
  // O Postgres devolve "numeric" — garantimos números em JS.
  const num = (v: unknown) => Number(v ?? 0);
  return {
    ...d,
    totals: {
      ...d.totals,
      conversion_rate: num(d.totals.conversion_rate),
      conversion_rate_contacted: num(d.totals.conversion_rate_contacted),
      value_total: num(d.totals.value_total),
      value_won: num(d.totals.value_won),
      value_pipeline: num(d.totals.value_pipeline),
    },
    by_sector: d.by_sector.map((s) => ({ ...s, value: num(s.value) })),
  };
}

/** Os números de um período e do anterior (leads novos, contactados, clientes ganhos e o seu valor). */
export async function getDashboardPeriod(ctx: ApiContext, period: DashboardPeriod): Promise<DashboardPeriodNumbers> {
  const r = dashboardPeriodRange(period, todayIso());
  const [current, previous] = await Promise.all([periodNumbers(ctx, r.from, r.to), periodNumbers(ctx, r.prevFrom, r.prevTo)]);
  return { period, from: r.from, to: r.to, current, previous };
}

/**
 * Leads novos, contactados e clientes ganhos de um período (stats_period: leads distintos,
 * dias de Lisboa, sem anonimizados nem os projetos novos de clientes que voltam). As
 * Estatísticas → Comparar usam a mesma função, para os números baterem certo.
 */
async function periodNumbers(ctx: ApiContext, from: string, to: string): Promise<DashboardPeriodNumbers['current']> {
  const n = await statsPeriod(ctx, from, to);
  return { new_leads: n.new_leads, contacted: n.contacted, won: n.won, value_won: n.value_won };
}

export type StatsPeriod = {
  new_leads: number;
  contacted: number;
  replied: number;
  proposals: number;
  won: number;
  value_won: number;
  meetings: number;
  received: number;
};

export async function statsPeriod(ctx: ApiContext, from: string, to: string): Promise<StatsPeriod> {
  const { data, error } = await ctx.supabase.rpc('stats_period', { p_workspace_id: ctx.workspaceId, p_from: from, p_to: to });
  if (error) throw fromPostgrest(error);
  const d = (data ?? {}) as Record<keyof StatsPeriod, number | string | null>;
  const n = (k: keyof StatsPeriod) => Number(d[k] ?? 0);
  return {
    new_leads: n('new_leads'),
    contacted: n('contacted'),
    replied: n('replied'),
    proposals: n('proposals'),
    won: n('won'),
    value_won: n('value_won'),
    meetings: n('meetings'),
    received: n('received'),
  };
}

/** Lista "Hoje" para um workspace (aceita o cliente do utilizador ou o de serviço). */
export async function fetchToday(client: SupabaseClient, workspaceId: string): Promise<Today> {
  const today = todayIso();
  // Três consultas separadas: um atraso grande (ex.: folha importada com datas antigas)
  // não pode ocupar o limite e esconder os follow-ups de hoje.
  const base = () =>
    client
      .from('leads')
      .select(LEAD_SELECT)
      .eq('workspace_id', workspaceId)
      .is('anonymized_at', null)
      .is('archived_at', null)
      .not('status', 'in', '(cliente,sem_interesse)')
      .not('next_action_on', 'is', null);
  const sorted = <T extends ReturnType<typeof base>>(q: T) =>
    q.order('next_action_on', { ascending: true }).order('number', { ascending: true }).limit(500);
  const [overdue, dueToday, upcoming, stalled] = await Promise.all([
    sorted(base().lt('next_action_on', today)),
    sorted(base().eq('next_action_on', today)),
    sorted(base().gt('next_action_on', today).lte('next_action_on', addDays(today, 7))),
    // Em conversa sem próximo passo (sem data): os que estão assim há mais tempo primeiro.
    client
      .from('leads')
      .select(LEAD_SELECT)
      .eq('workspace_id', workspaceId)
      .is('anonymized_at', null)
      .is('archived_at', null)
      .in('status', [...STALLED_STATUSES])
      .is('next_action_on', null)
      .order('status_changed_at', { ascending: true })
      .limit(200),
  ]);
  for (const r of [overdue, dueToday, upcoming, stalled]) if (r.error) throw fromPostgrest(r.error);
  const rows = (r: { data: unknown }) => (r.data ?? []) as unknown as Lead[];
  return {
    today,
    overdue: rows(overdue),
    due_today: rows(dueToday),
    upcoming: rows(upcoming),
    stalled: rows(stalled),
    tasks: await fetchTodayTasks(client, workspaceId, today),
  };
}

/**
 * Os leads com maior prioridade (pontuação), em pipeline. Com a mesma pontuação: primeiro os que
 * nunca foram contactados e, entre esses, os que esperam há mais tempo.
 */
export async function fetchHotLeads(client: SupabaseClient, workspaceId: string, limit = 15): Promise<Lead[]> {
  const { data, error } = await client
    .from('leads')
    .select(LEAD_SELECT)
    .eq('workspace_id', workspaceId)
    .is('anonymized_at', null)
    .is('archived_at', null)
    .not('status', 'in', '(cliente,sem_interesse,em_pausa)')
    .gt('score', 0)
    .order('score', { ascending: false })
    .order('first_contact_on', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(limit);
  // Antes da migração 20261028000100 não há pontuação.
  if (error?.code === '42703') return [];
  if (error) throw fromPostgrest(error);
  return (data ?? []) as unknown as Lead[];
}

/** Lista "Hoje": follow-ups em atraso, para hoje e nos próximos 7 dias, reuniões e os leads mais quentes. */
export async function getToday(ctx: ApiContext): Promise<Today> {
  const [today, hot, meetings, opened] = await Promise.all([
    fetchToday(ctx.supabase, ctx.workspaceId),
    fetchHotLeads(ctx.supabase, ctx.workspaceId),
    fetchTodayMeetings(ctx.supabase, ctx.workspaceId),
    fetchRecentlyOpened(ctx.supabase, ctx.workspaceId),
  ]);
  if (ctx.role !== 'prospector') return { ...today, hot, meetings, opened };
  // Equipa de prospeção: só os leads de que é responsável.
  const { data: own, error } = await ctx.supabase.from('leads').select('id').eq('workspace_id', ctx.workspaceId).eq('assigned_to', ctx.user.id).limit(10_000);
  if (error) throw fromPostgrest(error);
  const mine = new Set(((own ?? []) as { id: string }[]).map((l) => l.id));
  const byLead = <T extends { id: string }>(list: T[]) => list.filter((l) => mine.has(l.id));
  const byRef = <T extends { lead: { id: string } }>(list: T[]) => list.filter((x) => mine.has(x.lead.id));
  return {
    ...today,
    overdue: byLead(today.overdue),
    due_today: byLead(today.due_today),
    upcoming: byLead(today.upcoming),
    stalled: byLead(today.stalled ?? []),
    tasks: today.tasks
      ? { ...today.tasks, overdue: byRef(today.tasks.overdue), due_today: byRef(today.tasks.due_today), upcoming: byRef(today.tasks.upcoming) }
      : today.tasks,
    hot: byLead(hot),
    meetings: byRef(meetings),
    opened: byRef(opened),
  };
}
