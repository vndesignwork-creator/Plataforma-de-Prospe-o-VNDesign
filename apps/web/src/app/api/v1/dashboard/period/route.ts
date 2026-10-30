import { DashboardPeriodQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { getDashboardPeriod } from '@/server/services/dashboard';

/** GET /api/v1/dashboard/period?period=month|30d — leads novos, contactados e clientes do período, com o período anterior. */
export const GET = apiRoute(async (req, ctx) => {
  const { period } = parseQuery(req, DashboardPeriodQuerySchema);
  return json({ data: await getDashboardPeriod(ctx, period) });
});
