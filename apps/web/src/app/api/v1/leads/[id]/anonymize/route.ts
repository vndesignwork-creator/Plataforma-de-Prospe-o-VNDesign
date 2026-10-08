import { LeadAnonymizeSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { anonymizeLead } from '@/server/services/leads';

/** POST /api/v1/leads/{id}/anonymize — RGPD: apaga dados de contacto e texto livre. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadAnonymizeSchema);
  return json({ data: await anonymizeLead(ctx, parseId(id), input) });
});
