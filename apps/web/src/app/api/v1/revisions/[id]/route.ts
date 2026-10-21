import { apiRoute, parseId } from '@/server/http';
import { deleteRevision } from '@/server/services/project-tools';

/** DELETE /api/v1/revisions/{id} */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteRevision(ctx, parseId(id, 'Revisão não encontrada'));
  return new Response(null, { status: 204 });
});
