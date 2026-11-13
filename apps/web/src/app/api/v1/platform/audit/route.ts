import { ApiError, apiRoute, json } from '@/server/http';
import { listAuditEvents } from '@/server/services/platform';

/** GET /api/v1/platform/audit — registo de alterações fora dos leads (só o dono e os administradores). */
export const GET = apiRoute(async (_req, ctx) => {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ApiError(403, 'Sem acesso', 'Só o dono e os administradores veem o registo de alterações.');
  return json({ data: await listAuditEvents(ctx) });
});
