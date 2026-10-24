import { TrashIdsSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { restoreTrash } from '@/server/services/lead-trash';

/** POST /api/v1/leads/trash/restore — repõe leads apagados, tal como estavam ({ ids }). */
export const POST = apiRoute(async (req, ctx) => {
  const { ids } = await parseJson(req, TrashIdsSchema);
  return json({ data: { lead_ids: await restoreTrash(ctx, ids) } });
});
