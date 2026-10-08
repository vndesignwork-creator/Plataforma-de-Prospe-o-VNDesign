import { apiRoute, parseId } from '@/server/http';
import { removeDoNotContact } from '@/server/services/do-not-contact';

/** DELETE /api/v1/do-not-contact/{id} */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await removeDoNotContact(ctx, parseId(id, 'Entrada'));
  return new Response(null, { status: 204 });
});
