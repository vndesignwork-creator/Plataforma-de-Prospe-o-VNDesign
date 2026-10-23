import { apiRoute, json } from '@/server/http';
import { getTeam } from '@/server/services/team';

/** GET /api/v1/team — membros da equipa e convites por aceitar (dono ou administrador). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getTeam(ctx) }));
