import { apiRoute, json } from '@/server/http';
import { pauseWorkPomodoro } from '@/server/services/pomodoro';
import { stopTimer } from '@/server/services/project-tools';

/** POST /api/v1/time/stop — parar o meu temporizador (devolve o registo, ou null se nenhum estava a contar). Um pomodoro de trabalho fica em pausa. */
export const POST = apiRoute(async (_req, ctx) => {
  const stopped = await stopTimer(ctx);
  await pauseWorkPomodoro(ctx);
  return json({ data: stopped });
});
