import { apiRoute, parseId } from '@/server/http';
import { deleteTimeEntry } from '@/server/services/project-tools';

/** DELETE /api/v1/time-entries/{id} */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteTimeEntry(ctx, parseId(id, 'Registo'));
  return new Response(null, { status: 204 });
});
