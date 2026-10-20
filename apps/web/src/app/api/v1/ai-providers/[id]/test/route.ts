import { SERVER_AI_PROVIDER } from '@vndesign/core';
import { apiRoute, json, parseId } from '@/server/http';
import { testAiProvider } from '@/server/ai/providers';

/** POST /api/v1/ai-providers/{id}/test — confirma a chave e devolve os modelos disponíveis ("server" = chave do servidor). */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) =>
  json({ data: await testAiProvider(ctx, id === SERVER_AI_PROVIDER ? id : parseId(id, 'Fornecedor')) }),
);
