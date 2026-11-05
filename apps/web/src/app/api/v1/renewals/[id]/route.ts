import { RenewalUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteRenewal, updateRenewal } from '@/server/services/renewals';

type Params = { id: string };

/** PATCH /api/v1/renewals/{id} — mudar o valor, a data, o aviso ou pausar (active). */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => json({ data: await updateRenewal(ctx, parseId(id, 'Renovação não encontrada'), await parseJson(req, RenewalUpdateSchema)) }));

/** DELETE /api/v1/renewals/{id} — apagar a renovação (os pagamentos já registados ficam). */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteRenewal(ctx, parseId(id, 'Renovação não encontrada'));
  return new Response(null, { status: 204 });
});
