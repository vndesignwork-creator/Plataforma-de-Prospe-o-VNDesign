import { ProspectingOutcomeSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { recordProspectingOutcome } from '@/server/services/prospecting';

/** POST /api/v1/leads/{id}/prospecting — resultado de um contacto na sessão de prospeção. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProspectingOutcomeSchema);
  return json({ data: await recordProspectingOutcome(ctx, parseId(id), input) });
});
