import { PeriodCompareQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { comparePeriodStats } from '@/server/services/period-compare';

/** GET /api/v1/stats/compare?period=month|week — este mês/semana até hoje contra o anterior até ao mesmo dia. */
export const GET = apiRoute(async (req, ctx) => json({ data: await comparePeriodStats(ctx, parseQuery(req, PeriodCompareQuerySchema).period) }));
