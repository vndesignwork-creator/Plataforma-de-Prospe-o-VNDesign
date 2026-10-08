import { ApiError, apiRoute, json } from '@/server/http';
import { isMailConfigured, sendMail } from '@/server/mailer';
import { buildDigestEmail } from '@/server/services/digest';
import { getToday } from '@/server/services/dashboard';
import { getSettings } from '@/server/services/workspace';

/** POST /api/v1/settings/test-digest — envia já o resumo diário ao destinatário configurado. */
export const POST = apiRoute(async (req, ctx) => {
  if (!isMailConfigured()) {
    throw new ApiError(422, 'Email por configurar', 'Define SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS (ver .env.example).');
  }
  const settings = await getSettings(ctx);
  const to = settings.daily_digest.recipient ?? ctx.user.email;
  if (!to) throw new ApiError(422, 'Sem destinatário', 'Indica o email que deve receber o resumo.');
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  const email = buildDigestEmail({ workspaceName: 'VNDesign', today: await getToday(ctx), appUrl });
  try {
    await sendMail({ to, ...email });
  } catch (e) {
    throw new ApiError(502, 'Falha no envio', e instanceof Error ? e.message : 'Não foi possível enviar o email.');
  }
  return json({ data: { sent_to: to, subject: email.subject } });
});
