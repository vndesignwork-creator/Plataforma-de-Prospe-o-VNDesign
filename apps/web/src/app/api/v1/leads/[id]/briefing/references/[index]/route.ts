import { apiRoute, parseId } from '@/server/http';
import { briefingReferenceUrl } from '@/server/services/briefing';

/** GET /api/v1/leads/{id}/briefing/references/{n} — a imagem de referência (link temporário). */
export const GET = apiRoute<{ id: string; index: string }>(async (_req, ctx, { id, index }) => {
  const url = await briefingReferenceUrl(ctx, parseId(id), Number(index));
  return Response.redirect(url, 307);
});
