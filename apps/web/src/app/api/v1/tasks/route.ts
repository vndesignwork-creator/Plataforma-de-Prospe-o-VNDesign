import { TaskSearchQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { searchTasks } from '@/server/services/tasks';

/** GET /api/v1/tasks?q= — pesquisa rápida nas tarefas de todos os leads (Ctrl+K). */
export const GET = apiRoute(async (req, ctx) => json({ data: await searchTasks(ctx, parseQuery(req, TaskSearchQuerySchema)) }));
