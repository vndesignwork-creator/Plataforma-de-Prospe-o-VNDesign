import { CalendarFeedUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { getCalendarFeed, setCalendarFeed } from '@/server/services/calendar-feed';

/** GET /api/v1/calendar-feed — o meu link do calendário (token null = desligado). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getCalendarFeed(ctx) }));

/** POST /api/v1/calendar-feed — criar, renovar (o antigo deixa de funcionar) ou desligar o link. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, CalendarFeedUpdateSchema);
  return json({ data: await setCalendarFeed(ctx, input) });
});
