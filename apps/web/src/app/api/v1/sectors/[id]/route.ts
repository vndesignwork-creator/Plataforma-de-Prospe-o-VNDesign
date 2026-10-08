import { SectorUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteSector, updateSector } from '@/server/services/sectors';

type Params = { id: string };

/** PATCH /api/v1/sectors/{id} — editar ou arquivar ({ "archived": true }). */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, SectorUpdateSchema);
  return json({ data: await updateSector(ctx, parseId(id, 'Setor'), input) });
});

/** DELETE /api/v1/sectors/{id} — só se não tiver leads (senão, arquivar). */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteSector(ctx, parseId(id, 'Setor'));
  return new Response(null, { status: 204 });
});
