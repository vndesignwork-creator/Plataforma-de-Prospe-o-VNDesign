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
  { label: string; host: string; port: number; secure: boolean; bccSelf: boolean; help: string }
> = {
  gmail: {
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    // O Gmail guarda sozinho os enviados por SMTP na pasta "Enviados".
    bccSelf: false,
    help: 'Usa uma palavra-passe de aplicação (16 letras), não a palavra-passe normal: myaccount.google.com/apppasswords (precisa da verificação em dois passos ligada).',
  },
  hostinger: {
    label: 'Email da Hostinger',
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    // A Hostinger não guarda os enviados por SMTP: recebes uma cópia oculta.
    bccSelf: true,
    help: 'A palavra-passe da caixa de correio (hPanel → Emails).',
  },
  custom: {
    label: 'Outro (SMTP)',
    host: '',
    port: 587,
    secure: false,
    bccSelf: true,
    help: 'Os dados SMTP do teu serviço de email.',
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
  })
  .meta({ id: 'LeadEmailSendResult' });
export type LeadEmailSendResult = z.infer<typeof LeadEmailSendResultSchema>;

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
