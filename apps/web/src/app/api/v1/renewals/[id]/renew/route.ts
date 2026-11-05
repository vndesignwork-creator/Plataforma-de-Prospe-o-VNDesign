import { RenewalRenewSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { renewRenewal } from '@/server/services/renewals';

type Params = { id: string };

/** POST /api/v1/renewals/{id}/renew — "Renovado": passa à data seguinte e (por omissão) regista o pagamento de hoje. */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => json({ data: await renewRenewal(ctx, parseId(id, 'Renovação não encontrada'), await parseJson(req, RenewalRenewSchema)) }));
