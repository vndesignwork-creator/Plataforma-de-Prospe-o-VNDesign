import { LaunchChecklistUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { getLaunchChecklist, updateLaunchChecklist } from '@/server/services/launch';

type Params = { id: string };

/** GET /api/v1/leads/{id}/launch — checklist de lançamento do site do cliente. */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await getLaunchChecklist(ctx, parseId(id)) }));

/** PATCH /api/v1/leads/{id}/launch — endereço do site novo e pontos marcados à mão. */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LaunchChecklistUpdateSchema);
  return json({ data: await updateLaunchChecklist(ctx, parseId(id), input) });
});
