import { LeadTextInputSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { leadFromText } from '@/server/services/card-scan';

export const maxDuration = 60;

/** POST /api/v1/leads/from-text — texto ditado ou colado ({ text }) → dados do lead para o formulário (não grava). */
export const POST = apiRoute(async (req, ctx) => {
  const { text } = await parseJson(req, LeadTextInputSchema);
  return json({ data: await leadFromText(ctx, text) });
});
