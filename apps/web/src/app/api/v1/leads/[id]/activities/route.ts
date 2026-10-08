import { ActivityCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createActivity, listActivities } from '@/server/services/activities';

type Params = { id: string };

/** GET /api/v1/leads/{id}/activities — linha do tempo (mais recente primeiro). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) =>
  json({ data: await listActivities(ctx, parseId(id)) }),
);

/** POST /api/v1/leads/{id}/activities — nota, chamada, email copiado/enviado… */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ActivityCreateSchema);
  return json({ data: await createActivity(ctx, parseId(id), input) }, { status: 201 });
});
