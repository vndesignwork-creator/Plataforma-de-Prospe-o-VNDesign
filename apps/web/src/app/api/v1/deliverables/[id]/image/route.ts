import { ApiError, apiRoute, json, parseId } from '@/server/http';
import { deleteDeliverableImage, deliverableImageUrl, setDeliverableImage } from '@/server/services/project-tools';

export const maxDuration = 60;
const NOT_FOUND = 'Entrega não encontrada';

/** GET /api/v1/deliverables/{id}/image — vai dar à imagem (link temporário). */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  const url = await deliverableImageUrl(ctx, parseId(id, NOT_FOUND));
  return Response.redirect(url, 307);
});

/** POST /api/v1/deliverables/{id}/image — guardar a imagem da entrega (multipart, campo "file"). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const form = await req.formData().catch(() => {
    throw new ApiError(422, 'Pedido inválido', 'Envia a imagem como multipart/form-data.');
  });
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(422, 'Falta a imagem', 'Escolhe uma imagem.');
  return json({ data: await setDeliverableImage(ctx, parseId(id, NOT_FOUND), file) });
});

/** DELETE /api/v1/deliverables/{id}/image — tirar a imagem (e os comentários dela). */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  return json({ data: await deleteDeliverableImage(ctx, parseId(id, NOT_FOUND)) });
});
