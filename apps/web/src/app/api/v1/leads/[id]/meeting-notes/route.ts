import { MeetingNotesInputSchema } from '@vndesign/core';
import { apiRoute, json, parseId, parseJson } from '@/server/http';
import { summarizeMeetingNotes } from '@/server/services/meeting-notes';

export const maxDuration = 60;
type Params = { id: string };

/** POST /api/v1/leads/{id}/meeting-notes — a IA resume os apontamentos e propõe tarefas e o próximo passo (não grava). */
export const POST = apiRoute<Params>(async (req, ctx, { id }) => {
  const { notes } = await parseJson(req, MeetingNotesInputSchema);
  return json({ data: await summarizeMeetingNotes(ctx, parseId(id), notes) });
});
