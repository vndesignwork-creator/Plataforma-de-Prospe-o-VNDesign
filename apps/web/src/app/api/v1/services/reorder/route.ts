import { ServiceReorderSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { reorderServices } from '@/server/services/service-catalog';

/** POST /api/v1/services/reorder — { "ids": [...] } pela ordem pretendida. */
export const POST = apiRoute(async (req, ctx) => {
  const { ids } = await parseJson(req, ServiceReorderSchema);
  return json({ data: await reorderServices(ctx, ids) });
});
