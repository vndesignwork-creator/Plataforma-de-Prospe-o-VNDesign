import { ContactFormatApplySchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { applyContactFormat, contactFormatChanges } from '@/server/services/contact-issues';

/** GET /api/v1/leads/contact-format — "Arrumar formatos": o que mudaria (telefones +351 912 345 678, emails em minúsculas). Não muda nada. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await contactFormatChanges(ctx) }));

/** POST /api/v1/leads/contact-format — grava os telefones e emails indicados ({ items: [{ id, phone?, email? }] }; também serve para "Anular"). */
export const POST = apiRoute(async (req, ctx) => {
  const { items } = await parseJson(req, ContactFormatApplySchema);
  return json({ data: { changed: await applyContactFormat(ctx, items) } });
});
