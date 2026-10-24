import { NotificationReadSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { markNotificationsRead } from '@/server/services/team-work';

/** POST /api/v1/notifications/read — marcar avisos como lidos ({ ids } ou { all: true }). */
export const POST = apiRoute(async (req, ctx) => json({ data: await markNotificationsRead(ctx, await parseJson(req, NotificationReadSchema)) }));
