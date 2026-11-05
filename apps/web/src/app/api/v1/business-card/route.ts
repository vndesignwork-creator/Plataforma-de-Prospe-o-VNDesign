import { BusinessCardUpdateSchema } from '@vndesign/core';
import { publicOrigin } from '@/lib/public-url';
import { apiRoute, json, parseJson } from '@/server/http';
import { getMyCard, updateMyCard } from '@/server/services/business-card';

/** GET /api/v1/business-card — o meu cartão de contacto (link, QR e se está ligado). */
export const GET = apiRoute(async (req, ctx) => json({ data: await getMyCard(ctx, publicOrigin(req)) }));

/** PATCH /api/v1/business-card — ligar/desligar, frase de apresentação ou trocar o código. */
export const PATCH = apiRoute(async (req, ctx) => json({ data: await updateMyCard(ctx, await parseJson(req, BusinessCardUpdateSchema), publicOrigin(req)) }));
