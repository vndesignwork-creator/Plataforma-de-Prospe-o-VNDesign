import { TeamInviteCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { inviteTeamMember } from '@/server/services/team';

/** POST /api/v1/team/invites — convidar para a equipa (prospetor ou administrador). */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, TeamInviteCreateSchema);
  return json({ data: await inviteTeamMember(ctx, input) }, { status: 201 });
});
