import { ServiceCategoryCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createServiceCategory, listServiceCategories } from '@/server/services/service-categories';

/** GET /api/v1/service-categories — pela ordem definida, com o n.º de serviços e pacotes. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listServiceCategories(ctx) }), { token: 'leads:read' });

/** POST /api/v1/service-categories — a chave é criada a partir do nome. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, ServiceCategoryCreateSchema);
  return json({ data: await createServiceCategory(ctx, input) }, { status: 201 });
});
