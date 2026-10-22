import { apiRoute, json, parseId } from '@/server/http';
import { revealAccess } from '@/server/services/brand-kit';

/** GET /api/v1/accesses/{id}/secret — a palavra-passe em claro (para mostrar ou copiar). */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) =>
  json({ data: { secret: await revealAccess(ctx, parseId(id, 'Acesso não encontrado')) } }),
);
