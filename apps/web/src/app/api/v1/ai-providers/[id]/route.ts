import { AiProviderUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteAiProvider, updateAiProvider } from '@/server/ai/providers';

/** PATCH /api/v1/ai-providers/{id} — mudar o nome, a chave ou o endereço. */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, AiProviderUpdateSchema);
  return json({ data: await updateAiProvider(ctx, parseId(id), input) });
});

/** DELETE /api/v1/ai-providers/{id} — apagar (as funções que o usavam voltam à chave do servidor). */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteAiProvider(ctx, parseId(id, 'Fornecedor'));
  return new Response(null, { status: 204 });
});
