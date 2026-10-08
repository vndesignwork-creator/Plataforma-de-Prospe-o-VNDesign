import { apiRoute, json } from '@/server/http';
import { getMe } from '@/server/services/workspace';

/** GET /api/v1/me — utilizador, workspace e definições. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getMe(ctx) }));
