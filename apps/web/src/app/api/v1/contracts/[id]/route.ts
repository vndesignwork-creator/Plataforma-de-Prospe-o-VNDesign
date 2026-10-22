import { ContractUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteContract, updateContract } from '@/server/services/contracts';

/** PATCH /api/v1/contracts/{id} — editar o título ou as cláusulas (até o cliente aceitar). */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ContractUpdateSchema);
  return json({ data: await updateContract(ctx, parseId(id, 'Contrato'), input) });
});

/** DELETE /api/v1/contracts/{id} — só se ainda não tiver sido aceite. */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteContract(ctx, parseId(id, 'Contrato'));
  return new Response(null, { status: 204 });
});
