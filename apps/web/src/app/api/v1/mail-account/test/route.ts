import { apiRoute, json } from '@/server/http';
import { sendTestEmail } from '@/server/services/mail-account';

export const runtime = 'nodejs';

/** POST /api/v1/mail-account/test — envia um email de teste para o próprio. */
export const POST = apiRoute(async (_req, ctx) => json({ data: await sendTestEmail(ctx) }));
