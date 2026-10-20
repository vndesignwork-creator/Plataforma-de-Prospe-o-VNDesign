import { AiProviderCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createAiProvider, listAiProviders } from '@/server/ai/providers';

/** GET /api/v1/ai-providers — fornecedores de IA (a chave nunca é devolvida). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listAiProviders(ctx) }));

/** POST /api/v1/ai-providers — juntar uma chave (Anthropic, OpenAI, OpenRouter ou compatível). */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, AiProviderCreateSchema);
  return json({ data: await createAiProvider(ctx, input) }, { status: 201 });
});
