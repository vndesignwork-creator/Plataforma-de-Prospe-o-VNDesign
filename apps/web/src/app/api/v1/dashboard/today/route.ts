import { apiRoute, json } from '@/server/http';
import { getToday } from '@/server/services/dashboard';

/** GET /api/v1/dashboard/today — follow-ups em atraso, de hoje e dos próximos 7 dias. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getToday(ctx) }));
