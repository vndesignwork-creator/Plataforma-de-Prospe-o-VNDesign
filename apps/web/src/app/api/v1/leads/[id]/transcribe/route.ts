import { ApiError, apiRoute, json, parseId } from '@/server/http';
import { transcribeAudio } from '@/server/ai/transcribe';
import { getLead } from '@/server/services/leads';

export const maxDuration = 180;
type Params = { id: string };

/** POST /api/v1/leads/{id}/transcribe — passa uma gravação (campo "audio", até 25 MB) a texto; não grava nada. */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const lead = await getLead(ctx, parseId(id));
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado');
  const form = await req.formData().catch(() => {
    throw new ApiError(400, 'Pedido inválido', 'Envia a gravação no campo "audio".');
  });
  const file = form.get('audio');
  if (!(file instanceof File)) throw new ApiError(400, 'Pedido inválido', 'Envia a gravação no campo "audio".');
  if (file.type && !file.type.startsWith('audio/') && !file.type.startsWith('video/')) throw new ApiError(415, 'Formato não suportado', 'Envia um ficheiro de áudio (mp3, m4a, wav, webm…).');
  return json({ data: await transcribeAudio(ctx, file) });
});
