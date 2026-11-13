import { ApiError, apiRoute, json } from '@/server/http';
import { restoreBackup } from '@/server/services/backup-restore';
import { backupFile } from './_file';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** POST /api/v1/backup/restore — repõe SÓ o que falta (leads pelo número e as suas tarefas); nada do que existe muda. */
export const POST = apiRoute(async (req, ctx) => {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ApiError(403, 'Sem acesso', 'Só o dono e os administradores repõem cópias.');
  return json({ data: await restoreBackup(ctx, await backupFile(req)) });
});
