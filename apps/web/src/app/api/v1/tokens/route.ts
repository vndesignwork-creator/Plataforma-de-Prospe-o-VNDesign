import { ApiTokenCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createToken, listTokens } from '@/server/services/tokens';

/** GET /api/v1/tokens — tokens de integração do utilizador (sem o valor). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listTokens(ctx) }));

/** POST /api/v1/tokens — cria um token; o valor completo só vem nesta resposta. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, ApiTokenCreateSchema);
  return json({ data: await createToken(ctx, input) }, { status: 201 });
});
