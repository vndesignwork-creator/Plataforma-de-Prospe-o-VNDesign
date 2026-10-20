import { LeadGenerationAddSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { addLeadGenerationCandidates } from '@/server/services/lead-generation';

/** POST /api/v1/lead-generation/{id}/add — cria leads com as empresas escolhidas (e analisa os sites). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadGenerationAddSchema);
  return json({ data: await addLeadGenerationCandidates(ctx, parseId(id), input) });
});
