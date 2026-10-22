import { BrandKitUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { getBrandKit, updateBrandKit } from '@/server/services/brand-kit';

type Params = { id: string };

/** GET /api/v1/leads/{id}/brand-kit — kit da marca do cliente (o mesmo em todos os projetos dele). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await getBrandKit(ctx, parseId(id)) }));

/** PATCH /api/v1/leads/{id}/brand-kit — cores, tipos de letra, links e notas. */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const input = await parseJson(req, BrandKitUpdateSchema);
  return json({ data: await updateBrandKit(ctx, parseId(id), input) });
});
