import { apiRoute, json } from '@/server/http';
import { freeAuditStats } from '@/server/services/free-audit';

/** GET /api/v1/free-audit/stats — pedidos da análise grátis (mês e total), respostas, clientes e de onde vieram. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await freeAuditStats(ctx) }));
