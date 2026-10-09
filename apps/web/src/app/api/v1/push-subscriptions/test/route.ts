import { apiRoute, json } from '@/server/http';
import { sendTestPush } from '@/server/services/push';

/** POST /api/v1/push-subscriptions/test — envia uma notificação de teste aos teus dispositivos. */
export const POST = apiRoute(async (_req, ctx) => json({ data: await sendTestPush(ctx) }));
