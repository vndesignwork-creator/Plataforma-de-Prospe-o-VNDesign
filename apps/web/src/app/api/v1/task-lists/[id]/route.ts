import { TaskListUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteTaskList, updateTaskList } from '@/server/services/tasks';

type Params = { id: string };

/** PATCH /api/v1/task-lists/{id} — mudar o título ou a posição, partilhar com a equipa (shared) ou arquivar (archived). */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => json({ data: await updateTaskList(ctx, parseId(id, 'Lista não encontrada'), await parseJson(req, TaskListUpdateSchema)) }));

/** DELETE /api/v1/task-lists/{id} — apagar a lista e as tarefas dela. */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteTaskList(ctx, parseId(id, 'Lista não encontrada'));
  return new Response(null, { status: 204 });
});
