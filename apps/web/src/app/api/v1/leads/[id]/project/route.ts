import { ProjectCompleteSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { setProjectCompleted } from '@/server/services/projects';

/** POST /api/v1/leads/{id}/project — concluir ({ completed: true }) ou reabrir o projeto do cliente. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { completed } = await parseJson(req, ProjectCompleteSchema);
  return json({ data: await setProjectCompleted(ctx, parseId(id), completed) });
});
