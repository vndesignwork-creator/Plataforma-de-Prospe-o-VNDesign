import { LeadAccessUpsertSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createAccess, listAccesses } from '@/server/services/brand-kit';

type Params = { id: string };

/** GET /api/v1/leads/{id}/accesses — acessos do cliente (sem as palavras-passe). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await listAccesses(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/accesses — novo acesso (a palavra-passe fica cifrada). */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadAccessUpsertSchema);
  return json({ data: await createAccess(ctx, parseId(id), input) }, { status: 201 });
});
