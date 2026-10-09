import { ServicePackageUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deletePackage, updatePackage } from '@/server/services/proposals';

type Params = { id: string };

/** PATCH /api/v1/packages/{id} — editar ou arquivar ({ archived: true }). */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const patch = await parseJson(req, ServicePackageUpdateSchema);
  return json({ data: await updatePackage(ctx, parseId(id, 'Pacote'), patch) });
});

/** DELETE /api/v1/packages/{id} — as propostas já feitas guardam uma cópia dos itens. */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deletePackage(ctx, parseId(id, 'Pacote'));
  return new Response(null, { status: 204 });
});
