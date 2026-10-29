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

/** Endereço do webmail escolhido em Definições → Email (preferência de cada pessoa; vazio = o do serviço). */
export const WEBMAIL_PREFERENCE = 'mail.webmail';

/** Um endereço de webmail válido (https://…) ou null. */
export function parseWebmailUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Webmails conhecidos, pelo servidor de email (contas "Outro serviço"). */
const KNOWN_WEBMAILS: { match: RegExp; url: string; name: string }[] = [
  { match: /outlook|office365|hotmail|live\.com/i, url: 'https://outlook.live.com/mail/', name: 'Outlook' },
  { match: /sapo\.pt/i, url: 'https://mail.sapo.pt/', name: 'SAPO Mail' },
  { match: /zoho/i, url: 'https://mail.zoho.eu/', name: 'Zoho Mail' },
  { match: /yahoo/i, url: 'https://mail.yahoo.com/', name: 'Yahoo Mail' },
  { match: /icloud|me\.com/i, url: 'https://www.icloud.com/mail', name: 'iCloud Mail' },
  { match: /hostinger/i, url: 'https://mail.hostinger.com/', name: 'Hostinger Mail' },
  { match: /gmail|google/i, url: 'https://mail.google.com/mail/u/0/#inbox', name: 'Gmail' },
];

/**
 * Onde abrir a resposta: o webmail escolhido pela pessoa; senão, o do serviço
 * (no Gmail, a própria conversa); senão, um webmail conhecido pelo servidor.
 * null = sem webmail (o botão não aparece).
 */
export function webmailLink(
  account: { provider: string; smtp_host?: string | null; imap_host?: string | null } | null | undefined,
  custom: unknown,
  messageId: string | null | undefined,
): { url: string; label: string } | null {
  const chosen = parseWebmailUrl(custom);
  if (chosen) {
    const known = KNOWN_WEBMAILS.find((w) => w.match.test(chosen));
    if (known?.name === 'Gmail') return { url: gmailSearchUrl(messageId) ?? chosen, label: 'Abrir no Gmail' };
    return { url: chosen, label: known ? `Abrir no ${known.name}` : `Abrir em ${new URL(chosen).hostname.replace(/^www\./, '')}` };
  }
  if (!account) return null;
  if (account.provider === 'gmail') return { url: gmailSearchUrl(messageId) ?? 'https://mail.google.com/mail/u/0/#inbox', label: 'Abrir no Gmail' };
  if (account.provider === 'hostinger') return { url: 'https://mail.hostinger.com/', label: 'Abrir no Hostinger Mail' };
  const host = `${account.imap_host ?? ''} ${account.smtp_host ?? ''}`;
  const known = KNOWN_WEBMAILS.find((w) => w.match.test(host));
  return known ? { url: known.url, label: `Abrir no ${known.name}` } : null;
}
