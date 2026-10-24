/**
 * Sessão de prospeção: os leads a contactar agora, numa lista (quem abriu
 * um email, follow-ups em atraso ou para hoje e leads por contactar), e o
 * resultado de cada contacto registado com um toque.
 */
import { z } from 'zod';
import { LOST_REASONS } from './enums';
import { SEQUENCE_CHANNELS } from './prospecting-sequence';
import { LeadSchema } from './schemas';

export const PROSPECTING_FILTERS = ['all', 'opened', 'follow_up', 'new'] as const;
export type ProspectingFilter = (typeof PROSPECTING_FILTERS)[number];
export const PROSPECTING_FILTER_LABELS: Record<ProspectingFilter, string> = {
  all: 'Todos',
  opened: 'Abriram o email',
  follow_up: 'Follow-ups',
  new: 'Por contactar',
};

export const PROSPECTING_OUTCOMES = ['no_answer', 'contacted', 'interested', 'later', 'not_interested'] as const;
export type ProspectingOutcome = (typeof PROSPECTING_OUTCOMES)[number];
export const PROSPECTING_OUTCOME_LABELS: Record<ProspectingOutcome, string> = {
  no_answer: 'Não atendeu',
  contacted: 'Contactado',
  interested: 'Interessado',
  later: 'Mais tarde',
  not_interested: 'Sem interesse',
};

export const ProspectingOutcomeSchema = z
  .object({
    outcome: z.enum(PROSPECTING_OUTCOMES),
    note: z.string().trim().max(2000, { error: 'Máximo de 2000 caracteres.' }).optional().transform((v) => v || null),
    /** "Mais tarde": daqui a quantos dias (por omissão 3). */
    days: z.int().min(1, { error: 'Mínimo 1 dia.' }).max(60, { error: 'Máximo 60 dias.' }).optional(),
    /** "Sem interesse": porquê (vai para o lead e para as Estatísticas). */
    lost_reason: z.enum(LOST_REASONS, { error: 'Motivo inválido.' }).nullable().optional(),
    /** "Sem interesse" com "Agora não": dia em que volta à prospeção. */
    retry_on: z.iso.date({ error: 'Data inválida.' }).nullable().optional(),
  })
  .meta({ id: 'ProspectingOutcome' });
export type ProspectingOutcomeInput = z.output<typeof ProspectingOutcomeSchema>;

export const ProspectingItemSchema = z
  .object({
    lead: LeadSchema,
    kind: z.enum(['opened', 'follow_up', 'new']),
    reason: z.string().meta({ description: 'Porque está na lista (ex.: "Abriu o email há 2 h")' }),
    /** Quantas vezes já se carregou em "Não atendeu" e "Contactado" na Prospeção (e as tentativas seguidas sem resposta). */
    attempts: z.object({ no_answer: z.int(), contacted: z.int(), no_answer_streak: z.int() }).optional(),
    /** Com a sequência multicanal ligada: o passo a fazer agora. */
    sequence: z
      .object({ step: z.int(), total: z.int(), day: z.int(), channel: z.enum(SEQUENCE_CHANNELS), template_id: z.uuid().nullable() })
      .nullable()
      .optional(),
  })
  .meta({ id: 'ProspectingItem' });
export type ProspectingItem = z.infer<typeof ProspectingItemSchema>;

export const ProspectingQueueSchema = z
  .object({
    items: z.array(ProspectingItemSchema),
    done_today: z.int().meta({ description: 'Contactos registados hoje na sessão de prospeção' }),
  })
  .meta({ id: 'ProspectingQueue' });
export type ProspectingQueue = z.infer<typeof ProspectingQueueSchema>;

export const ProspectingResultSchema = z
  .object({ lead: LeadSchema, done_today: z.int() })
  .meta({ id: 'ProspectingResult' });
export type ProspectingResult = z.infer<typeof ProspectingResultSchema>;

/** "há 5 min", "há 2 h", "há 3 dias" (para o motivo na lista). */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d === 1 ? '' : 's'}`;
}

/** À 3.ª vez seguida sem atender, a Prospeção sugere passar a "Sem interesse" (Não responde). */
export const NO_ANSWER_LIMIT = 3;

export type ProspectingAttempts = { no_answer: number; contacted: number; no_answer_streak: number };

/**
 * Contagem dos resultados registados na Prospeção (do mais antigo para o mais
 * recente): "Não atendeu", "Contactado" e as vezes seguidas sem resposta (desde
 * o último resultado que não foi "Não atendeu").
 */
export function countAttempts(outcomes: readonly string[]): ProspectingAttempts {
  let noAnswer = 0;
  let contacted = 0;
  let streak = 0;
  for (const o of outcomes) {
    if (o === 'no_answer') {
      noAnswer++;
      streak++;
    } else {
      if (o === 'contacted') contacted++;
      streak = 0;
    }
  }
  return { no_answer: noAnswer, contacted, no_answer_streak: streak };
}
