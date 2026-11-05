import { apiRoute, json } from '@/server/http';
import { listSiteMonitors } from '@/server/services/site-monitors';

/** GET /api/v1/site-monitors — os sites dos clientes vigiados (com o estado e as datas). */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listSiteMonitors(ctx) }));
