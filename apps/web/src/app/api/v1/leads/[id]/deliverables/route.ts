import { ProjectDeliverableCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createDeliverable, listDeliverables } from '@/server/services/project-tools';

/** GET /api/v1/leads/{id}/deliverables — ficheiros e entregas do projeto. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await listDeliverables(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/deliverables — acrescentar um ficheiro ou entrega (link). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProjectDeliverableCreateSchema);
  return json({ data: await createDeliverable(ctx, parseId(id), input) }, { status: 201 });
});
