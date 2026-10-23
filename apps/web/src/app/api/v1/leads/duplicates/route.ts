import { apiRoute, json } from '@/server/http';
import { listDuplicateGroups } from '@/server/services/duplicates';

/** GET /api/v1/leads/duplicates — grupos de leads com o mesmo email, site ou nome (limpeza em lote). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listDuplicateGroups(ctx) }));
