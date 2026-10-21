/**
 * Enviar emails pela plataforma: a conta de envio de cada utilizador (Gmail,
 * Hostinger ou outro SMTP) e os pedidos de envio a um lead (com a proposta em
 * PDF, se for o caso).
 */
import { z } from 'zod';

export const MAIL_PROVIDERS = ['gmail', 'hostinger', 'custom'] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

export const MAIL_PROVIDER_PRESETS: Record<
  MailProvider,
  {
    label: string;
    host: string;
    port: number;
    secure: boolean;
    bccSelf: boolean;
    help: string;
    /** Caixa de entrada (IMAP), para detetar as respostas dos leads. */
    imapHost: string;
    imapPort: number;
  }
> = {
  gmail: {
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    // O Gmail guarda sozinho os enviados por SMTP na pasta "Enviados".
    bccSelf: false,
    help: 'Usa uma palavra-passe de aplicação (16 letras), não a palavra-passe normal: myaccount.google.com/apppasswords (precisa da verificação em dois passos ligada).',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
  },
  hostinger: {
    label: 'Email da Hostinger',
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    // A Hostinger não guarda os enviados por SMTP: recebes uma cópia oculta.
    bccSelf: true,
    help: 'A palavra-passe da caixa de correio (hPanel → Emails).',
    imapHost: 'imap.hostinger.com',
    imapPort: 993,
  },
  custom: {
    label: 'Outro (SMTP)',
    host: '',
    port: 587,
    secure: false,
    bccSelf: true,
    help: 'Os dados SMTP do teu serviço de email.',
    imapHost: '',
    imapPort: 993,
  },
};

/** Limite diário por omissão (protege a reputação do domínio). */
export const MAIL_DEFAULT_DAILY_LIMIT = 50;

export const MailAccountSchema = z
  .object({
    provider: z.enum(MAIL_PROVIDERS),
    from_name: z.string(),
    from_email: z.string(),
    smtp_host: z.string(),
    smtp_port: z.int(),
    smtp_secure: z.boolean(),
    smtp_user: z.string().nullable(),
    password_set: z.boolean().meta({ description: 'Tem palavra-passe guardada (nunca é devolvida)' }),
    daily_limit: z.int(),
    bcc_self: z.boolean(),
    sent_today: z.int().meta({ description: 'Emails enviados hoje pela plataforma' }),
    reply_detection: z.boolean().meta({ description: 'Detetar as respostas dos leads na caixa de entrada (IMAP)' }),
    imap_host: z.string().nullable(),
    imap_port: z.int().nullable(),
    imap_checked_at: z.string().nullable().meta({ description: 'Última leitura da caixa de entrada' }),
    imap_error: z.string().nullable().meta({ description: 'Erro da última leitura (null = correu bem)' }),
  })
  .meta({ id: 'MailAccount' });
export type MailAccount = z.infer<typeof MailAccountSchema>;

const emailField = z.email({ error: 'Email inválido.' }).trim().toLowerCase().max(254);

export const MailAccountUpsertSchema = z
  .object({
    provider: z.enum(MAIL_PROVIDERS, { error: 'Escolhe o serviço de email.' }),
    from_name: z.string().trim().min(1, { error: 'Indica o nome que o cliente vê.' }).max(120),
    from_email: emailField,
    smtp_host: z.string().trim().max(253).optional(),
    smtp_port: z.int().min(1).max(65535).optional(),
    smtp_secure: z.boolean().optional(),
    smtp_user: z.string().trim().max(254).nullish(),
    /** Vazio = manter a atual. O Gmail mostra-a com espaços ("abcd efgh …"): tiram-se. */
    password: z
      .string()
      .max(500)
      .optional()
      .transform((v) => (v ? v.replace(/\s+/g, '') : undefined)),
    daily_limit: z.int().min(1, { error: 'Mínimo 1.' }).max(500, { error: 'Máximo 500.' }).default(MAIL_DEFAULT_DAILY_LIMIT),
    bcc_self: z.boolean().optional(),
    reply_detection: z.boolean().optional(),
    /** Só no "Outro (SMTP)"; vazio = o servidor SMTP com "imap." em vez de "smtp.". */
    imap_host: z.string().trim().max(253).nullish(),
    imap_port: z.int().min(1).max(65535).nullish(),
  })
  .refine((v) => v.provider !== 'custom' || !!v.smtp_host, { error: 'Indica o servidor SMTP.', path: ['smtp_host'] })
  .meta({ id: 'MailAccountUpsert' });
export type MailAccountUpsert = z.output<typeof MailAccountUpsertSchema>;

const subjectField = z.string().trim().min(1, { error: 'Escreve o assunto.' }).max(300, { error: 'Máximo de 300 caracteres.' });
const bodyField = z.string().trim().min(1, { error: 'Escreve a mensagem.' }).max(20_000, { error: 'Mensagem demasiado longa.' });

