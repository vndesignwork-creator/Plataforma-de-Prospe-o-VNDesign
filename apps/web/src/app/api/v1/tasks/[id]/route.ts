import { LeadTaskUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteTask, updateTask } from '@/server/services/tasks';

type Params = { id: string };

/** PATCH /api/v1/tasks/{id} — editar, concluir ({ done: true }) ou reabrir. */
export const PATCH = apiRoute<Params>(
  async (req, ctx, { id }) => {
    const patch = await parseJson(req, LeadTaskUpdateSchema);
    return json({ data: await updateTask(ctx, parseId(id, 'Tarefa'), patch) });
  },
  { token: 'leads:write' },
);

/** DELETE /api/v1/tasks/{id} */
export const DELETE = apiRoute<Params>(
  async (_req, ctx, { id }) => {
    await deleteTask(ctx, parseId(id, 'Tarefa'));
    return new Response(null, { status: 204 });
  },
  { token: 'leads:write' },
);
