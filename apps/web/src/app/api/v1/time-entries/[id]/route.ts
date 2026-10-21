import { TimeEntryUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteTimeEntry, updateTimeEntry } from '@/server/services/project-tools';

/** PATCH /api/v1/time-entries/{id} — corrigir o dia, a duração (minutos) ou as notas de um registo. */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, TimeEntryUpdateSchema);
  return json({ data: await updateTimeEntry(ctx, parseId(id, 'Registo'), input) });
});

/** DELETE /api/v1/time-entries/{id} */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteTimeEntry(ctx, parseId(id, 'Registo'));
  return new Response(null, { status: 204 });
});
