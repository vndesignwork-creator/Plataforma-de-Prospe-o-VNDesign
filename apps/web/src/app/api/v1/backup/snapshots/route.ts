import { ApiError, apiRoute, json } from '@/server/http';
import { listStoredBackups, saveBackupNow } from '@/server/services/backup';

export const runtime = 'nodejs';
export const maxDuration = 60;

const staffOnly = (role: string) => {
  if (role !== 'owner' && role !== 'admin') throw new ApiError(403, 'Sem acesso', 'Só o dono e os administradores veem as cópias.');
};

/** GET /api/v1/backup/snapshots — as cópias guardadas na plataforma (as últimas 8). */
export const GET = apiRoute(async (_req, ctx) => {
  staffOnly(ctx.role);
  return json({ data: await listStoredBackups(ctx) });
});

/** POST /api/v1/backup/snapshots — fazer já uma cópia (fica guardada; sem email). */
export const POST = apiRoute(async (_req, ctx) => {
  staffOnly(ctx.role);
  return json({ data: await saveBackupNow(ctx) }, { status: 201 });
});