export const LeadEmailSendSchema = z
  .object({
    to: emailField,
    subject: subjectField,
    body: bodyField,
    /** Cópia oculta para o próprio (por omissão, a definição da conta). */
    bcc_self: z.boolean().optional(),
    /** Nome do modelo/origem, para a linha do tempo (ex.: "Email de prospeção — Design Gráfico"). */
    template: z.string().trim().max(160).optional(),
    /** Levar em anexo o relatório de diagnóstico do site (PDF). */
    attach_diagnosis: z.boolean().optional(),
    /** Message-ID do email a que este responde (follow-up na mesma conversa). */
    in_reply_to: z.string().trim().max(500).optional(),
  })
  .meta({ id: 'LeadEmailSend' });
export type LeadEmailSend = z.output<typeof LeadEmailSendSchema>;

export const LeadEmailSendResultSchema = z
  .object({
    sent_to: z.string(),
    status_changed: z.boolean().meta({ description: 'O lead passou a "Contactado" (ou "Proposta enviada")' }),
    next_action_on: z.string().nullable(),
    sent_today: z.int(),
    daily_limit: z.int(),
    follow_up_step: z.int().nullable().optional().meta({ description: 'Follow-up da sequência que este email fez (1, 2, 3…)' }),
    next_action_text: z.string().nullable().optional(),
  })
  .meta({ id: 'LeadEmailSendResult' });

export const FollowUpDraftSchema = z
  .object({
    step: z.int().meta({ description: 'Número deste follow-up (1, 2, 3…)' }),
    total: z.int().meta({ description: 'Follow-ups na sequência' }),
    to: z.string().nullable(),
    subject: z.string(),
    body: z.string(),
    template_id: z.uuid().nullable(),
    template_name: z.string().nullable(),
    in_reply_to: z.string().nullable().meta({ description: 'Último email enviado pela plataforma (mesma conversa)' }),
  })
  .meta({ id: 'FollowUpDraft' });
export type FollowUpDraft = z.infer<typeof FollowUpDraftSchema>;
export type LeadEmailSendResult = z.infer<typeof LeadEmailSendResultSchema>;

export const ReplyCheckResultSchema = z
  .object({
    checked: z.int().meta({ description: 'Emails novos lidos na caixa de entrada' }),
    replies: z
      .array(z.object({ lead_id: z.uuid(), company_name: z.string(), from: z.string(), subject: z.string(), status_changed: z.boolean() }))
      .meta({ description: 'Respostas de leads encontradas' }),
  })
  .meta({ id: 'ReplyCheckResult' });
export type ReplyCheckResult = z.infer<typeof ReplyCheckResultSchema>;

/** Texto simples → HTML simples (parágrafos, quebras de linha e ligações clicáveis). */
export function plainTextToHtml(text: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const linkify = (s: string) =>
    s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}">${url}</a>`);
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 1em">${linkify(escape(p)).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

// -----------------------------------------------------------------------------
// Deteção de respostas (caixa de entrada)
// -----------------------------------------------------------------------------

/** Um email da caixa de entrada (só o cabeçalho: nunca se lê o texto). */
export interface InboxMessage {
  from: string;
  fromName: string | null;
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  date: string;
  /** "Auto-Submitted" ou assunto de ausência/férias: não conta como resposta. */
  auto: boolean;
}

export interface ReplyCandidate {
  id: string;
  email: string | null;
}

const AUTO_SUBJECT =
  /^(resposta autom[aá]tica|automatic reply|auto(matic)?[- ]?reply|out of (the )?office|aus[eê]ncia|f[eé]rias|delivery status notification|undeliverable|returned mail|n[aã]o entregue)/i;
const SYSTEM_SENDER = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/i;

export function isAutoReply(subject: string, autoSubmittedHeader?: string | null): boolean {
  const header = autoSubmittedHeader?.trim().toLowerCase();
  if (header && header !== 'no') return true;
  return AUTO_SUBJECT.test(subject.replace(/^(re|res|fwd?|enc)\s*:\s*/i, '').trim());
}

const lower = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
const domainOf = (email: string) => email.split('@')[1] ?? '';

/**
 * A que lead pertence um email recebido: resposta a um email enviado pela
 * plataforma (In-Reply-To), o mesmo endereço do lead ou, num domínio de
 * empresa (não gmail/hotmail…), o mesmo domínio — só se houver um único lead.
 */
export function matchReplyToLead(
  message: Pick<InboxMessage, 'from' | 'inReplyTo'>,
  leads: readonly ReplyCandidate[],
  sentMessageIds: ReadonlyMap<string, string>,
  isGenericDomain: (domain: string) => boolean,
): string | null {
  const from = lower(message.from);
  if (!from || SYSTEM_SENDER.test(from)) return null;
  const replyTo = message.inReplyTo?.trim();
  if (replyTo) {
    const leadId = sentMessageIds.get(replyTo) ?? sentMessageIds.get(replyTo.replace(/^<|>$/g, ''));
    if (leadId) return leadId;
  }
  const exact = leads.find((l) => lower(l.email) === from);
  if (exact) return exact.id;
  const domain = domainOf(from);
  if (!domain || isGenericDomain(domain)) return null;
  const sameDomain = leads.filter((l) => l.email && domainOf(lower(l.email)) === domain);
  return sameDomain.length === 1 ? sameDomain[0]!.id : null;
}
