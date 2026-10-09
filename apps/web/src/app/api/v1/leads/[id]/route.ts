import { LeadUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteLead, getLead, updateLead } from '@/server/services/leads';

type Params = { id: string };

/** GET /api/v1/leads/{id} */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) =>
  json({ data: await getLead(ctx, parseId(id)) }),
  { token: 'leads:read' },
);

/** PATCH /api/v1/leads/{id} — só os campos enviados são alterados. */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const patch = await parseJson(req, LeadUpdateSchema);
  return json({ data: await updateLead(ctx, parseId(id), patch) });
}, { token: 'leads:write' });

/**
 * DELETE /api/v1/leads/{id} — apaga definitivamente (RGPD).
 * ?add_to_do_not_contact=true acrescenta a empresa à lista "não contactar".
 */
export const DELETE = apiRoute<Params>(async (req, ctx, { id }) => {
  const params = new URL(req.url).searchParams;
  await deleteLead(ctx, parseId(id), {
    addToDoNotContact: params.get('add_to_do_not_contact') === 'true',
    reason: params.get('reason'),
  });
  return new Response(null, { status: 204 });
});
