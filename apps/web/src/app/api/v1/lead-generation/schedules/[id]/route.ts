import { LeadGenerationScheduleUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteSchedule, updateSchedule } from '@/server/services/lead-generation-schedules';

/** PATCH /api/v1/lead-generation/schedules/{id} — ativar/desativar ou mudar a pesquisa. */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadGenerationScheduleUpdateSchema);
  return json({ data: await updateSchedule(ctx, parseId(id, 'Registo'), input) });
});

/** DELETE /api/v1/lead-generation/schedules/{id} — apagar (as pesquisas já feitas ficam). */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteSchedule(ctx, parseId(id, 'Registo'));
  return new Response(null, { status: 204 });
});
