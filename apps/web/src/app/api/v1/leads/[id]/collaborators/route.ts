import { CollaboratorInviteSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { inviteCollaborator, listCollaborators } from '@/server/services/collaborators';

type Params = { id: string };

/** GET /api/v1/leads/{id}/collaborators — colaboradores convidados para o projeto. */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await listCollaborators(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/collaborators — convidar por email (e enviar o convite, se pedido). */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, CollaboratorInviteSchema);
  return json({ data: await inviteCollaborator(ctx, parseId(id), input) }, { status: 201 });
});
