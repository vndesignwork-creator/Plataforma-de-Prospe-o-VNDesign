import { DuplicateIgnoreSchema } from '@vndesign/core';
import { apiRoute, parseJson } from '@/server/http';
import { ignoreDuplicates } from '@/server/services/duplicates';

/** POST /api/v1/leads/duplicates/ignore — "Não são duplicados" (o grupo deixa de aparecer). */
export const POST = apiRoute(async (req, ctx) => {
  const { ids } = await parseJson(req, DuplicateIgnoreSchema);
  await ignoreDuplicates(ctx, ids);
  return new Response(null, { status: 204 });
});
