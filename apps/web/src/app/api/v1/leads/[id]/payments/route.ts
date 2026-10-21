import { LeadPaymentCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createPayment, listPayments } from '@/server/services/payments';

/** GET /api/v1/leads/{id}/payments — pagamentos do cliente. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await listPayments(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/payments — acrescentar um pagamento (com paid_on fica já pago). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadPaymentCreateSchema);
  return json({ data: await createPayment(ctx, parseId(id), input) }, { status: 201 });
});
