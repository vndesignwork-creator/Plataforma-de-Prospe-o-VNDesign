import { LeadGenerationRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { listLeadGenerationRuns, startLeadGeneration } from '@/server/services/lead-generation';

/** GET /api/v1/lead-generation — últimas pesquisas do gerador de leads. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listLeadGenerationRuns(ctx) }));

/** POST /api/v1/lead-generation — começa uma pesquisa (corre em segundo plano; consultar GET /lead-generation/{id}). */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, LeadGenerationRequestSchema);
  return json({ data: await startLeadGeneration(ctx, input) }, { status: 202 });
});
