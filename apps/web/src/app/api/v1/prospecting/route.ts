import { ProspectingQuerySchema } from '@vndesign/core';
import { apiRoute, json } from '@/server/http';
import { getProspectingQueue } from '@/server/services/prospecting';

/**
 * GET /api/v1/prospecting?filter=all|opened|follow_up|new|missing&mode=email|phone — leads a
 * contactar agora, pela ordem da sessão de prospeção, e quantos há em cada separador.
 */
export const GET = apiRoute(async (req, ctx) => {
  const params = new URL(req.url).searchParams;
  const { filter, mode } = ProspectingQuerySchema.parse({ filter: params.get('filter') ?? undefined, mode: params.get('mode') ?? undefined });
  return json({ data: await getProspectingQueue(ctx, filter, mode) });
});
