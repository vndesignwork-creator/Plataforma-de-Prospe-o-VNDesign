/**
 * Envio de email por SMTP (ex.: email da Hostinger, Gmail com palavra-passe de
 * aplicação, Resend SMTP). Em desenvolvimento, o Mailpit do Supabase local
 * (SMTP_HOST=127.0.0.1, SMTP_PORT=54325) mostra os emails em http://127.0.0.1:54324.
 */
import nodemailer from 'nodemailer';

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  if (!isMailConfigured()) throw new Error('O envio de email não está configurado (SMTP_HOST).');
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const from = process.env.SMTP_FROM ?? (process.env.SMTP_USER ? `VNDesign Leads <${process.env.SMTP_USER}>` : 'VNDesign Leads <leads@localhost>');
  await transport.sendMail({ from, ...message });
}

/** Conta SMTP de um utilizador (Definições → Email de envio), já com a palavra-passe aberta. */
export interface SmtpAccount {
  fromName: string;
  fromEmail: string;
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
}

/** Envia pela caixa de correio do utilizador (as respostas voltam para ela). */
export async function sendWithAccount(
  account: SmtpAccount,
  message: {
    to: string;
    bcc?: string;
    subject: string;
    text: string;
    html: string;
    attachments?: { filename: string; content: Buffer; contentType: string }[];
    /** Resposta a este Message-ID (o cliente de email junta-os na mesma conversa). */
    inReplyTo?: string;
  },
) {
  const transport = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: account.user ? { user: account.user, pass: account.password ?? '' } : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
  const from = { name: account.fromName, address: account.fromEmail };
  const { inReplyTo, ...rest } = message;
  return transport.sendMail({ from, replyTo: from, ...rest, ...(inReplyTo ? { inReplyTo, references: [inReplyTo] } : {}) });
}
