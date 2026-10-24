import { TrashIdsSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { listTrash, purgeTrash } from '@/server/services/lead-trash';

/** GET /api/v1/leads/trash — leads apagados (reciclagem, 30 dias). Só o dono ou um administrador. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listTrash(ctx) }));

/**
 * DELETE /api/v1/leads/trash — apaga de vez: com { ids }, só esses; sem corpo,
 * esvazia a reciclagem.
 */
export const DELETE = apiRoute(async (req, ctx) => {
  const text = await req.clone().text();
  const ids = text.trim() ? (await parseJson(req, TrashIdsSchema)).ids : undefined;
  return json({ data: { deleted: await purgeTrash(ctx, ids) } });
});
