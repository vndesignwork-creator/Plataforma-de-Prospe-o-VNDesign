import { PomodoroStartSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { getPomodoro, startPomodoro } from '@/server/services/pomodoro';

/** GET /api/v1/pomodoro — o meu pomodoro em curso (null = nenhum). Avança as fases que já acabaram. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getPomodoro(ctx) }));

/** POST /api/v1/pomodoro — começar um pomodoro de trabalho num projeto (e tarefa). Para o temporizador que estiver a contar. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, PomodoroStartSchema);
  return json({ data: await startPomodoro(ctx, input) }, { status: 201 });
});
