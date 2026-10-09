import { PushSubscriptionCreateSchema, PushSubscriptionDeleteSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { deleteSubscription, getPushStatus, saveSubscription } from '@/server/services/push';

/** GET /api/v1/push-subscriptions — chave pública VAPID e dispositivos do utilizador. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getPushStatus(ctx) }));

/** POST /api/v1/push-subscriptions — regista este browser (PushSubscription.toJSON()). */
export const POST = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, PushSubscriptionCreateSchema);
  await saveSubscription(ctx, input, req.headers.get('user-agent'));
  return new Response(null, { status: 204 });
});

/** DELETE /api/v1/push-subscriptions — desativa as notificações neste browser ({ endpoint }). */
export const DELETE = apiRoute(async (req, ctx) => {
  const { endpoint } = await parseJson(req, PushSubscriptionDeleteSchema);
  await deleteSubscription(ctx, endpoint);
  return new Response(null, { status: 204 });
});
