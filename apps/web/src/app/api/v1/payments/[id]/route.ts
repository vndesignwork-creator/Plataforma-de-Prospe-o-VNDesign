import { LeadPaymentUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deletePayment, updatePayment } from '@/server/services/payments';

/** PATCH /api/v1/payments/{id} — mudar ou marcar como pago (paid_on). */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadPaymentUpdateSchema);
  return json({ data: await updatePayment(ctx, parseId(id, 'Pagamento'), input) });
});

/** DELETE /api/v1/payments/{id} */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deletePayment(ctx, parseId(id, 'Pagamento'));
  return new Response(null, { status: 204 });
});
