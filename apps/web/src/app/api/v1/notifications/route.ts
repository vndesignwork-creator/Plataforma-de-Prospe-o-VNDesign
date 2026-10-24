import { apiRoute, json } from '@/server/http';
import { listNotifications } from '@/server/services/team-work';

/** GET /api/v1/notifications — os meus avisos (os 30 mais recentes) e quantos estão por ler. */
export const GET = apiRoute(async (_req, ctx) => json(await listNotifications(ctx)));
