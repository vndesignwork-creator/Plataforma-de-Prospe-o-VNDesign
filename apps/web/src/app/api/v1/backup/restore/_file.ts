import { ApiError } from '@/server/http';
import { MAX_FILE_BYTES } from '@/server/services/imports';

/** O ficheiro da cópia (multipart, campo "file"). */
export async function backupFile(req: Request): Promise<File> {
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
