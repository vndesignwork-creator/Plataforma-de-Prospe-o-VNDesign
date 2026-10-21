import { ProjectShareSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { setProjectShare } from '@/server/services/project-tools';

/** POST /api/v1/leads/{id}/project/share — ligar, desligar ou renovar o link da página do cliente. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProjectShareSchema);
  return json({ data: await setProjectShare(ctx, parseId(id), input) });
});
