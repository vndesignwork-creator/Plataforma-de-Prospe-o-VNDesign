import { DuplicateCheckSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { checkDuplicates } from '@/server/services/leads';

/** POST /api/v1/leads/check-duplicates — verifica antes de gravar (sem criar nada). */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, DuplicateCheckSchema);
  return json({ data: await checkDuplicates(ctx, input) });
});
