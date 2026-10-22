import { ApiError, apiRoute, parseId } from '@/server/http';
import { briefingFileUrl } from '@/server/services/briefing';

/** GET /api/v1/leads/{id}/briefing/files/{n} — descarregar um ficheiro do briefing (redireciona para um link temporário). */
export const GET = apiRoute<{ id: string; index: string }>(async (_req, ctx, { id, index }) => {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 0) throw new ApiError(404, 'Ficheiro não encontrado');
  return Response.redirect(await briefingFileUrl(ctx, parseId(id), n), 302);
});
