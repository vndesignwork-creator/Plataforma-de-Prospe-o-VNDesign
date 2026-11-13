import { recentMonths, todayIso } from '@vndesign/core';
import { ApiError, apiRoute, json } from '@/server/http';
import { accountingReport } from '@/server/services/accounting';
import { getDashboard, getOriginStats } from '@/server/services/dashboard';
import { emailStats } from '@/server/services/email-stats';
import { lostReasonCounts } from '@/server/services/leads';
import { cohortFunnel, comparePeriodStats } from '@/server/services/period-compare';
import { pomodoroStats } from '@/server/services/pomodoro';
import { profitability } from '@/server/services/profitability';
import { recurringSummary } from '@/server/services/renewals';
import { getSettings } from '@/server/services/workspace';

/**
 * GET /api/v1/stats/bundle — o que a página Estatísticas mostra ao abrir, num só pedido (em vez
 * de 10): /dashboard, /stats/compare?period=month, /stats/funnel?days=90, /dashboard/origins,
 * /stats/lost-reasons, /stats/emails?days=90, /stats/profitability, /renewals/summary,
 * /reports/accounting (mês passado) e /stats/pomodoros. Uma parte que falhe vem a null (o ecrã
 * pede-a sozinho). Só para o dono e os administradores.
 */
export const GET = apiRoute(async (_req, ctx) => {
  if (ctx.role === 'prospector') throw new ApiError(403, 'Sem acesso', 'A equipa de prospeção usa os pedidos de cada secção.');
  const features = (await getSettings(ctx)).features;
  const part = <T,>(on: boolean, run: () => Promise<T>) => (on ? run().catch(() => null) : Promise.resolve(null));
  const lastMonth = recentMonths(todayIso(), 2)[1]!;
  const [dashboard, compare, funnel, origins, lost, emails, profit, recurring, accounting, pomodoros] = await Promise.all([
    part(true, () => getDashboard(ctx)),
    part(true, () => comparePeriodStats(ctx, 'month')),
    part(true, () => cohortFunnel(ctx, 90)),
    part(true, () => getOriginStats(ctx)),
    part(true, () => lostReasonCounts(ctx)),
    part(true, () => emailStats(ctx, 90)),
    part(features.projects !== false, () => profitability(ctx)),
    part(true, () => recurringSummary(ctx)),
    part(true, () => accountingReport(ctx, lastMonth)),
    part(features.pomodoro !== false, () => pomodoroStats(ctx)),
  ]);
  return json({ data: { dashboard, compare, funnel, origins, lost_reasons: lost, emails, profitability: profit, recurring, accounting: accounting ? { month: lastMonth, report: accounting } : null, pomodoros } });
});
