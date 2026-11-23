import { FixedCostInputSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteFixedCost, updateFixedCost } from '@/server/services/fixed-costs';

type Params = { id: string };

/** PUT /api/v1/fixed-costs/{id} */
export const PUT = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, FixedCostInputSchema);
  return json({ data: await updateFixedCost(ctx, parseId(id, 'Custo fixo'), input) });
});

/** DELETE /api/v1/fixed-costs/{id} */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteFixedCost(ctx, parseId(id, 'Custo fixo'));
  return new Response(null, { status: 204 });
});
