import { apiRoute, json } from '@/server/http';
import { billingSummary } from '@/server/services/payments';

/** GET /api/v1/dashboard/billing — recebido este mês, por receber, em atraso e projetos em curso. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await billingSummary(ctx) }));
