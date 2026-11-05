import { TaskListCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createTaskList, listTaskLists } from '@/server/services/tasks';

/** GET /api/v1/task-lists — as listas (cartões com título) da página Tarefas. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listTaskLists(ctx) }));

/** POST /api/v1/task-lists — nova lista com título (e, se vierem, as primeiras tarefas). */
export const POST = apiRoute(async (req, ctx) => json({ data: await createTaskList(ctx, await parseJson(req, TaskListCreateSchema)) }, { status: 201 }));
