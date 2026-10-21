import { PaymentPlanSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createPaymentPlan } from '@/server/services/payments';

/** POST /api/v1/leads/{id}/payments/plan — plano pronto (ex.: 50% sinal + 50% entrega). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, PaymentPlanSchema);
  return json({ data: await createPaymentPlan(ctx, parseId(id), input) }, { status: 201 });
});
