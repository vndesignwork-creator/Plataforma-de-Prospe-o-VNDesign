import { SectorCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { createSector, listSectors } from '@/server/services/sectors';

/** GET /api/v1/sectors — ?include_archived=true inclui os arquivados. */
export const GET = apiRoute(async (req, ctx) => {
  const includeArchived = new URL(req.url).searchParams.get('include_archived') === 'true';
  return json({ data: await listSectors(ctx, includeArchived) });
});

/** POST /api/v1/sectors */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, SectorCreateSchema);
  return json({ data: await createSector(ctx, input) }, { status: 201 });
});
