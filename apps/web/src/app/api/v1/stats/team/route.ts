import { apiRoute, json } from '@/server/http';
import { teamStats } from '@/server/services/team';

/** GET /api/v1/stats/team — trabalho de cada pessoa nos últimos 30 dias (o prospetor só vê o seu). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await teamStats(ctx) }));
