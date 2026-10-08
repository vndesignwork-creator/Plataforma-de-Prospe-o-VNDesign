import { addDays, todayIso, type Dashboard, type Lead, type Today } from '@vndesign/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { LEAD_SELECT } from './leads';

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
  const { data, error } = await client
    .from('leads')
    .select(LEAD_SELECT)
    .eq('workspace_id', workspaceId)
    .is('anonymized_at', null)
    .not('status', 'in', '(cliente,sem_interesse)')
    .not('next_action_on', 'is', null)
    .lte('next_action_on', addDays(today, 7))
    .order('next_action_on', { ascending: true })
    .order('number', { ascending: true })
    .limit(200);
  if (error) throw fromPostgrest(error);
  const leads = (data ?? []) as unknown as Lead[];
  return {
    today,
    overdue: leads.filter((l) => l.next_action_on! < today),
    due_today: leads.filter((l) => l.next_action_on === today),
    upcoming: leads.filter((l) => l.next_action_on! > today),
  };
}

/** Lista "Hoje": follow-ups em atraso, para hoje e nos próximos 7 dias. */
export function getToday(ctx: ApiContext): Promise<Today> {
  return fetchToday(ctx.supabase, ctx.workspaceId);
}
