/**
 * Estatísticas: este mês (ou esta semana) até hoje contra o período anterior
 * até ao mesmo dia. Cada lead conta uma vez em cada fase a que chegou no período
 * (pela linha do tempo); mais os leads novos, os contactados (data do 1.º
 * contacto), as reuniões marcadas e o recebido nos pagamentos.
 */
import { addDays, comparePeriods, todayIso, type CohortFunnel, type CompareMetric, type ComparePeriod, type PeriodCompare } from '@vndesign/core';
import type { ApiContext } from '../context';
import { fromPostgrest } from '../http';
import { statsPeriod } from './dashboard';
import { getSettings } from './workspace';

type Range = { from: string; to: string };

/** Os mesmos números do Dashboard (stats_period): leads distintos em cada fase, dias de Lisboa. */
async function metricsFor(ctx: ApiContext, range: Range, features: { meetings: boolean; payments: boolean }): Promise<Partial<Record<CompareMetric, number>>> {
  const n = await statsPeriod(ctx, range.from, range.to);
  return {
    new_leads: n.new_leads,
    contacted: n.contacted,
    replied: n.replied,
    ...(features.meetings ? { meetings: n.meetings } : {}),
    proposals: n.proposals,
    won: n.won,
    ...(features.payments ? { received: n.received } : {}),
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

/** Funil por período: dos leads que entraram nos últimos N dias, até onde chegaram (stats_cohort_funnel). */
export async function cohortFunnel(ctx: ApiContext, days: number): Promise<CohortFunnel> {
  const from = addDays(todayIso(), -days);
  const { data, error } = await ctx.supabase.rpc('stats_cohort_funnel', { p_workspace_id: ctx.workspaceId, p_from: from });
  if (error) throw fromPostgrest(error);
  const rows = (data ?? []) as { stage: CohortFunnel['stages'][number]['stage']; reached: number; avg_days: number | string | null }[];
  return { from, stages: rows.map((r) => ({ stage: r.stage, reached: Number(r.reached), avg_days: r.avg_days === null ? null : Number(r.avg_days) })) };
}
