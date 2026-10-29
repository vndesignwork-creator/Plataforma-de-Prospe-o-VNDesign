import { apiRoute, json } from '@/server/http';
import { leadCityCounts } from '@/server/services/leads';

/** GET /api/v1/leads/cities — cidades dos leads, com o número de leads (para sugerir no filtro "Cidade"). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await leadCityCounts(ctx) }));
