import { LeadListQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { getMapData } from '@/server/services/geo';

/** GET /api/v1/map — leads com coordenadas (aceita os filtros de /leads) e contagens. */
export const GET = apiRoute(async (req, ctx) => {
  const query = parseQuery(req, LeadListQuerySchema);
  return json({ data: await getMapData(ctx, query) });
}, { token: 'leads:read' });
