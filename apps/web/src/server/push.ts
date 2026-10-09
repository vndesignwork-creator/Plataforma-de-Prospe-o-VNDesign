/**
 * Notificações push (Web Push com chaves VAPID). Gerar as chaves uma vez:
 *   npx web-push generate-vapid-keys
 * e definir VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (mailto:…).
 */
import webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:geral@vndesign.pt',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/** Envia uma notificação. "gone" = a subscrição já não existe (apagar). */
export async function sendPush(sub: StoredSubscription, payload: PushPayload): Promise<'sent' | 'gone' | 'error'> {
  if (!isPushConfigured()) return 'error';
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 12 * 60 * 60, urgency: 'normal', topic: payload.tag?.slice(0, 32) },
    );
    return 'sent';
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    console.error('[push] erro ao enviar', status ?? error);
    return 'error';
  }
}
