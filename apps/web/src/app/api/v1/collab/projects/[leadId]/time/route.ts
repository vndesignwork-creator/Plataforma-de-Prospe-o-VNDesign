import { CollabTimeActionSchema } from '@vndesign/core';
import { parseId, parseJson } from '@/server/http';
import { collabRoute } from '@/server/collab-route';
import { collabTimer } from '@/server/services/collaborators';

/** POST /api/v1/collab/projects/{leadId}/time — começar ou parar o temporizador do colaborador. */
export const POST = collabRoute<{ leadId: string }>(async (req, user, { leadId }) => {
  const input = await parseJson(req, CollabTimeActionSchema);
  await collabTimer(user, parseId(leadId, 'Projeto não encontrado'), input.action, input.notes);
  return new Response(null, { status: 204 });
});
