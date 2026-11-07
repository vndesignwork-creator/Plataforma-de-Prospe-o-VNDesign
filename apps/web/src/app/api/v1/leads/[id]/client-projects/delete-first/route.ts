import { DeleteFirstProjectSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteFirstClientProject } from '@/server/services/client-projects';

/** POST /api/v1/leads/{id}/client-projects/delete-first — apagar o primeiro projeto (o indicado em keep_id fica como principal). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { keep_id } = await parseJson(req, DeleteFirstProjectSchema);
  return json({ data: await deleteFirstClientProject(ctx, parseId(id), keep_id) });
});
