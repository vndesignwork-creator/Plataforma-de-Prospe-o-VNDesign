import { apiRoute, json } from '@/server/http';
import { recurringSummary } from '@/server/services/renewals';

/** GET /api/v1/renewals/summary — receita recorrente por mês e as renovações dos próximos 60 dias. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await recurringSummary(ctx) }));
