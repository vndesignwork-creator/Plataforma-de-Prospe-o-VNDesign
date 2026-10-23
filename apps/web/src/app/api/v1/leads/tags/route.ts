import { apiRoute, json } from '@/server/http';
import { leadTagCounts } from '@/server/services/leads';

/** GET /api/v1/leads/tags — etiquetas usadas, com o número de leads (para sugerir e filtrar). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await leadTagCounts(ctx) }));
