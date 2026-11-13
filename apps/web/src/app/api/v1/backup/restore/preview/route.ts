import { ApiError, apiRoute, json } from '@/server/http';
import { previewRestore } from '@/server/services/backup-restore';
import { backupFile } from '../_file';

export const runtime = 'nodejs';

/** POST /api/v1/backup/restore/preview — o que a cópia (Excel) tem e falta agora; não altera nada. */
export const POST = apiRoute(async (req, ctx) => {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new ApiError(403, 'Sem acesso', 'Só o dono e os administradores repõem cópias.');
  return json({ data: await previewRestore(ctx, await backupFile(req)) });
});
