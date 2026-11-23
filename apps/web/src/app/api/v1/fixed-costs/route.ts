import { FixedCostInputSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createFixedCost, listFixedCosts } from '@/server/services/fixed-costs';

/** GET /api/v1/fixed-costs — os custos fixos mensais do negócio. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listFixedCosts(ctx) }));

/** POST /api/v1/fixed-costs — acrescentar um custo fixo. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, FixedCostInputSchema);
  return json({ data: await createFixedCost(ctx, input) }, { status: 201 });
});
