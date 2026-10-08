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
