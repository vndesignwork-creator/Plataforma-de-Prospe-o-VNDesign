import { apiRoute, json } from '@/server/http';
import { teamNames } from '@/server/services/team';

/** GET /api/v1/team/names — nomes e papéis dos membros (para escolher o responsável de um lead). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await teamNames(ctx) }));
