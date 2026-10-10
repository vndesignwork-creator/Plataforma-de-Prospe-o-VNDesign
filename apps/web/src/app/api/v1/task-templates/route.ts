import { TaskTemplateCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createTemplate, listTemplates } from '@/server/services/tasks';

/** GET /api/v1/task-templates — listas-modelo de tarefas (uma por serviço, editáveis). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listTemplates(ctx) }));

/** POST /api/v1/task-templates — nova lista-modelo. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, TaskTemplateCreateSchema);
  return json({ data: await createTemplate(ctx, input) }, { status: 201 });
});
