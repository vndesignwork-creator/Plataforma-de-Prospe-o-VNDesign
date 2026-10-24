import { LeadBulkActionSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { bulkLeadAction } from '@/server/services/leads';

/**
 * POST /api/v1/leads/bulk — arquivar, repor, apagar, mudar o responsável, pôr ou
 * tirar uma etiqueta ou mudar o estado de vários leads de uma vez (máx. 200).
 * Só com sessão: os tokens de integração não podem apagar nem arquivar.
 */
export const POST = apiRoute(async (req, ctx) => {
  const { action, ids, assigned_to, tag, status } = await parseJson(req, LeadBulkActionSchema);
  return json({ data: await bulkLeadAction(ctx, action, ids, { assignedTo: assigned_to ?? null, tag, status }) });
});
