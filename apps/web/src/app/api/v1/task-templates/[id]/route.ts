import { TaskTemplateUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteTemplate, updateTemplate } from '@/server/services/tasks';

type Params = { id: string };

/** PATCH /api/v1/task-templates/{id} */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const patch = await parseJson(req, TaskTemplateUpdateSchema);
  return json({ data: await updateTemplate(ctx, parseId(id, 'Lista'), patch) });
});

/** DELETE /api/v1/task-templates/{id} — as tarefas já criadas nos leads ficam. */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteTemplate(ctx, parseId(id, 'Lista'));
  return new Response(null, { status: 204 });
});
