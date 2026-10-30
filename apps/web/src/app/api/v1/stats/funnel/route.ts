import { CohortFunnelQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { cohortFunnel } from '@/server/services/period-compare';

/** GET /api/v1/stats/funnel?days=30|90|365 — dos leads que entraram nesse período, até onde chegaram e em quanto tempo. */
export const GET = apiRoute(async (req, ctx) => json({ data: await cohortFunnel(ctx, Number(parseQuery(req, CohortFunnelQuerySchema).days)) }));
