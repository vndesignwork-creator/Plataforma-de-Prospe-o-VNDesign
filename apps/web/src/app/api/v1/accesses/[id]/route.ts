import { LeadAccessUpsertSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteAccess, updateAccess } from '@/server/services/brand-kit';

type Params = { id: string };

/** PATCH /api/v1/accesses/{id} — editar (secret vazio mantém a palavra-passe; null apaga-a). */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadAccessUpsertSchema);
  return json({ data: await updateAccess(ctx, parseId(id, 'Acesso não encontrado'), input) });
});

/** DELETE /api/v1/accesses/{id} */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteAccess(ctx, parseId(id, 'Acesso não encontrado'));
  return new Response(null, { status: 204 });
});
