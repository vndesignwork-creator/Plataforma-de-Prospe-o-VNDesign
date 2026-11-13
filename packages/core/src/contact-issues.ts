/**
 * Contactos a corrigir (Leads → Contactos a corrigir): emails que voltaram para trás ou de
 * domínios que não recebem emails, telefones com dígitos a mais ou a menos, e o mesmo
 * telefone em leads diferentes.
 */
import { z } from 'zod';
import { phoneKey } from './contact-finder';

/** Os números de um campo "Telefone" ("912 345 678 / 213 456 789" → dois). */
export function splitPhones(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[/,;|]|\s+ou\s+|\s+e\s+/i)
    .map((p) => p.trim())
    .filter((p) => /\d/.test(p));
}

/**
 * O que está mal num número (null = parece bem). Portugueses: 9 dígitos a começar por 2, 3,
 * 7, 8 ou 9 (com ou sem +351). Estrangeiros (+ outro indicativo): 8 a 15 dígitos.
 */
export function phoneProblem(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, '');
  if (/[^\d+]/.test(compact)) return 'tem letras ou símbolos';
  const international = compact.startsWith('+') || compact.startsWith('00');
  const digits = compact.replace(/\D/g, '');
  if (international && !/^(\+|00)351/.test(compact)) {
    return digits.length - (compact.startsWith('00') ? 2 : 0) >= 8 && digits.length <= 17 ? null : 'número estrangeiro com dígitos a menos ou a mais';
  }
  const key = phoneKey(compact);
  if (key.length < 9) return `tem ${key.length} ${key.length === 1 ? 'dígito' : 'dígitos'} (um número português tem 9)`;
  if (key.length > 9) return `tem ${key.length} dígitos (um número português tem 9)`;
  if (!/^[23789]/.test(key)) return 'não começa por 2, 3, 7, 8 ou 9';
  return null;
}

export const CONTACT_ISSUE_KINDS = ['email_bounced', 'email_domain', 'email_invalid', 'phone_invalid', 'phone_shared'] as const;
export type ContactIssueKind = (typeof CONTACT_ISSUE_KINDS)[number];

export const ContactIssueSchema = z.object({
  kind: z.enum(CONTACT_ISSUE_KINDS),
  field: z.enum(['email', 'phone']),
  message: z.string(),
  /** Com phone_shared: o outro lead com o mesmo número. */
  other: z.object({ id: z.uuid(), number: z.int(), company_name: z.string() }).nullable().optional(),
});
export type ContactIssue = z.infer<typeof ContactIssueSchema>;

export const ContactIssuesSchema = z
  .object({
    leads: z.array(
      z.object({
        lead: z.object({ id: z.uuid(), number: z.int(), company_name: z.string(), email: z.string().nullable(), phone: z.string().nullable() }),
        issues: z.array(ContactIssueSchema),
      }),
    ),
    /** Domínios de email verificados agora (os restantes ficam para a próxima vez). */
    domains_checked: z.int(),
    domains_pending: z.int(),
  })
  .meta({ id: 'ContactIssues' });
export type ContactIssues = z.infer<typeof ContactIssuesSchema>;
