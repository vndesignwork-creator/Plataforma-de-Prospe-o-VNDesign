import { RepliesQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { getReplies } from '@/server/services/replies';

/** GET /api/v1/replies?days=14 — respostas dos leads (caixa de entrada) e se ainda falta responder. */
export const GET = apiRoute(async (req, ctx) => {
  const { days } = parseQuery(req, RepliesQuerySchema);
  return json({ data: await getReplies(ctx, days) });
});
