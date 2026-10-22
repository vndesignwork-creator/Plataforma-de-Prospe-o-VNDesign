import { json, parseId } from '@/server/http';
import { collabRoute } from '@/server/collab-route';
import { collabRevealAccess } from '@/server/services/collaborators';

/** GET /api/v1/collab/projects/{leadId}/accesses/{id}/secret — palavra-passe de um acesso partilhado com os colaboradores. */
export const GET = collabRoute<{ leadId: string; id: string }>(async (_req, user, { leadId, id }) =>
  json({ data: { secret: await collabRevealAccess(user, parseId(leadId, 'Projeto não encontrado'), parseId(id, 'Acesso não encontrado')) } }),
);
