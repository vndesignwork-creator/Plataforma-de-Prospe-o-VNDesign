import { apiRoute, json } from '@/server/http';
import { profitability } from '@/server/services/profitability';

/** GET /api/v1/stats/profitability — €/hora por serviço e cliente, horas e recebido por mês, duração média. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await profitability(ctx) }));
