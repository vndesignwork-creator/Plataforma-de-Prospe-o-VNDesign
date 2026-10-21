import { z } from 'zod';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { cancelMeeting } from '@/server/services/meetings';

export const runtime = 'nodejs';

const CancelSchema = z.object({ notify: z.boolean().default(true) });

/** POST /api/v1/meetings/{id}/cancel — desmarcar (notify: avisar o cliente que recebeu o convite). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { notify } = await parseJson(req, CancelSchema);
  return json({ data: await cancelMeeting(ctx, parseId(id, 'Registo'), notify) });
});
