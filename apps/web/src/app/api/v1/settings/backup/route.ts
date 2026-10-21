import { apiRoute, json } from '@/server/http';
import { sendBackup } from '@/server/services/backup';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST /api/v1/settings/backup — envia já a cópia de segurança (todos os leads em Excel) por email. */
export const POST = apiRoute(async (_req, ctx) => json({ data: await sendBackup(ctx) }));
