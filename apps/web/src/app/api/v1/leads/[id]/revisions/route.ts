import { ProjectRevisionCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createRevision, listRevisions } from '@/server/services/project-tools';

/** GET /api/v1/leads/{id}/revisions — rondas de revisão pedidas pelo cliente. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await listRevisions(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/revisions — registar uma revisão (além das incluídas: a cobrar à parte). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProjectRevisionCreateSchema);
  return json({ data: await createRevision(ctx, parseId(id), input) }, { status: 201 });
});
