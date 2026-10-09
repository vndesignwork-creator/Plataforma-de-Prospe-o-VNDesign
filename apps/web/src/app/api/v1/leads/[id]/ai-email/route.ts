import { AiEmailRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { generateAiEmail } from '@/server/services/ai-email';

export const maxDuration = 60;

/** POST /api/v1/leads/{id}/ai-email — rascunho de email escrito pelo Claude com os dados do lead. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, AiEmailRequestSchema);
  return json({ data: await generateAiEmail(ctx, parseId(id), input) });
});
