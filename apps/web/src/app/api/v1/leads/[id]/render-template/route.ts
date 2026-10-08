import { RenderTemplateRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { renderForLead } from '@/server/services/templates';

/** POST /api/v1/leads/{id}/render-template — modelo preenchido com os dados do lead. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, RenderTemplateRequestSchema);
  return json({ data: await renderForLead(ctx, parseId(id), input) });
});
