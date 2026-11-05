/**
 * Cartão de contacto partilhável: a página pública /cartao/<código>, o vCard
 * ("Guardar contacto") e o formulário "Deixe o seu contacto" (cria um lead).
 */
import { z } from 'zod';

export const BUSINESS_CARD_BIO_MAX = 300;

export const BusinessCardSchema = z
  .object({
    enabled: z.boolean(),
    token: z.string().nullable().meta({ description: 'Código do link (/cartao/<código>); null = ainda não criado' }),
    bio: z.string().nullable().meta({ description: 'Frase de apresentação' }),
    views: z.int().meta({ description: 'Quantas vezes o cartão foi aberto' }),
    url: z.string().nullable().meta({ description: 'Endereço do cartão' }),
    qr_svg: z.string().nullable().meta({ description: 'Código QR do endereço (SVG)' }),
  })
  .meta({ id: 'BusinessCard' });
export type BusinessCard = z.infer<typeof BusinessCardSchema>;

export const BusinessCardUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    bio: z
      .string()
      .trim()
      .max(BUSINESS_CARD_BIO_MAX, { error: `Máximo de ${BUSINESS_CARD_BIO_MAX} caracteres.` })
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
    rotate: z.boolean().optional().meta({ description: 'Trocar o código (o link antigo deixa de funcionar)' }),
  })
  .meta({ id: 'BusinessCardUpdate' });
export type BusinessCardUpdate = z.output<typeof BusinessCardUpdateSchema>;

/** O que a página pública mostra. */
export interface PublicBusinessCard {
  full_name: string;
  role_title: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  portfolio_url: string | null;
  bio: string | null;
  photo: boolean;
  logo: boolean;
}

export const CardContactSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'Indique o seu nome.' }).max(120),
    company: z.string().trim().max(200).optional().transform((v) => v || undefined),
    email: z.string().trim().max(200).optional().transform((v) => v || undefined),
    phone: z.string().trim().max(40).optional().transform((v) => v || undefined),
    message: z.string().trim().max(2000).optional().transform((v) => v || undefined),
    _gotcha: z.string().optional(),
  })
  .refine((v) => v.email || v.phone, { error: 'Indique o email ou o telefone.', path: ['email'] })
  .meta({ id: 'CardContact' });
export type CardContact = z.output<typeof CardContactSchema>;

/** Texto num vCard: \, ; , e mudanças de linha escapados. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([;,])/g, '\\$1');

/** vCard 3.0 (abre nos contactos do telemóvel e do computador). */
export function buildCardVCard(card: Pick<PublicBusinessCard, 'full_name' | 'role_title' | 'company' | 'phone' | 'email' | 'website' | 'portfolio_url' | 'bio'>): string {
  const parts = card.full_name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : '';
  const first = parts.join(' ');
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(last)};${esc(first)};;;`,
    `FN:${esc(card.full_name.trim())}`,
    card.company ? `ORG:${esc(card.company)}` : null,
    card.role_title ? `TITLE:${esc(card.role_title)}` : null,
    card.phone ? `TEL;TYPE=CELL:${esc(card.phone)}` : null,
    card.email ? `EMAIL;TYPE=INTERNET:${esc(card.email)}` : null,
    card.website ? `URL:${esc(card.website)}` : null,
    card.portfolio_url && card.portfolio_url.replace(/\/$/, '') !== card.website?.replace(/\/$/, '') ? `URL;TYPE=portefolio:${esc(card.portfolio_url)}` : null,
    card.bio ? `NOTE:${esc(card.bio)}` : null,
    'END:VCARD',
  ].filter((l): l is string => l !== null);
  return `${lines.join('\r\n')}\r\n`;
}
