import { TaskListCreateSchema, TaskListsQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseJson, parseQuery } from '@/server/http';
import { createTaskList, listArchivedTaskLists, listTaskLists } from '@/server/services/tasks';

/**
 * GET /api/v1/task-lists — as listas (cartões com título) da página Tarefas: as da pessoa,
 * as partilhadas com a equipa e as antigas. ?archived=1 — as arquivadas, com as tarefas delas.
 */
export const GET = apiRoute(async (req, ctx) =>
  parseQuery(req, TaskListsQuerySchema).archived ? json({ data: await listArchivedTaskLists(ctx) }) : json({ data: await listTaskLists(ctx) }),
);

/** POST /api/v1/task-lists — nova lista com título (e, se vierem, as primeiras tarefas); shared = partilhada com a equipa. */
export const POST = apiRoute(async (req, ctx) => json({ data: await createTaskList(ctx, await parseJson(req, TaskListCreateSchema)) }, { status: 201 }));
