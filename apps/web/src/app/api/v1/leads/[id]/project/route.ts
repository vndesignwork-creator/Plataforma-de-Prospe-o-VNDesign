import { ProjectCompleteSchema, ProjectInfoUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { getProjectInfo, updateProjectInfo } from '@/server/services/project-tools';
import { setProjectCompleted } from '@/server/services/projects';

/** GET /api/v1/leads/{id}/project — prazo, fase, revisões incluídas e link do cliente. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await getProjectInfo(ctx, parseId(id)) }));

/** PATCH /api/v1/leads/{id}/project — mudar o prazo, a fase ou as revisões incluídas. */
export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProjectInfoUpdateSchema);
  return json({ data: await updateProjectInfo(ctx, parseId(id), input) });
});

/**
 * POST /api/v1/leads/{id}/project — concluir ({ completed: true }) ou reabrir o
 * projeto. Ao concluir: portfolio_task e upsell_months criam as tarefas finais.
 */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ProjectCompleteSchema);
  return json({ data: await setProjectCompleted(ctx, parseId(id), input) });
});
