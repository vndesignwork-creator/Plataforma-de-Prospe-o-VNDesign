import { collabRoute } from '@/server/collab-route';
import { claimTeamInvite } from '@/server/services/team';

/** POST /api/v1/team-invites/{código}/claim — aceitar o convite da equipa com a conta já aberta (mesmo email). */
export const POST = collabRoute<{ token: string }>(async (_req, user, { token }) => {
  await claimTeamInvite(user, token);
  return new Response(null, { status: 204 });
});
