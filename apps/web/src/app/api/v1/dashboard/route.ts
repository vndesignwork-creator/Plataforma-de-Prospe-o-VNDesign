import { apiRoute, json } from '@/server/http';
import { getDashboard } from '@/server/services/dashboard';

/** GET /api/v1/dashboard — resumo, contagens, funil e evolução semanal. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getDashboard(ctx) }));
