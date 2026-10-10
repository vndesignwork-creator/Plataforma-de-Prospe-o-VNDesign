import { ServiceCategoryUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteServiceCategory, updateServiceCategory } from '@/server/services/service-categories';

type Params = { id: string };

/** PATCH /api/v1/service-categories/{id} — nome, ícone ou portefólio de design. */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ServiceCategoryUpdateSchema);
  return json({ data: await updateServiceCategory(ctx, parseId(id, 'Categoria'), input) });
});

/** DELETE /api/v1/service-categories/{id} — só sem serviços nem pacotes. */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteServiceCategory(ctx, parseId(id, 'Categoria'));
  return new Response(null, { status: 204 });
});
