import { apiRoute, json } from '@/server/http';
import { lostReasonCounts } from '@/server/services/leads';

/** GET /api/v1/stats/lost-reasons — leads em "Sem interesse" por motivo. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await lostReasonCounts(ctx) }));
