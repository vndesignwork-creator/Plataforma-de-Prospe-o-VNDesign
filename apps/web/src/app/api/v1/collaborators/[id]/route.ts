import { apiRoute, parseId } from '@/server/http';
import { removeCollaborator } from '@/server/services/collaborators';

/** DELETE /api/v1/collaborators/{id} — remover um colaborador (perde logo o acesso ao projeto). */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await removeCollaborator(ctx, parseId(id, 'Colaborador não encontrado'));
  return new Response(null, { status: 204 });
});
