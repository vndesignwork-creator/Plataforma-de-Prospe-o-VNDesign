import { LeadTaskCreateSchema } from '@vndesign/core';
import { parseId, parseJson } from '@/server/http';
import { collabRoute } from '@/server/collab-route';
import { collabAddTask } from '@/server/services/collaborators';

/** POST /api/v1/collab/projects/{leadId}/tasks — o colaborador acrescenta uma tarefa. */
export const POST = collabRoute<{ leadId: string }>(async (req, user, { leadId }) => {
  const input = await parseJson(req, LeadTaskCreateSchema);
  await collabAddTask(user, parseId(leadId, 'Projeto não encontrado'), input.title);
  return new Response(null, { status: 204 });
});
