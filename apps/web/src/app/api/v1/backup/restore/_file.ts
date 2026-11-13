import type { ApiContext } from '@/server/context';
import { ApiError } from '@/server/http';
import { storedBackupFile } from '@/server/services/backup';
import { MAX_FILE_BYTES } from '@/server/services/imports';

/** A cópia: um ficheiro (multipart, campo "file") ou uma cópia guardada (JSON { "snapshot": id }). */
export async function backupFile(req: Request, ctx: ApiContext): Promise<File> {
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = (await req.json().catch(() => null)) as { snapshot?: unknown } | null;
    if (typeof body?.snapshot !== 'string') throw new ApiError(400, 'Pedido inválido', 'Indica a cópia guardada ("snapshot") ou envia o ficheiro.');
    return storedBackupFile(ctx, body.snapshot);
  }
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_FILE_BYTES + 64 * 1024) throw new ApiError(413, 'Ficheiro demasiado grande', 'O ficheiro tem de ter menos de 10 MB.');
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, 'Pedido inválido', 'Envia o ficheiro como multipart/form-data no campo "file".');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'Pedido inválido', 'Falta o ficheiro (campo "file").');
  return file;
}
