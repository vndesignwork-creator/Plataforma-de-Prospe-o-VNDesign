import { apiRoute, json } from '@/server/http';
import { geocodeMissing } from '@/server/services/geo';

export const maxDuration = 60;

/** POST /api/v1/map/geocode — localiza um lote de leads sem coordenadas (repetir até remaining = 0). */
export const POST = apiRoute(async (_req, ctx) => json({ data: await geocodeMissing(ctx) }));
