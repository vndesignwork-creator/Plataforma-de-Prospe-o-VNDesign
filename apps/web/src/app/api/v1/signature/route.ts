import { SignatureUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { getSignature, updateSignature } from '@/server/services/workspace';

/** GET /api/v1/signature — assinatura do utilizador atual. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getSignature(ctx) }));

/** PUT /api/v1/signature */
export const PUT = apiRoute(async (req, ctx) => {
  const patch = await parseJson(req, SignatureUpdateSchema);
  return json({ data: await updateSignature(ctx, patch) });
});
