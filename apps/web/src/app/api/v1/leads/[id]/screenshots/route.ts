import { apiRoute, json, parseId } from '@/server/http';
import { captureScreenshots } from '@/server/services/audits';

// O PageSpeed leva 10–40 s (telemóvel e computador em paralelo).
export const maxDuration = 60;

/** POST /api/v1/leads/{id}/screenshots — tira as imagens do site (telemóvel e computador) para a última análise. */
export const POST = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await captureScreenshots(ctx, parseId(id)) }));
