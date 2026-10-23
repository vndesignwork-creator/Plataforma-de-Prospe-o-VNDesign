/**
 * Sequência multicanal da Prospeção (ex.: dia 0 WhatsApp, dia 3 email, dia 7
 * ligar): os passos ficam nas definições; cada lead avança um passo de cada vez
 * que se regista "Contactado" na sessão de prospeção.
 */
import { z } from 'zod';
import { addDays } from './format';

export const SEQUENCE_CHANNELS = ['whatsapp', 'email', 'call', 'dm'] as const;
export type SequenceChannel = (typeof SEQUENCE_CHANNELS)[number];
export const SEQUENCE_CHANNEL_LABELS: Record<SequenceChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  call: 'Ligar',
  dm: 'Mensagem nas redes',
};
/** Que tipos de modelo servem a cada canal (o 1.º é o preferido). */
export const SEQUENCE_CHANNEL_KINDS: Record<SequenceChannel, readonly string[]> = {
  whatsapp: ['whatsapp', 'short_message'],
  email: ['cold_email', 'follow_up', 'general_email'],
  call: ['call_script'],
  dm: ['social_dm', 'short_message'],
};

export const SEQUENCE_MAX_STEPS = 8;

export const ProspectingSequenceStepSchema = z.object({
  day: z.int().min(0, { error: 'O dia não pode ser negativo.' }).max(120, { error: 'No máximo 120 dias.' }),
  channel: z.enum(SEQUENCE_CHANNELS),
  /** Modelo de mensagem/script deste passo (null = o primeiro modelo do canal). */
  template_id: z.uuid().nullable().default(null),
});
export type ProspectingSequenceStep = z.infer<typeof ProspectingSequenceStepSchema>;

export const DEFAULT_PROSPECTING_SEQUENCE = {
  enabled: false,
  steps: [
    { day: 0, channel: 'whatsapp', template_id: null },
    { day: 3, channel: 'email', template_id: null },
    { day: 7, channel: 'call', template_id: null },
    { day: 14, channel: 'email', template_id: null },
  ] as ProspectingSequenceStep[],
};

export const ProspectingSequenceSchema = z.object({
  enabled: z.boolean().default(false),
  steps: z
    .array(ProspectingSequenceStepSchema)
    .min(1, { error: 'Pelo menos um passo.' })
    .max(SEQUENCE_MAX_STEPS, { error: `No máximo ${SEQUENCE_MAX_STEPS} passos.` })
    .refine((steps) => steps.every((s, i) => i === 0 || s.day > steps[i - 1]!.day), { error: 'Os dias têm de ir aumentando (ex.: 0, 3, 7).' })
    .default(DEFAULT_PROSPECTING_SEQUENCE.steps),
});
export type ProspectingSequence = z.infer<typeof ProspectingSequenceSchema>;

/** "Passo 2 de 4: Email (dia 3)" */
export function sequenceStepText(seq: Pick<ProspectingSequence, 'steps'>, index: number): string {
  const step = seq.steps[index];
  if (!step) return 'Sequência terminada';
  return `Passo ${index + 1} de ${seq.steps.length}: ${SEQUENCE_CHANNEL_LABELS[step.channel]} (dia ${step.day})`;
}

/**
 * Depois de fazer o passo `done` (índice), o que vem a seguir: o próximo passo
 * na data certa (diferença de dias entre passos) ou, no fim, ligar/arquivar.
 */
export function planSequenceAdvance(seq: Pick<ProspectingSequence, 'steps'>, done: number, today: string): { step: number; on: string; text: string } {
  const next = seq.steps[done + 1];
  if (!next) return { step: seq.steps.length, on: addDays(today, 7), text: 'Sequência terminada sem resposta: tentar mais tarde ou marcar Sem interesse' };
  const gap = Math.max(1, next.day - (seq.steps[done]?.day ?? 0));
  return { step: done + 1, on: addDays(today, gap), text: sequenceStepText(seq, done + 1) };
}

