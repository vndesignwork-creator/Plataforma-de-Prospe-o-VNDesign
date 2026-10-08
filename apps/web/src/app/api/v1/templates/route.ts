import { ContactTemplateCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createTemplate, listTemplates } from '@/server/services/templates';

/** GET /api/v1/templates — biblioteca de modelos de contacto. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listTemplates(ctx) }));

/** POST /api/v1/templates */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, ContactTemplateCreateSchema);
  return json({ data: await createTemplate(ctx, input) }, { status: 201 });
});
