import { LeadLocationSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { geocodeLead, setLeadLocation } from '@/server/services/geo';

/**
 * POST /api/v1/leads/{id}/location — sem corpo: procura a morada no mapa;
 * com { latitude, longitude }: grava a posição escolhida à mão.
 */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const leadId = parseId(id);
  const text = await req.clone().text();
  if (!text.trim() || text.trim() === '{}') return json({ data: await geocodeLead(ctx, leadId) });
  const { latitude, longitude } = await parseJson(req, LeadLocationSchema);
  return json({ data: await setLeadLocation(ctx, leadId, latitude, longitude) });
});
