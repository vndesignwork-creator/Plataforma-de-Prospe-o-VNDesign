import { apiRoute, parseId } from '@/server/http';
import { revokeToken } from '@/server/services/tokens';

/** DELETE /api/v1/tokens/{id} — revoga o token (deixa de funcionar de imediato). */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await revokeToken(ctx, parseId(id, 'Token'));
  return new Response(null, { status: 204 });
});
