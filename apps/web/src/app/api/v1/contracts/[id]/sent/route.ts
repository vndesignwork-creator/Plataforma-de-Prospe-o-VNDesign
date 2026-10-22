import { apiRoute, json, parseId } from '@/server/http';
import { markContractSent } from '@/server/services/contracts';

/** POST /api/v1/contracts/{id}/sent — marcar como enviado (regista "Contrato enviado"). */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await markContractSent(ctx, parseId(id, 'Contrato')) }));
