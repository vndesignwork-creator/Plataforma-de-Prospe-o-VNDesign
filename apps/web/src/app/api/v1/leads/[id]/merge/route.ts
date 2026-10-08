import { LeadMergeSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { mergeLeads } from '@/server/services/leads';

/**
 * POST /api/v1/leads/{id}/merge — junta duplicados ao lead {id}.
 * Os valores escolhidos são aplicados, a atividade passa para o lead principal
 * e os duplicados são apagados.
 */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadMergeSchema);
  return json({ data: await mergeLeads(ctx, parseId(id), input) });
});
