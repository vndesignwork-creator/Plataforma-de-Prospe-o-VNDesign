import { BulkFindContactsSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { findContactsBulk } from '@/server/services/contact-finder';

export const maxDuration = 300;

/** POST /api/v1/leads/find-contacts — procurar contactos em lote (até 25 leads) e guardar o que faltar (telefone, email, site). */
export const POST = apiRoute(async (req, ctx) => {
  const { ids } = await parseJson(req, BulkFindContactsSchema);
  return json({ data: await findContactsBulk(ctx, ids) });
});
