import { publicOrigin } from '@/lib/public-url';
import { apiRoute, json, parseId } from '@/server/http';
import { runScheduleNow } from '@/server/services/lead-generation-schedules';

/** POST /api/v1/lead-generation/schedules/{id}/run — correr já (não muda a próxima data). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) =>
  json({ data: await runScheduleNow(ctx, parseId(id, 'Registo'), publicOrigin(req)) }, { status: 202 }),
);
