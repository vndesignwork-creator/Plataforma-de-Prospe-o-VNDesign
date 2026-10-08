import { LeadMoveSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { moveLead } from '@/server/services/leads';

/** POST /api/v1/leads/{id}/move — Kanban: mudar de estado e/ou posição. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const move = await parseJson(req, LeadMoveSchema);
  return json({ data: await moveLead(ctx, parseId(id), move) });
});
