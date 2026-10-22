import { TimeStartSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { clearPomodoro } from '@/server/services/pomodoro';
import { startTimer } from '@/server/services/project-tools';

/** POST /api/v1/leads/{id}/time/start — pôr o temporizador a contar (para o que estiver a contar noutro projeto e termina o pomodoro). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { notes } = await parseJson(req, TimeStartSchema);
  const entry = await startTimer(ctx, parseId(id), notes);
  await clearPomodoro(ctx);
  return json({ data: entry }, { status: 201 });
});
