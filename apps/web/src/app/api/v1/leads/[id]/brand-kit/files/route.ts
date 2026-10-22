import { ApiError, apiRoute, json, parseId } from '@/server/http';
import { addBrandFiles } from '@/server/services/brand-kit';

export const maxDuration = 60;

/** POST /api/v1/leads/{id}/brand-kit/files — juntar ficheiros ao kit (multipart, campo "files"; até 25 MB cada). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const form = await req.formData().catch(() => {
    throw new ApiError(422, 'Pedido inválido', 'Envia os ficheiros como multipart/form-data.');
  });
  return json({ data: await addBrandFiles(ctx, parseId(id), form) }, { status: 201 });
});
