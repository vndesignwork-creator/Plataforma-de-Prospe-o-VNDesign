import { TimeEntryCreateSchema } from '@vndesign/core';
import { parseId, parseJson } from '@/server/http';
import { collabRoute } from '@/server/collab-route';
import { collabAddTime } from '@/server/services/collaborators';

/** POST /api/v1/collab/projects/{leadId}/time/manual — registar horas à mão. */
export const POST = collabRoute<{ leadId: string }>(async (req, user, { leadId }) => {
  const input = await parseJson(req, TimeEntryCreateSchema);
  await collabAddTime(user, parseId(leadId, 'Projeto não encontrado'), input);
  return new Response(null, { status: 204 });
});
