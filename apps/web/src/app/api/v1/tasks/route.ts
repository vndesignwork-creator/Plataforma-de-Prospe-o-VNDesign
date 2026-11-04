import { TaskCreateSchema, TaskListQuerySchema, TaskSearchQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseJson, parseQuery } from '@/server/http';
import { createTask, listOpenTasks, searchTasks } from '@/server/services/tasks';

/**
 * GET /api/v1/tasks?q= — pesquisa rápida nas tarefas de todos os leads (Ctrl+K).
 * GET /api/v1/tasks?assigned=me|none|all|{id}&state=open|done — tarefas por fazer (pelo prazo) ou concluídas (página Tarefas).
 */
export const GET = apiRoute(async (req, ctx) =>
  new URL(req.url).searchParams.has('q')
    ? json({ data: await searchTasks(ctx, parseQuery(req, TaskSearchQuerySchema)) })
    : json({ data: await listOpenTasks(ctx, parseQuery(req, TaskListQuerySchema)) }),
);

/** POST /api/v1/tasks — nova tarefa num lead/projeto (lead_id) ou solta (sem lead_id). */
export const POST = apiRoute(async (req, ctx) => {
  const { lead_id, ...input } = await parseJson(req, TaskCreateSchema);
  // O prospetor fica com as tarefas soltas que cria (vê só as dele).
  if (!lead_id && ctx.role === 'prospector' && input.assigned_to === undefined) input.assigned_to = ctx.user.id;
  return json({ data: await createTask(ctx, lead_id ?? null, input) }, { status: 201 });
});
