import { LeadGenerationScheduleUpsertSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createSchedule, listSchedules } from '@/server/services/lead-generation-schedules';

/** GET /api/v1/lead-generation/schedules — pesquisas automáticas (semanais). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listSchedules(ctx) }));

/** POST /api/v1/lead-generation/schedules — criar uma pesquisa automática. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, LeadGenerationScheduleUpsertSchema);
  return json({ data: await createSchedule(ctx, input) }, { status: 201 });
});
