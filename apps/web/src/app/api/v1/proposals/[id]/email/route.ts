import { LeadEmailSendSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { sendProposalEmail } from '@/server/services/lead-email';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST /api/v1/proposals/{id}/email — envia a proposta ao lead, com o PDF em anexo. */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadEmailSendSchema);
  return json({ data: await sendProposalEmail(ctx, parseId(id, 'Documento'), input) });
});
