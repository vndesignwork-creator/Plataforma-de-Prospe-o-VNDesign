import { json, parseId } from '@/server/http';
import { collabRoute } from '@/server/collab-route';
import { getCollabProject } from '@/server/services/collaborators';

/** GET /api/v1/collab/projects/{leadId} — tarefas, entregas, briefing e as próprias horas do projeto. */
export const GET = collabRoute<{ leadId: string }>(async (_req, user, { leadId }) =>
  json({ data: await getCollabProject(user, parseId(leadId, 'Projeto não encontrado')) }),
);
