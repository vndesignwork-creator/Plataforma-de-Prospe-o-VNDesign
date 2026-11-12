import { apiRoute, json } from '@/server/http';
import { freeAuditFormStats } from '@/server/services/free-audit';

/** GET /api/v1/free-audit/form-stats — por site, nos últimos 30 dias: pessoas que viram o formulário, pedidos e a percentagem. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await freeAuditFormStats(ctx, 30) }));
