import { apiRoute, json } from '@/server/http';
import { testSystemMail } from '@/server/services/platform';

/** POST /api/v1/platform/mail-test — envia um email de teste pelo servidor da plataforma (só dono/administrador). */
export const POST = apiRoute(async (_req, ctx) => json({ data: await testSystemMail(ctx) }));
