import { TaskCloseOpenSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { closeOpenTasks } from '@/server/services/tasks';

/**
 * POST /api/v1/tasks/close-open — conclui ou apaga as tarefas por fazer de vários leads
 * (ex.: ao passarem a "Sem interesse"). Concluir não cria a seguinte das que se repetem.
 */
export const POST = apiRoute(async (req, ctx) => {
  const { lead_ids, action } = await parseJson(req, TaskCloseOpenSchema);
  return json({ data: { count: await closeOpenTasks(ctx, lead_ids, action) } });
});
