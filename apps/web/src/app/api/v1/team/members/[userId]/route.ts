import { TeamMemberUpdateSchema } from '@vndesign/core';
import { apiRoute, parseId, parseJson } from '@/server/http';
import { removeTeamMember, updateTeamMember } from '@/server/services/team';

type Params = { userId: string };

/** PATCH /api/v1/team/members/{userId} — mudar o papel (prospetor ou administrador). */
export const PATCH = apiRoute<Params>(async (req, ctx, { userId }) => {
  const { role } = await parseJson(req, TeamMemberUpdateSchema);
  await updateTeamMember(ctx, parseId(userId, 'Membro não encontrado'), role);
  return new Response(null, { status: 204 });
});

/** DELETE /api/v1/team/members/{userId} — remover da equipa (perde logo o acesso; os leads dele ficam sem responsável). */
export const DELETE = apiRoute<Params>(async (_req, ctx, { userId }) => {
  await removeTeamMember(ctx, parseId(userId, 'Membro não encontrado'));
  return new Response(null, { status: 204 });
});
