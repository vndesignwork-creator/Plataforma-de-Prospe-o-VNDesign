import { apiRoute, json, parseId } from '@/server/http';
import { markProposalSent } from '@/server/services/proposals';

/** POST /api/v1/proposals/{id}/send — marca como enviada (e o lead passa a "Proposta enviada"). */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) =>
  json({ data: await markProposalSent(ctx, parseId(id, 'Documento')) }),
);
