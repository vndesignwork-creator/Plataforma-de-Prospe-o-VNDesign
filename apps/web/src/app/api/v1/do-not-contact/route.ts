import { DoNotContactCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { addDoNotContact, listDoNotContact } from '@/server/services/do-not-contact';

/** GET /api/v1/do-not-contact — lista "não contactar" (RGPD). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listDoNotContact(ctx) }));

/** POST /api/v1/do-not-contact */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, DoNotContactCreateSchema);
  return json({ data: await addDoNotContact(ctx, input) }, { status: 201 });
});
