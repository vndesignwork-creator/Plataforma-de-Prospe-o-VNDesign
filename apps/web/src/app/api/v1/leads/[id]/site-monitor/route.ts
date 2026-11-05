import { SiteMonitorCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createSiteMonitor, getSiteMonitor } from '@/server/services/site-monitors';

type Params = { id: string };

/** GET /api/v1/leads/{id}/site-monitor — o site vigiado do cliente (null = não está a ser vigiado). */
export const GET = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await getSiteMonitor(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/site-monitor — começar a vigiar (o endereço indicado ou o site da ficha) e verificar já. */
export const POST = apiRoute<Params>(async (req, ctx, { id }) =>
  json({ data: await createSiteMonitor(ctx, parseId(id), await parseJson(req, SiteMonitorCreateSchema)) }, { status: 201 }),
);
