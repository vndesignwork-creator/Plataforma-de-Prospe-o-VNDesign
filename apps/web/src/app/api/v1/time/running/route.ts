import { apiRoute, json } from '@/server/http';
import { getRunningTimer } from '@/server/services/project-tools';

/** GET /api/v1/time/running — o meu temporizador a contar (com o projeto), ou null. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getRunningTimer(ctx) }));
