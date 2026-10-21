import { ProjectDeliverableUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteDeliverable, updateDeliverable } from '@/server/services/project-tools';

/** PATCH /api/v1/deliverables/{id} — mudar o nome, o link ou o estado (enviada, aprovada). */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProjectDeliverableUpdateSchema);
  return json({ data: await updateDeliverable(ctx, parseId(id, 'Entrega não encontrada'), input) });
});

/** DELETE /api/v1/deliverables/{id} */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteDeliverable(ctx, parseId(id, 'Entrega não encontrada'));
  return new Response(null, { status: 204 });
});
