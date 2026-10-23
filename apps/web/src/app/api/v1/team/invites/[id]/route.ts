import { apiRoute, parseId } from '@/server/http';
import { revokeTeamInvite } from '@/server/services/team';

/** DELETE /api/v1/team/invites/{id} — anular um convite por aceitar. */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await revokeTeamInvite(ctx, parseId(id, 'Convite não encontrado'));
  return new Response(null, { status: 204 });
});
