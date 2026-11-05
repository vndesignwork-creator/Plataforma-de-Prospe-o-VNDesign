import { TaskReorderSchema } from '@vndesign/core';
import { apiRoute, parseJson } from '@/server/http';
import { reorderAnyTasks } from '@/server/services/tasks';

/** POST /api/v1/tasks/reorder — nova ordem das tarefas de um cartão (lead, lista ou soltas). */
export const POST = apiRoute(async (req, ctx) => {
  await reorderAnyTasks(ctx, (await parseJson(req, TaskReorderSchema)).ids);
  return new Response(null, { status: 204 });
});
