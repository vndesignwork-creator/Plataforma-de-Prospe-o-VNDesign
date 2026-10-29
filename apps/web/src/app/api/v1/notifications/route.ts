import { NotificationClearQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { clearNotifications, listNotifications } from '@/server/services/team-work';

/** GET /api/v1/notifications — os meus avisos (os 30 mais recentes) e quantos estão por ler. */
export const GET = apiRoute(async (_req, ctx) => json(await listNotifications(ctx)));

/** DELETE /api/v1/notifications?which=read|all — limpar o sino (os lidos ou todos). */
export const DELETE = apiRoute(async (req, ctx) => json({ data: await clearNotifications(ctx, parseQuery(req, NotificationClearQuerySchema)) }));
