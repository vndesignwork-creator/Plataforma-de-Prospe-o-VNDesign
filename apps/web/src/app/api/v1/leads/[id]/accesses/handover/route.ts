import { LeadAccessHandoverSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { handOverAccesses } from '@/server/services/brand-kit';

type Params = { id: string };

/**
 * POST /api/v1/leads/{id}/accesses/handover — entregar os acessos ao cliente:
 * marca-os como entregues e (por omissão) apaga as palavras-passe guardadas.
 */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadAccessHandoverSchema);
  return json({ data: await handOverAccesses(ctx, parseId(id), input) });
});
