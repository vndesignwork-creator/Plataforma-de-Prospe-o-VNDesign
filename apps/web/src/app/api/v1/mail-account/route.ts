import { MailAccountUpsertSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { deleteMailAccount, getMailAccount, saveMailAccount } from '@/server/services/mail-account';

/** GET /api/v1/mail-account — a conta de envio do utilizador (sem a palavra-passe), ou null. */
export const GET = apiRoute(async (_req, ctx) => json({ data: await getMailAccount(ctx) }));

/** PUT /api/v1/mail-account — ligar ou mudar a conta (Gmail, Hostinger ou outro SMTP). */
export const PUT = apiRoute(async (req, ctx) => {
  const input = await parseJson(req, MailAccountUpsertSchema);
  return json({ data: await saveMailAccount(ctx, input) });
});

/** DELETE /api/v1/mail-account — desligar a conta (a palavra-passe é apagada). */
export const DELETE = apiRoute(async (_req, ctx) => {
  await deleteMailAccount(ctx);
  return new Response(null, { status: 204 });
});
