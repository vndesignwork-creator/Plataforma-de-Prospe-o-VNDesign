import { ClientRequestCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createClientRequest, listClientRequests } from '@/server/services/client-requests';

type Params = { id: string };

/** GET /api/v1/leads/{id}/client-requests — o que falta o cliente enviar (e o que já enviou). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await listClientRequests(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/client-requests — pedir mais uma coisa ao cliente. */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => json({ data: await createClientRequest(ctx, parseId(id), await parseJson(req, ClientRequestCreateSchema)) }, { status: 201 }));
