import { apiRoute, json } from '@/server/http';
import { getOriginStats } from '@/server/services/dashboard';

/** GET /api/v1/dashboard/origins — de onde vêm os leads: por origem, leads, clientes e valor ganho (desde sempre). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getOriginStats(ctx) }));
