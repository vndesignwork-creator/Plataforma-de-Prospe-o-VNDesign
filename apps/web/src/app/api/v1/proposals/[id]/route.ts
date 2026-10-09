import { ProposalUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteProposal, getProposal, updateProposal } from '@/server/services/proposals';

type Params = { id: string };
const pid = (id: string) => parseId(id, 'Documento');

/** GET /api/v1/proposals/{id} */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await getProposal(ctx, pid(id)) }));

/** PATCH /api/v1/proposals/{id} — editar itens, textos ou estado. */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const patch = await parseJson(req, ProposalUpdateSchema);
  return json({ data: await updateProposal(ctx, pid(id), patch) });
});

/** DELETE /api/v1/proposals/{id} */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteProposal(ctx, pid(id));
  return new Response(null, { status: 204 });
});
