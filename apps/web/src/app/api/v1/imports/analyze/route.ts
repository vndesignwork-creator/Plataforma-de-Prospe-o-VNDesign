import { ApiError, apiRoute, json } from '@/server/http';
import { MAX_FILE_BYTES, analyzeFile } from '@/server/services/imports';

/**
 * POST /api/v1/imports/analyze — multipart/form-data com "file" (.csv/.xlsx)
 * e, opcionalmente, "sheet". Deteta o cabeçalho e sugere o mapeamento.
 */
export const POST = apiRoute(async (req) => {
  // Recusa logo pelo tamanho anunciado, antes de ler o pedido para memória.
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_FILE_BYTES + 64 * 1024) {
    throw new ApiError(413, 'Ficheiro demasiado grande', 'O ficheiro tem de ter menos de 10 MB.');
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, 'Pedido inválido', 'Envia o ficheiro como multipart/form-data no campo "file".');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'Pedido inválido', 'Falta o ficheiro (campo "file").');
  const sheet = form.get('sheet');
  return json({ data: await analyzeFile(file, typeof sheet === 'string' ? sheet : null) });
});
