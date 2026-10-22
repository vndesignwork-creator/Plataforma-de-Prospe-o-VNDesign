import { apiRoute, json, parseId } from '@/server/http';
import { listEmailTracking } from '@/server/services/email-tracking';

/** GET /api/v1/leads/{id}/email-tracking — emails enviados pela plataforma com as aberturas e cliques. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await listEmailTracking(ctx, parseId(id)) }));
