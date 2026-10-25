import { EmailCheckQuerySchema } from '@vndesign/core';
import { apiRoute, json, parseQuery } from '@/server/http';
import { checkEmailDomain } from '@/server/email-check';

/** GET /api/v1/email-check?email=… — o domínio do email existe e recebe emails? (só um aviso) */
export const GET = apiRoute(async (req) => {
  const { email } = parseQuery(req, EmailCheckQuerySchema);
  return json({ data: await checkEmailDomain(email) });
});
