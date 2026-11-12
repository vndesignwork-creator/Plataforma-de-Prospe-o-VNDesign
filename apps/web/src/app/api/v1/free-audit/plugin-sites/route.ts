import { apiRoute, json } from '@/server/http';
import { listPluginSites } from '@/server/services/free-audit';

/** GET /api/v1/free-audit/plugin-sites — sites com o plugin de WordPress, a versão de cada um e a atual. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await listPluginSites(ctx) }));
