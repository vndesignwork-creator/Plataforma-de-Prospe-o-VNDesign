import { ContractCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createContract, listContracts } from '@/server/services/contracts';

/** GET /api/v1/leads/{id}/contracts — contratos do lead (o mais recente primeiro). */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await listContracts(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/contracts — gerar um contrato a partir da proposta (por omissão a aceite). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { proposal_id } = await parseJson(req, ContractCreateSchema);
  return json({ data: await createContract(ctx, parseId(id), proposal_id) }, { status: 201 });
});
