/**
 * Notas de reunião com IA: resume os apontamentos e propõe tarefas e o próximo
 * passo (usa o fornecedor do "Email com IA"). Não grava nada: a ficha mostra a
 * proposta e a pessoa escolhe o que fica.
 */
import { MEETING_NOTES_SYSTEM_PROMPT, MeetingNotesDraftSchema, buildMeetingNotesPrompt, meetingNotesResult, todayIso, type MeetingNotesResult } from '@vndesign/core';
import { aiModel } from '../ai/claude';
import { generateJson } from '../ai/generate';
import { resolveAiFeature } from '../ai/providers';
import type { ApiContext } from '../context';
import { ApiError } from '../http';
import { getLead } from './leads';
import { getSettings } from './workspace';

export async function summarizeMeetingNotes(ctx: ApiContext, leadId: string, notes: string): Promise<MeetingNotesResult> {
  const lead = await getLead(ctx, leadId);
  if (lead.anonymized_at) throw new ApiError(422, 'Lead anonimizado');
  const settings = await getSettings(ctx);
  const { provider, model } = await resolveAiFeature(ctx, settings.ai.email, { anthropicModel: aiModel() });
  const today = todayIso();
  const { data, model: used } = await generateJson(provider, model, {
    system: MEETING_NOTES_SYSTEM_PROMPT,
    prompt: buildMeetingNotesPrompt({ company: lead.company_name, contact: lead.contact_name, today, notes }),
    schema: MeetingNotesDraftSchema,
    schemaName: 'notas_reuniao',
  });
  const result = meetingNotesResult(data, today, used);
  if (!result.summary) throw new ApiError(502, 'Resposta incompleta da IA', 'Tenta outra vez.');
  return result;
}
