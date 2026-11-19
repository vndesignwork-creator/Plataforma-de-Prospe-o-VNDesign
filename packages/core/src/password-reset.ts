/**
 * Recuperar a palavra-passe: o texto do email (em português) e as regras da
 * nova palavra-passe. O link é gerado e enviado pela própria plataforma, por
 * isso o email tem a nossa cara e não fica preso ao limite de envios do
 * serviço de autenticação.
 */
import { plainTextToHtml } from './mail';

/** Quanto tempo o link serve (é o que o Supabase usa por omissão). */
export const PASSWORD_RESET_HOURS = 1;

/** O mesmo mínimo do serviço de autenticação. */
export const PASSWORD_MIN_LENGTH = 8;

export function buildPasswordResetEmail(input: { link: string; name?: string | null }): { subject: string; text: string; html: string } {
  const text =
    `${input.name ? `Olá ${input.name},` : 'Olá,'}\n\n` +
    'Pediste uma nova palavra-passe para a VNDesign Leads. Carrega no link para a definires:\n\n' +
    `${input.link}\n\n` +
    `O link serve durante ${PASSWORD_RESET_HOURS} hora e só pode ser usado uma vez.\n\n` +
    'Se não foste tu, não precisas de fazer nada: a palavra-passe fica como está.';
  return { subject: 'Nova palavra-passe · VNDesign Leads', text, html: plainTextToHtml(text) };
}

/** A mesma resposta exista ou não a conta (ninguém descobre que emails têm conta). */
export const PASSWORD_RESET_REPLY = 'Se existir uma conta com esse email, vais receber um link para definir a nova palavra-passe.';
