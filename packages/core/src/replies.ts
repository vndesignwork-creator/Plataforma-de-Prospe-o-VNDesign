/**
 * Lista "Respostas": os emails que os leads enviaram (detetados na caixa de
 * entrada), com o que falta fazer — responder, ou nada (ausência, "sem
 * interesse", "removam-me", já respondido ou marcado como tratado).
 */
import { z } from 'zod';
import { LeadSchema } from './schemas';

export const REPLY_KINDS = ['reply', 'auto', 'not_interested', 'unsubscribe'] as const;
export type ReplyKind = (typeof REPLY_KINDS)[number];
export const REPLY_KIND_LABELS: Record<ReplyKind, string> = {
  reply: 'Resposta',
  auto: 'Resposta automática',
  not_interested: 'Sem interesse',
  unsubscribe: 'Pediu para não contactar',
};

export const RepliesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(60).catch(14).default(14),
});

export const ReplyItemSchema = z
  .object({
    id: z.uuid().meta({ description: 'A atividade "Resposta recebida"' }),
    lead: LeadSchema,
    from: z.string().nullable(),
    from_name: z.string().nullable(),
    subject: z.string(),
    received_at: z.string(),
    message_id: z.string().nullable().meta({ description: 'Message-ID do email (para responder na mesma conversa)' }),
    kind: z.enum(REPLY_KINDS),
    /** Resposta automática: até quando a pessoa está fora. */
    return_on: z.string().nullable(),
    /** Já respondido (email, chamada) ou marcado como tratado depois de chegar. */
    handled: z.boolean(),
  })
  .meta({ id: 'ReplyItem' });
export type ReplyItem = z.infer<typeof ReplyItemSchema>;

export const RepliesSchema = z
  .object({
    days: z.int(),
    items: z.array(ReplyItemSchema),
    pending: z.int().meta({ description: 'Respostas por responder' }),
  })
  .meta({ id: 'Replies' });
export type Replies = z.infer<typeof RepliesSchema>;

/** De que tipo é a resposta (pelo que a deteção leu: automática, "sem interesse", "removam-me"). */
export function replyKind(payload: { auto?: boolean; intent?: string | null }): ReplyKind {
  if (payload.auto) return 'auto';
  if (payload.intent === 'unsubscribe') return 'unsubscribe';
  if (payload.intent === 'not_interested') return 'not_interested';
  return 'reply';
}

/** Só as respostas "normais" ficam à espera de resposta. */
export const needsAnswer = (item: Pick<ReplyItem, 'kind' | 'handled'>) => item.kind === 'reply' && !item.handled;

/** Abre a conversa no Gmail (pesquisa pelo Message-ID); null sem Message-ID real. */
export function gmailSearchUrl(messageId: string | null | undefined): string | null {
  const id = messageId?.trim().replace(/^<|>$/g, '');
  if (!id || !id.includes('@') || id.includes('|')) return null;
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`rfc822msgid:${id}`)}`;
}
