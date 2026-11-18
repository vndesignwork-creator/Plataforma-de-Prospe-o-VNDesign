import { ReplyDraftRequestSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { draftReply } from '@/server/services/ai-reply';

export const maxDuration = 60;

/** POST /api/v1/leads/{id}/ai-reply — resposta ao email do lead, escrita pela IA. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, ReplyDraftRequestSchema);
  return json({ data: await draftReply(ctx, parseId(id), input) });
});
