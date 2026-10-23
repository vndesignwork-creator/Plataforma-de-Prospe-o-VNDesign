import { AiVisibilityRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { listVisibilityChecks, startVisibilityCheck } from '@/server/services/ai-visibility';

type Params = { id: string };

/** GET /api/v1/leads/{id}/ai-visibility — os últimos testes "Aparece nas IAs?" (mais recente primeiro). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await listVisibilityChecks(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/ai-visibility — faz as perguntas a uma IA com pesquisa (em segundo plano). */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, AiVisibilityRequestSchema);
  return json({ data: await startVisibilityCheck(ctx, parseId(id), input) }, { status: 202 });
});
