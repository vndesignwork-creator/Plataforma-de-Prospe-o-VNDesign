import { ContactTemplateUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteTemplate, getTemplate, updateTemplate } from '@/server/services/templates';

type Params = { id: string };

export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await getTemplate(ctx, parseId(id, 'Modelo')) }));

export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const patch = await parseJson(req, ContactTemplateUpdateSchema);
  return json({ data: await updateTemplate(ctx, parseId(id, 'Modelo'), patch) });
});

export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteTemplate(ctx, parseId(id, 'Modelo'));
  return new Response(null, { status: 204 });
});
