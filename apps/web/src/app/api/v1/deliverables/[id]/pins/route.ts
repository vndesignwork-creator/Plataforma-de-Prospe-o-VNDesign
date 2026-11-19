import { DeliverablePinCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createPin, listPins } from '@/server/services/project-tools';

const NOT_FOUND = 'Entrega não encontrada';

/** GET /api/v1/deliverables/{id}/pins — comentários em cima da imagem. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await listPins(ctx, parseId(id, NOT_FOUND)) }));

/** POST /api/v1/deliverables/{id}/pins — novo comentário num ponto da imagem. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, DeliverablePinCreateSchema);
  return json({ data: await createPin(ctx, parseId(id, NOT_FOUND), input) }, { status: 201 });
});
