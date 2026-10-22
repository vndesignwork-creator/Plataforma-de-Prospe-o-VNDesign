import { ApiError, parseId } from '@/server/http';
import { collabRoute } from '@/server/collab-route';
import { collabBriefingFileUrl } from '@/server/services/collaborators';

/** GET /api/v1/collab/projects/{leadId}/briefing/files/{n} — ficheiro do briefing (redireciona para um link temporário). */
export const GET = collabRoute<{ leadId: string; index: string }>(async (_req, user, { leadId, index }) => {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) throw new ApiError(404, 'Ficheiro não encontrado');
  return Response.redirect(await collabBriefingFileUrl(user, parseId(leadId, 'Projeto não encontrado'), n), 302);
});
