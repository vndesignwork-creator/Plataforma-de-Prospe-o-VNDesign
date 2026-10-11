import { apiRoute, parseId } from '@/server/http';
import { deleteManualActivity } from '@/server/services/activities';

/** DELETE /api/v1/leads/{id}/activities/{activityId} — apaga um registo manual próprio (nota, chamada ou email enviado). */
export const DELETE = apiRoute<{ id: string; activityId: string }>(async (_req, ctx, { id, activityId }) => {
  await deleteManualActivity(ctx, parseId(id), parseId(activityId, 'Registo'));
  return new Response(null, { status: 204 });
});
