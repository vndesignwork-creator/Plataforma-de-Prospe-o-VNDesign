import { GoalProgressQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { getGoalProgress } from '@/server/services/goals';

/**
 * GET /api/v1/goals?month=AAAA-MM — metas do mês e o progresso (da equipa e da pessoa).
 * As metas mudam-se em PATCH /api/v1/settings { goals }.
 */
export const GET = apiRoute(async (req, ctx) => json({ data: await getGoalProgress(ctx, parseQuery(req, GoalProgressQuerySchema).month) }));
