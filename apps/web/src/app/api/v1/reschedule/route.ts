import { RescheduleSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { reschedule } from '@/server/services/reschedule';

/**
 * POST /api/v1/reschedule — muda a próxima ação (follow-up) de vários leads e o
 * prazo de várias tarefas de uma vez (até 200 de cada). Serve também para anular.
 */
export const POST = apiRoute(async (req, ctx) => json({ data: await reschedule(ctx, await parseJson(req, RescheduleSchema)) }));
