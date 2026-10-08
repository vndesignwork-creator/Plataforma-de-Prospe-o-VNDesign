import { LeadListQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { getBoard } from '@/server/services/board';

/** GET /api/v1/board — Kanban: colunas por estado (filtros: q, sector, channel, city…). */
export const GET = apiRoute(async (req, ctx) => {
  const query = parseQuery(req, LeadListQuerySchema);
  return json({ data: await getBoard(ctx, query) });
});
