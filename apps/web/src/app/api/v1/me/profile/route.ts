import { ProfileUpdateSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { getProfile, updateProfile } from '@/server/services/profile';

/** GET /api/v1/me/profile — o meu nome a mostrar e a foto. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getProfile(ctx) }));

/** PATCH /api/v1/me/profile — mudar o nome a mostrar (alcunha; null = usa o da assinatura). */
export const PATCH = apiRoute(async (req, ctx) => json({ data: await updateProfile(ctx, await parseJson(req, ProfileUpdateSchema)) }));
