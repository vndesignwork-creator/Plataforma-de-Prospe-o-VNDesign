import { ProposalDuplicateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { duplicateProposal } from '@/server/services/proposals';

type Params = { id: string };

/** POST /api/v1/proposals/{id}/duplicate — copiar a proposta (mesmo lead ou outro). */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProposalDuplicateSchema);
  return json({ data: await duplicateProposal(ctx, parseId(id), input) }, { status: 201 });
});
