import { RenewalCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createRenewal, listRenewals } from '@/server/services/renewals';

type Params = { id: string };

/** GET /api/v1/leads/{id}/renewals — renovações e avenças do cliente (domínio, alojamento, manutenção…). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await listRenewals(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/renewals — juntar uma renovação ou avença. */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => json({ data: await createRenewal(ctx, parseId(id), await parseJson(req, RenewalCreateSchema)) }, { status: 201 }));
