import { EmailStatsQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { emailStats } from '@/server/services/email-stats';

/** GET /api/v1/stats/emails?days=90 — abertura, clique e resposta por modelo e quando os emails são abertos. */
export const GET = apiRoute(async (req, ctx) => {
  const { days } = parseQuery(req, EmailStatsQuerySchema);
  return json({ data: await emailStats(ctx, days) });
});
