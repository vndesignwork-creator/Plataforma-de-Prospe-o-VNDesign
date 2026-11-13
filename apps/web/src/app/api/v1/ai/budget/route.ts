import { AiBudgetUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { updateAiBudget } from '@/server/services/ai-usage';

/** PUT /api/v1/ai/budget — o limite de gasto mensal da IA (null = sem limite); dono e administradores. */
export const PUT = apiRoute(async (req, ctx) => json({ data: await updateAiBudget(ctx, await parseJson(req, AiBudgetUpdateSchema)) }));
