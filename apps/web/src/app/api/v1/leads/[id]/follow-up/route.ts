import { FollowUpSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { completeFollowUp } from '@/server/services/follow-up';

/** POST /api/v1/leads/{id}/follow-up — { action: "done" | "snooze", days?, note? } */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, FollowUpSchema);
  return json({ data: await completeFollowUp(ctx, parseId(id), input) });
});
