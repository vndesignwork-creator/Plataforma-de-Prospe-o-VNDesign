import { ProposalPickQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { listRecentProposals } from '@/server/services/proposals';

/** GET /api/v1/proposals — propostas recentes de todos os leads (para "partir de outra"). */
export const GET = apiRoute(async (req, ctx) => {
  const query = parseQuery(req, ProposalPickQuerySchema);
  return json({ data: await listRecentProposals(ctx, query) });
});
