import { apiRoute, parseId } from '@/server/http';
import { resolveProblemById } from '@/server/services/platform';

type Params = { id: string };

/** POST /api/v1/platform/problems/{id}/resolve — marcar o problema como resolvido. */
export const POST = apiRoute<Params>(async (_req, ctx, { id }) => {
  await resolveProblemById(ctx, parseId(id, 'Problema não encontrado'));
  return new Response(null, { status: 204 });
});
