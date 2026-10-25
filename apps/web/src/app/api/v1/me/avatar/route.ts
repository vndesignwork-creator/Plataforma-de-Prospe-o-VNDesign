import { ApiError, apiRoute, json } from '@/server/http';
import { removeAvatar, setAvatar } from '@/server/services/profile';

/** POST /api/v1/me/avatar — foto nova (multipart, campo "file": JPEG, PNG ou WebP até 1 MB). */
export const POST = apiRoute(async (req, ctx) => {
  const form = await req.formData().catch(() => {
    throw new ApiError(422, 'Pedido inválido', 'Envia a foto como multipart/form-data.');
  });
  const file = form.get('file');
  return json({ data: await setAvatar(ctx, file instanceof File ? file : null) });
});

/** DELETE /api/v1/me/avatar — tirar a foto (voltam as iniciais). */
export const DELETE = apiRoute(async (_req, ctx) => json({ data: await removeAvatar(ctx) }));
