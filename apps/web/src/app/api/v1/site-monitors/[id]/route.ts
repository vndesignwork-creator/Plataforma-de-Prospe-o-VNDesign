import { SiteMonitorUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { deleteSiteMonitor, updateSiteMonitor } from '@/server/services/site-monitors';

type Params = { id: string };
const NOT_FOUND = 'Vigilância do site não encontrada';

/** PATCH /api/v1/site-monitors/{id} — mudar o endereço, pausar (active) ou escrever à mão a data do domínio. */
export const PATCH = apiRoute<Params>(async (req, ctx, { id }) =>
  json({ data: await updateSiteMonitor(ctx, parseId(id, NOT_FOUND), await parseJson(req, SiteMonitorUpdateSchema)) }),
);

/** DELETE /api/v1/site-monitors/{id} — deixar de vigiar. */
export const DELETE = apiRoute<Params>(async (_req, ctx, { id }) => {
  await deleteSiteMonitor(ctx, parseId(id, NOT_FOUND));
  return new Response(null, { status: 204 });
});
