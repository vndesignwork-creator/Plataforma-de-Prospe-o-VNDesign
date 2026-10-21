import { TimeStartSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { startTimer } from '@/server/services/project-tools';

/** POST /api/v1/leads/{id}/time/start — pôr o temporizador a contar (para o que estiver a contar noutro projeto). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { notes } = await parseJson(req, TimeStartSchema);
  return json({ data: await startTimer(ctx, parseId(id), notes) }, { status: 201 });
});
