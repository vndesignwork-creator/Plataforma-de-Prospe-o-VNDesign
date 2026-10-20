import { apiRoute, json, parseId } from '@/server/http';
import { getLeadGenerationRun } from '@/server/services/lead-generation';

/** GET /api/v1/lead-generation/{id} — estado e empresas encontradas. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await getLeadGenerationRun(ctx, parseId(id)) }));
