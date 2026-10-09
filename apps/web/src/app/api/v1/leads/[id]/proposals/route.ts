import { ProposalCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createProposal, listProposals } from '@/server/services/proposals';

type Params = { id: string };

/** GET /api/v1/leads/{id}/proposals — propostas do lead (mais recentes primeiro). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await listProposals(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/proposals — nova proposta (rascunho). */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProposalCreateSchema);
  return json({ data: await createProposal(ctx, parseId(id), input) }, { status: 201 });
});
