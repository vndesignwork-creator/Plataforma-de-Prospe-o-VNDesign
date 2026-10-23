import { LeadGeoUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { getLeadGeo, updateLeadGeo } from '@/server/services/geo-kit';

type Params = { id: string };

/** GET /api/v1/leads/{id}/geo — kit GEO: dados do negócio, perguntas frequentes e perfil do Google. */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await getLeadGeo(ctx, parseId(id)) }));

/** PATCH /api/v1/leads/{id}/geo — guarda os dados do negócio e/ou as perguntas frequentes editadas. */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) => {
  const patch = await parseJson(req, LeadGeoUpdateSchema);
  return json({ data: await updateLeadGeo(ctx, parseId(id), patch) });
});
