import { ProjectsQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { listProjects } from '@/server/services/projects';

/** GET /api/v1/projects?state=active|completed — clientes com o projeto em curso (ou concluído). */
export const GET = apiRoute(async (req, ctx) => {
  const { state } = parseQuery(req, ProjectsQuerySchema);
  return json({ data: await listProjects(ctx, state) });
});
