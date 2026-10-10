import { ServiceUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteService, updateService } from '@/server/services/service-catalog';

type Params = { id: string };

/** PATCH /api/v1/services/{id} — editar, esconder ({ "archived": true }) ou voltar a mostrar. */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ServiceUpdateSchema);
  return json({ data: await updateService(ctx, parseId(id, 'Serviço'), input) });
});

/** DELETE /api/v1/services/{id} — só se nenhum lead o tiver (senão, esconder). */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteService(ctx, parseId(id, 'Serviço'));
  return new Response(null, { status: 204 });
});
