import { CalendarQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { projectCalendar } from '@/server/services/project-tools';

/**
 * GET /api/v1/projects/calendar?from=AAAA-MM-DD&to=AAAA-MM-DD — prazos, reuniões, pagamentos e tarefas
 * (máx. 62 dias); com followups=true, também as próximas ações dos leads (Agenda); com overdue=true,
 * também os follow-ups e as tarefas por fazer em atraso (antes de hoje).
 */
export const GET = apiRoute(async (req, ctx) => {
  const { from, to, followups, overdue } = parseQuery(req, CalendarQuerySchema);
  return json({ data: await projectCalendar(ctx, from, to, { followups: followups === 'true', overdue: overdue === 'true' }) });
});
