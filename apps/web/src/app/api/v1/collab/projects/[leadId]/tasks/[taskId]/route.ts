import { z } from 'zod';
import { parseId, parseJson } from '@/server/http';
import { collabRoute } from '@/server/collab-route';
import { collabSetTask } from '@/server/services/collaborators';

const Body = z.object({ done: z.boolean() });

/** PATCH /api/v1/collab/projects/{leadId}/tasks/{taskId} — marcar como feita (ou por fazer). */
export const PATCH = collabRoute<{ leadId: string; taskId: string }>(async (req, user, { leadId, taskId }) => {
  const input = await parseJson(req, Body);
  await collabSetTask(user, parseId(leadId, 'Projeto não encontrado'), parseId(taskId, 'Tarefa não encontrada'), input.done);
  return new Response(null, { status: 204 });
});
