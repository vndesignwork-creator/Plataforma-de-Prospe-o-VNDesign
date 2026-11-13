import { AiCreditUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { updateAiCredit } from '@/server/services/ai-usage';

/** PUT /api/v1/ai/credit — o valor carregado no fornecedor de IA e o limite do aviso "créditos a acabar". */
export const PUT = apiRoute(async (req, ctx) => json({ data: await updateAiCredit(ctx, await parseJson(req, AiCreditUpdateSchema)) }));
