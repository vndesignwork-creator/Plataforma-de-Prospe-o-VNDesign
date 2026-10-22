import { addDays, todayIso, type Dashboard, type Lead, type Today } from '@vndesign/core';
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
  const [overdue, dueToday, upcoming] = await Promise.all([
    sorted(base().lt('next_action_on', today)),
    sorted(base().eq('next_action_on', today)),
    sorted(base().gt('next_action_on', today).lte('next_action_on', addDays(today, 7))),
  ]);
  for (const r of [overdue, dueToday, upcoming]) if (r.error) throw fromPostgrest(r.error);
  const rows = (r: { data: unknown }) => (r.data ?? []) as unknown as Lead[];
  return {
    today,
    overdue: rows(overdue),
    due_today: rows(dueToday),
    upcoming: rows(upcoming),
    tasks: await fetchTodayTasks(client, workspaceId, today),
  };
}

/** Os leads com maior prioridade (pontuação), em pipeline. */
export async function fetchHotLeads(client: SupabaseClient, workspaceId: string, limit = 8): Promise<Lead[]> {
  const { data, error } = await client
    .from('leads')
    .select(LEAD_SELECT)
    .eq('workspace_id', workspaceId)
    .is('anonymized_at', null)
    .is('archived_at', null)
    .not('status', 'in', '(cliente,sem_interesse,em_pausa)')
    .gt('score', 0)
    .order('score', { ascending: false })
    .order('number', { ascending: false })
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
  return { ...today, hot, meetings, opened };
}
