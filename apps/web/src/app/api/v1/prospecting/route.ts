import { PROSPECTING_FILTERS, type ProspectingFilter } from '@vndesign/core';
import { apiRoute, json } from '@/server/http';
import { getProspectingQueue } from '@/server/services/prospecting';

/** GET /api/v1/prospecting?filter=all|opened|follow_up|new — leads a contactar agora, pela ordem da sessão de prospeção. */
export const GET = apiRoute(async (req, ctx) => {
  const raw = new URL(req.url).searchParams.get('filter') ?? 'all';
  const filter = (PROSPECTING_FILTERS as readonly string[]).includes(raw) ? (raw as ProspectingFilter) : 'all';
  return json({ data: await getProspectingQueue(ctx, filter) });
});
