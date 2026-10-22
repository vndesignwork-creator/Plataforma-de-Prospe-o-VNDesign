import { collabRoute } from '@/server/collab-route';
import { claimInvite } from '@/server/services/collaborators';

/** POST /api/v1/collab/invites/{código}/claim — aceitar o convite com a conta já aberta (mesmo email). */
export const POST = collabRoute<{ token: string }>(async (_req, user, { token }) => {
  await claimInvite(user, token);
  return new Response(null, { status: 204 });
});
