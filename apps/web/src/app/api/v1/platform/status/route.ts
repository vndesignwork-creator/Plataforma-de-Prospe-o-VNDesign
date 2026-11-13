import { apiRoute, json } from '@/server/http';
import { getPlatformStatus } from '@/server/services/platform';

/** GET /api/v1/platform/status — quando correram as tarefas automáticas e os problemas em segundo plano (últimos 30 dias). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getPlatformStatus(ctx) }));
