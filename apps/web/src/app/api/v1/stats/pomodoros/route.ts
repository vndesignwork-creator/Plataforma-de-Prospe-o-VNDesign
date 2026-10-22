import { apiRoute, json } from '@/server/http';
import { pomodoroStats } from '@/server/services/pomodoro';

/** GET /api/v1/stats/pomodoros — os meus pomodoros: hoje, 7 dias, por dia (14 dias) e por projeto. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await pomodoroStats(ctx) }));
