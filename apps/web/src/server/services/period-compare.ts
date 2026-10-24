/**
 * Estatísticas: este mês (ou esta semana) até hoje contra o período anterior
 * até ao mesmo dia. Contam as mudanças de estado na linha do tempo (o mesmo
 * lead pode contar em várias), os leads criados, as reuniões marcadas e o
 * recebido nos pagamentos.
 */
import { addDays, comparePeriods, todayIso, type CompareMetric, type ComparePeriod, type PeriodCompare } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { lisbonMidnight } from './prospecting';
import { getSettings } from './workspace';

type Range = { from: string; to: string };

async function metricsFor(ctx: ApiContext, range: Range, features: { meetings: boolean; payments: boolean }): Promise<Partial<Record<CompareMetric, number>>> {
  const ws = ctx.workspaceId;
  const start = lisbonMidnight(range.from);
  const end = lisbonMidnight(addDays(range.to, 1));
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await q;
    if (error) throw fromPostgrest(error as Parameters<typeof fromPostgrest>[0]);
    return n ?? 0;
  };
  const statusTo = (status: string) =>
    count(
      ctx.supabase
        .from('lead_activities')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ws)
        .eq('type', 'status_changed')
        .eq('payload->>to', status)
        .gte('created_at', start)
        .lt('created_at', end),
    );
  const [newLeads, contacted, replied, proposals, won, meetings, paid] = await Promise.all([
    count(ctx.supabase.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).gte('created_at', start).lt('created_at', end)),
    statusTo('contactado'),
    statusTo('respondeu'),
    statusTo('proposta_enviada'),
    statusTo('cliente'),
    features.meetings
      ? count(ctx.supabase.from('lead_meetings').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).is('canceled_at', null).gte('created_at', start).lt('created_at', end))
      : Promise.resolve(null),
    features.payments
      ? ctx.supabase.from('lead_payments').select('amount').eq('workspace_id', ws).gte('paid_on', range.from).lte('paid_on', range.to).limit(5000)
      : Promise.resolve(null),
  ]);
  if (paid && 'error' in paid && paid.error) throw fromPostgrest(paid.error);
  return {
    new_leads: newLeads,
    contacted,
    replied,
    ...(meetings === null ? {} : { meetings }),
    proposals,
    won,
    ...(paid ? { received: ((paid.data ?? []) as { amount: number | string }[]).reduce((sum, p) => sum + Number(p.amount), 0) } : {}),
  };
}

export async function comparePeriodStats(ctx: ApiContext, period: ComparePeriod): Promise<PeriodCompare> {
  const ranges = comparePeriods(period, todayIso());
  const features = (await getSettings(ctx)).features;
  const f = { meetings: !!features.meetings, payments: !!features.payments };
  const [current, previous] = await Promise.all([metricsFor(ctx, ranges.current, f), metricsFor(ctx, ranges.previous, f)]);
  const metrics = (Object.keys(current) as CompareMetric[]).map((key) => ({ key, current: current[key] ?? 0, previous: previous[key] ?? 0 }));
  return { period, ...ranges, metrics };
}
