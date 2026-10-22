import { apiRoute, parseId } from '@/server/http';
import { endMySession } from '@/server/services/sessions';

/** DELETE /api/v1/me/sessions/{id} — terminar uma sessão (o aparelho deixa de entrar ao fim de, no máximo, 1 hora). */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await endMySession(ctx, parseId(id, 'Sessão não encontrada'));
  return new Response(null, { status: 204 });
});
