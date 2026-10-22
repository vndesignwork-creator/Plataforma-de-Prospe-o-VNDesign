import { ClientProjectCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createClientProject, listClientProjects } from '@/server/services/client-projects';

type Params = { id: string };

/** GET /api/v1/leads/{id}/client-projects — todos os projetos do cliente (o registo principal e os ligados). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await listClientProjects(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/client-projects — novo projeto para o cliente (registo próprio, já preparado). */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ClientProjectCreateSchema);
  return json({ data: await createClientProject(ctx, parseId(id), input) }, { status: 201 });
});
