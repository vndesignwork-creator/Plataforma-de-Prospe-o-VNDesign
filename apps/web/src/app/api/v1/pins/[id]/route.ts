import { DeliverablePinUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deletePin, updatePin } from '@/server/services/project-tools';

const NOT_FOUND = 'Comentário não encontrado';

/** PATCH /api/v1/pins/{id} — mudar o texto ou marcar como resolvido. */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, DeliverablePinUpdateSchema);
  return json({ data: await updatePin(ctx, parseId(id, NOT_FOUND), input) });
});

/** DELETE /api/v1/pins/{id} */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deletePin(ctx, parseId(id, NOT_FOUND));
  return new Response(null, { status: 204 });
});
