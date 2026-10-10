import { ServiceCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createService, listServices } from '@/server/services/service-catalog';

/** GET /api/v1/services — ?include_archived=true inclui os escondidos. */
export const GET = apiRoute(async (req, ctx) => {
  const includeArchived = new URL(req.url).searchParams.get('include_archived') === 'true';
  return json({ data: await listServices(ctx, includeArchived) });
}, { token: 'leads:read' });

/** POST /api/v1/services — a chave é criada a partir do nome. */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, ServiceCreateSchema);
  return json({ data: await createService(ctx, input) }, { status: 201 });
});
