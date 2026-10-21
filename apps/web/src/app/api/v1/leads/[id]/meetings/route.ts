import { LeadMeetingCreateSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { createMeeting, listMeetings } from '@/server/services/meetings';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET /api/v1/leads/{id}/meetings — reuniões do lead (as mais recentes primeiro). */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => json({ data: await listMeetings(ctx, parseId(id)) }));

/** POST /api/v1/leads/{id}/meetings — marcar (e, se pedido, enviar o convite ao cliente). */
export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await parseJson(req, LeadMeetingCreateSchema);
  return json({ data: await createMeeting(ctx, parseId(id), input) }, { status: 201 });
});
