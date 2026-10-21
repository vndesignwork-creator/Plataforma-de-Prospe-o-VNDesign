import { CalendarQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { projectCalendar } from '@/server/services/project-tools';

/** GET /api/v1/projects/calendar?from=AAAA-MM-DD&to=AAAA-MM-DD — prazos, reuniões, pagamentos e tarefas (máx. 62 dias). */
export const GET = apiRoute(async (req, ctx) => {
  const { from, to } = parseQuery(req, CalendarQuerySchema);
  return json({ data: await projectCalendar(ctx, from, to) });
});
