import { apiRoute, parseId } from '@/server/http';
import { deleteNotification } from '@/server/services/team-work';

type Params = { id: string };

/** DELETE /api/v1/notifications/{id} — apagar um aviso. */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteNotification(ctx, parseId(id, 'Aviso'));
  return new Response(null, { status: 204 });
});
