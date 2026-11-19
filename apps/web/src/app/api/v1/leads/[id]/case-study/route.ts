import { CaseStudyRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteCaseStudy, getCaseStudy, writeCaseStudy } from '@/server/services/case-study';

export const maxDuration = 60;

/** GET /api/v1/leads/{id}/case-study — o caso de estudo guardado (ou null). */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await getCaseStudy(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/case-study — escrever (ou reescrever) o caso de estudo com IA. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, CaseStudyRequestSchema);
  return json({ data: await writeCaseStudy(ctx, parseId(id), input) });
});

/** DELETE /api/v1/leads/{id}/case-study */
export const DELETE = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteCaseStudy(ctx, parseId(id));
  return new Response(null, { status: 204 });
});
