import { ReconnectQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { listReconnectClients } from '@/server/services/reconnect';

/** GET /api/v1/projects/reconnect?months=6 — clientes antigos para voltar a contactar (último projeto concluído há mais de N meses). */
export const GET = apiRoute(async (req, ctx) => json({ data: await listReconnectClients(ctx, parseQuery(req, ReconnectQuerySchema)) }));
