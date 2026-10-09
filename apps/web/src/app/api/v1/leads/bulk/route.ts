import { LeadBulkActionSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { bulkLeadAction } from '@/server/services/leads';

/**
 * POST /api/v1/leads/bulk — arquivar, repor ou apagar vários leads de uma vez
 * (máx. 200). Só com sessão: os tokens de integração não podem apagar nem arquivar.
 */
export const POST = apiRoute(async (req, ctx) => {
  const { action, ids } = await parseJson(req, LeadBulkActionSchema);
  return json({ data: await bulkLeadAction(ctx, action, ids) });
});
