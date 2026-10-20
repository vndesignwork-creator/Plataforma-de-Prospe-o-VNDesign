import { LeadEmailSendSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { sendLeadEmail } from '@/server/services/lead-email';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST /api/v1/leads/{id}/email — envia um email ao lead pela conta do utilizador. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadEmailSendSchema);
  return json({ data: await sendLeadEmail(ctx, parseId(id), input) });
});
