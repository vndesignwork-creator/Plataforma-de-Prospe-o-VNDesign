import { ProjectDeliverableCreateSchema } from '@vndesign/core';
import { parseId, parseJson } from '@/server/http';
import { collabRoute } from '@/server/collab-route';
import { collabAddDeliverable } from '@/server/services/collaborators';

/** POST /api/v1/collab/projects/{leadId}/deliverables — juntar um ficheiro/link (fica "Por enviar"). */
export const POST = collabRoute<{ leadId: string }>(async (req, user, { leadId }) => {
  const input = await parseJson(req, ProjectDeliverableCreateSchema);
  await collabAddDeliverable(user, parseId(leadId, 'Projeto não encontrado'), input);
  return new Response(null, { status: 204 });
});
