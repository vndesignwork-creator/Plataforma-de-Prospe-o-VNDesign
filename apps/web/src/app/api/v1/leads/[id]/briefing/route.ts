import { apiRoute, json, parseId } from '@/server/http';
import { deleteBriefing, getBriefing, requestBriefing } from '@/server/services/briefing';

/** GET /api/v1/leads/{id}/briefing — o briefing do projeto (null se ainda não foi pedido). */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await getBriefing(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/briefing — criar o link do briefing ou voltar a pedi-lo. */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await requestBriefing(ctx, parseId(id)) }, { status: 201 }));

/** DELETE /api/v1/leads/{id}/briefing — apagar (o link deixa de funcionar e os ficheiros são apagados). */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteBriefing(ctx, parseId(id));
  return new Response(null, { status: 204 });
});
