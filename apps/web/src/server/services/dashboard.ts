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
import { selectInBatches } from '../batch';
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

async function periodNumbers(ctx: ApiContext, from: string, to: string): Promise<DashboardPeriodNumbers['current']> {
  const end = addDays(to, 1);
  const leads = () => ctx.supabase.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.workspaceId).is('anonymized_at', null);
  const [created, contacted, wonRows] = await Promise.all([
    leads().gte('created_at', from).lt('created_at', end),
    leads().gte('first_contact_on', from).lte('first_contact_on', to),
    // Quem passou a Cliente no período (pela linha do tempo; conta cada lead uma vez).
    ctx.supabase
      .from('lead_activities')
      .select('lead_id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'status_changed')
      .eq('payload->>to', 'cliente')
      .gte('created_at', from)
      .lt('created_at', end)
      .limit(5000),
  ]);
  for (const res of [created, contacted, wonRows]) if (res.error) throw fromPostgrest(res.error);
  const wonIds = [...new Set(((wonRows.data ?? []) as { lead_id: string }[]).map((w) => w.lead_id))];
  const values = await selectInBatches<{ estimated_value: number | null }>(wonIds, (batch) =>
    ctx.supabase.from('leads').select('estimated_value').in('id', batch),
  );
  return {
    new_leads: created.count ?? 0,
    contacted: contacted.count ?? 0,
    won: wonIds.length,
    value_won: values.reduce((sum, l) => sum + Number(l.estimated_value ?? 0), 0),
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
