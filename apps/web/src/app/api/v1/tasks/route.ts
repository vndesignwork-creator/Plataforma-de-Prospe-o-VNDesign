import { TaskListQuerySchema, TaskSearchQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { listOpenTasks, searchTasks } from '@/server/services/tasks';

/**
 * GET /api/v1/tasks?q= — pesquisa rápida nas tarefas de todos os leads (Ctrl+K).
 * GET /api/v1/tasks?assigned=me|none|all|{id} — tarefas por fazer (página Tarefas), pelo prazo.
 */
export const GET = apiRoute(async (req, ctx) =>
  new URL(req.url).searchParams.has('q')
    ? json({ data: await searchTasks(ctx, parseQuery(req, TaskSearchQuerySchema)) })
    : json({ data: await listOpenTasks(ctx, parseQuery(req, TaskListQuerySchema)) }),
);
