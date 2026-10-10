import { ServiceReorderSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { reorderServiceCategories } from '@/server/services/service-categories';

/** POST /api/v1/service-categories/reorder — { "ids": [...] } pela ordem pretendida. */
export const POST = apiRoute(async (req, ctx) => {
  const { ids } = await parseJson(req, ServiceReorderSchema);
  return json({ data: await reorderServiceCategories(ctx, ids) });
});
