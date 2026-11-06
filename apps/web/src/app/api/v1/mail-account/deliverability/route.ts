import { DeliverabilityQuerySchema } from '@vndesign/core';
import { ApiError, apiRoute, json, parseQuery } from '@/server/http';
import { checkDeliverability } from '@/server/deliverability';
import { getMailAccount } from '@/server/services/mail-account';

export const runtime = 'nodejs';

/**
 * GET /api/v1/mail-account/deliverability?selector= — os emails chegam à caixa de entrada?
 * Verifica o SPF, o DKIM, o DMARC e o MX do domínio do email de envio.
 */
export const GET = apiRoute(async (req, ctx) => {
  const { selector } = parseQuery(req, DeliverabilityQuerySchema);
  const account = await getMailAccount(ctx);
  if (!account) throw new ApiError(422, 'Sem email de envio', 'Liga primeiro o email de envio (em cima) para verificar o domínio.');
  return json({ data: await checkDeliverability(account.from_email, { smtpHost: account.smtp_host, provider: account.provider, selector }) });
});
