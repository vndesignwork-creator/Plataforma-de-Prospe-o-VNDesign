import { LeadTaskCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createTask, listTasks } from '@/server/services/tasks';

type Params = { id: string };

/** GET /api/v1/leads/{id}/tasks — tarefas do lead (por fazer e concluídas). */
export const GET = apiRoute<Params>(
  async (_req, ctx, { id }) => json({ data: await listTasks(ctx, parseId(id)) }),
  { token: 'leads:read' },
);

/** POST /api/v1/leads/{id}/tasks — nova tarefa (fica no fim da lista). */
export const POST = apiRoute<Params>(
  async (req, ctx, { id }) => {
    const input = await parseJson(req, LeadTaskCreateSchema);
    return json({ data: await createTask(ctx, parseId(id), input) }, { status: 201 });
  },
  { token: 'leads:write' },
);
