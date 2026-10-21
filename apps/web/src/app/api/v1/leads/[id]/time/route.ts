import { TimeEntryCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { addTimeEntry, getProjectTime } from '@/server/services/project-tools';

/** GET /api/v1/leads/{id}/time — horas registadas, total, temporizador e €/hora. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await getProjectTime(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/time — registar horas à mão (dia e minutos). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, TimeEntryCreateSchema);
  return json({ data: await addTimeEntry(ctx, parseId(id), input) }, { status: 201 });
});
