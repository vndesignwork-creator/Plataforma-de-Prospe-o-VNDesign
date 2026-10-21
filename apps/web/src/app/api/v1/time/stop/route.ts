import { apiRoute, json } from '@/server/http';
import { stopTimer } from '@/server/services/project-tools';

/** POST /api/v1/time/stop — parar o meu temporizador (devolve o registo, ou null se nenhum estava a contar). */
export const POST = apiRoute(async (_req, ctx) => json({ data: await stopTimer(ctx) }));
