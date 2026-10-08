import { apiRoute, parseId } from '@/server/http';
import { deleteNote } from '@/server/services/activities';

/** DELETE /api/v1/leads/{id}/activities/{activityId} — apaga uma nota própria. */
export const DELETE = apiRoute<{ id: string; activityId: string }>(async (_req, ctx, { id, activityId }) => {
  await deleteNote(ctx, parseId(id), parseId(activityId, 'Nota'));
  return new Response(null, { status: 204 });
});
