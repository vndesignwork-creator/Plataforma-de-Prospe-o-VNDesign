import { apiRoute, json, parseId } from '@/server/http';
import { checkSiteMonitorNow } from '@/server/services/site-monitors';

type Params = { id: string };

/** POST /api/v1/site-monitors/{id}/check — verificar agora (no ar, certificado e domínio). */
export const POST = apiRoute<Params>(async (_req, ctx, { id }) => json({ data: await checkSiteMonitorNow(ctx, parseId(id, 'Vigilância do site não encontrada')) }));
