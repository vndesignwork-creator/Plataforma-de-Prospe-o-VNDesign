import { apiRoute, json } from '@/server/http';
import { listMySessions } from '@/server/services/sessions';

/** GET /api/v1/me/sessions — sessões abertas da conta (aparelho, IP, última atividade). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listMySessions(ctx) }));
