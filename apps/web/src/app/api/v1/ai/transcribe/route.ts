import { ApiError, apiRoute, json } from '@/server/http';
import { transcribeAudio, transcriptionAvailable } from '@/server/ai/transcribe';

export const maxDuration = 180;

/** GET /api/v1/ai/transcribe — há fornecedor para passar áudio a texto? (Ditar nos browsers sem reconhecimento de voz.) */
export const GET = apiRoute(async (_req, ctx) => json({ data: { available: await transcriptionAvailable(ctx) } }));

/** POST /api/v1/ai/transcribe — passa um ditado gravado (campo "audio", até 25 MB) a texto; não grava nada. */
export const POST = apiRoute(async (req, ctx) => {
  const form = await req.formData().catch(() => {
    throw new ApiError(400, 'Pedido inválido', 'Envia a gravação no campo "audio".');
  });
  const file = form.get('audio');
  if (!(file instanceof File)) throw new ApiError(400, 'Pedido inválido', 'Envia a gravação no campo "audio".');
  if (file.type && !file.type.startsWith('audio/') && !file.type.startsWith('video/')) throw new ApiError(415, 'Formato não suportado', 'Envia um ficheiro de áudio.');
  return json({ data: await transcribeAudio(ctx, file) });
});
